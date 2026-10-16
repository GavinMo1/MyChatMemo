// 同步引擎：局部快照只合并可确认的重叠与尾部，完整快照才允许删除。
import { db, type ChatMemoryDB } from './database';
import type { Message, SyncMessagesPayload, RawMessage, ConversationMeta, Platform } from '@/types';
import { generateMessageId, generateTitleFromContent, countWords } from '@/shared/utils';
import { ANCHOR_SAMPLE_COUNT, DEFAULT_CONVERSATION_TITLE } from '@/shared/constants';
import { findAnchorFast, generateFingerprint } from './anchorMatcher';

// Service Worker 内所有 SyncEngine 实例共享队列，不依赖各标签页的去重状态。
const conversationQueues = new Map<string, Promise<void>>();
type SyncResult = { saved: boolean; messageCount: number };

export class SyncEngine {
  constructor(private readonly database: ChatMemoryDB = db) {}

  handleSync(payload: SyncMessagesPayload): Promise<SyncResult> {
    const key = `${this.database.name}\0${payload.conversationId}`;
    const previous = conversationQueues.get(key) ?? Promise.resolve();
    const result = previous.then(() => this.syncInTransaction(payload));
    const tail = result.then(
      () => undefined,
      () => undefined
    );
    conversationQueues.set(key, tail);
    void tail.then(() => {
      if (conversationQueues.get(key) === tail) conversationQueues.delete(key);
    });
    return result;
  }

  private syncInTransaction(payload: SyncMessagesPayload): Promise<SyncResult> {
    const database = this.database;
    return database.transaction(
      'rw',
      [database.conversations, database.messages, database.searchIndex],
      async () => {
        const { conversationId, currentMessages, title, url } = payload;
        const existing = await database.getConversation(conversationId);
        const stored = await database.getMessages(conversationId);
        if (!currentMessages.length) return { saved: false, messageCount: stored.length };
        if (existing && existing.platform !== payload.platform) {
          throw new Error('对话平台与已保存记录不一致，已保留历史内容。');
        }

        let corrected: RawMessage[];
        const complete = payload.snapshot === 'complete';
        if (!stored.length || complete) {
          corrected = currentMessages.map((message, position) => ({ ...message, position }));
        } else {
          const anchor = this.findAnchor(currentMessages, stored);
          if (!anchor.found) {
            throw new Error('当前页面内容无法唯一定位到已保存历史，已停止同步并保留历史内容。');
          }
          corrected = currentMessages.map((message, index) => ({
            ...message,
            position: anchor.storedPosition + index,
          }));
          this.assertSafePartial(corrected, stored);
        }

        const { toUpsert, toDeleteIds } = this.diffMessages(
          corrected,
          stored,
          conversationId,
          complete
        );
        const needsTitle =
          existing && (!existing.title || existing.title === DEFAULT_CONVERSATION_TITLE) && title;
        if (
          existing &&
          !toUpsert.length &&
          !toDeleteIds.length &&
          !needsTitle &&
          existing.url === url
        ) {
          return { saved: false, messageCount: stored.length };
        }

        const now = new Date().toISOString();
        const conversation: ConversationMeta = existing
          ? { ...existing, title: needsTitle ? title : existing.title, url, updatedAt: now }
          : {
              id: conversationId,
              platform: payload.platform as Platform,
              title:
                title ||
                generateTitleFromContent(
                  currentMessages.find((message) => message.sender === 'user')?.content ||
                    DEFAULT_CONVERSATION_TITLE
                ),
              url,
              folderId: null,
              createdAt: now,
              updatedAt: now,
              isArchived: false,
              stats: { messageCount: 0, lastSyncedAt: Date.now() },
            };
        await database.upsertConversation(conversation);
        await database.applyMessages(conversationId, toUpsert, toDeleteIds);
        await database.refreshSearchIndex(conversationId);
        return { saved: true, messageCount: await database.countMessages(conversationId) };
      }
    );
  }

  private findAnchor(current: RawMessage[], stored: Message[]) {
    const identity = (message: RawMessage | Message) =>
      JSON.stringify([message.sender, generateFingerprint(message.content)]);
    const result = findAnchorFast(
      current.slice(0, ANCHOR_SAMPLE_COUNT).map(identity),
      stored.map((message) => ({ content: identity(message), position: message.metadata.position }))
    );
    if (result)
      return { found: true, storedPosition: result.storedPosition, matchSize: result.anchorSize };
    return { found: false, storedPosition: 0, matchSize: 0 };
  }

  private assertSafePartial(current: RawMessage[], stored: Message[]): void {
    const byPosition = new Map(stored.map((message) => [message.metadata.position, message]));
    const lastPosition = stored[stored.length - 1].metadata.position;
    for (const raw of current) {
      if (raw.position > lastPosition) continue;
      const previous = byPosition.get(raw.position);
      // 空洞不能当成数组下标压缩；中段内容变化无法区分编辑、分支或漏采。
      // 末条同角色的变化允许流式续写，其余冲突要求完整快照。
      if (
        !previous ||
        previous.sender !== raw.sender ||
        (previous.content !== raw.content &&
          (raw.position !== lastPosition ||
            (!this.isStreamingExtension(previous.content, raw.content) &&
              !this.isStreamingExtension(raw.content, previous.content))))
      ) {
        throw new Error('局部页面内容与历史位置不一致，已停止同步并保留历史内容。');
      }
    }
  }

  private isStreamingExtension(previous: string, next: string): boolean {
    if (next.startsWith(previous)) return true;
    // DOM → Markdown 会给尚在输出的 <pre> 自动补结尾围栏。
    // 仅移除已配对的最后一个围栏，已采集的代码正文仍须逐字符保留。
    if (previous.endsWith('\n```')) {
      const fences = previous.match(/^```[^\n]*$/gm) ?? [];
      return (
        fences.length >= 2 && fences.length % 2 === 0 && next.startsWith(previous.slice(0, -4))
      );
    }
    // 加粗、斜体、删除线和行内代码也会在每次采样时自动补齐闭合标记。
    // 只接受已配对的末尾标记；正文和开头标记仍需完整保留。
    for (const marker of ['**', '~~', '``', '`', '*']) {
      if (!previous.endsWith(marker)) continue;
      const count = previous.split(marker).length - 1;
      if (count < 2 || count % 2 !== 0) continue;
      let prefix = previous.slice(0, -marker.length);
      if (marker === '``' && prefix.endsWith(' ')) prefix = prefix.slice(0, -1);
      if (next.startsWith(prefix)) return true;
    }
    return false;
  }

  private diffMessages(
    current: RawMessage[],
    stored: Message[],
    conversationId: string,
    allowDelete = true
  ): { toUpsert: Message[]; toDeleteIds: string[] } {
    const byPosition = new Map(stored.map((message) => [message.metadata.position, message]));
    const toUpsert: Message[] = [];
    const retainedIds = new Set<string>();
    for (const raw of current) {
      const previous = byPosition.get(raw.position);
      if (previous && previous.sender === raw.sender) {
        retainedIds.add(previous.id);
        // 多标签页旧快照可能晚到；局部快照不能把已保存的流式内容截短。
        if (
          !allowDelete &&
          previous.content !== raw.content &&
          this.isStreamingExtension(raw.content, previous.content)
        ) {
          continue;
        }
        const thinking =
          !allowDelete &&
          previous.thinking &&
          (raw.thinking === undefined || previous.thinking.startsWith(raw.thinking))
            ? previous.thinking
            : raw.thinking;
        if (previous.content !== raw.content || (previous.thinking ?? '') !== (thinking ?? '')) {
          toUpsert.push({
            ...previous,
            content: raw.content,
            thinking,
            updatedAt: new Date().toISOString(),
            metadata: { ...previous.metadata, wordCount: countWords(raw.content) },
          });
        }
      } else {
        const message = this.rawToMessage(raw, conversationId, raw.position);
        retainedIds.add(message.id);
        toUpsert.push(message);
      }
    }
    return {
      toUpsert,
      toDeleteIds: allowDelete
        ? stored.filter((message) => !retainedIds.has(message.id)).map((message) => message.id)
        : [],
    };
  }

  private rawToMessage(raw: RawMessage, conversationId: string, position: number): Message {
    const now = new Date().toISOString();
    return {
      id: generateMessageId(conversationId, raw.sender, position),
      conversationId,
      sender: raw.sender,
      content: raw.content,
      thinking: raw.thinking,
      createdAt: now,
      updatedAt: now,
      metadata: { position, wordCount: countWords(raw.content) },
    };
  }
}
