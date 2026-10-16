// src/background/database.ts
// IndexedDB 封装层，基于 Dexie.js

import Dexie, { type Table } from 'dexie';
import type { ConversationMeta, Message, Folder, SearchIndexRecord } from '@/types';

// ─────────────────────────────────────────
// Schema 定义（各版本共享，避免逐版本复制整段字面量）
// ─────────────────────────────────────────

const CONVERSATIONS_SCHEMA_V1 = 'id, platform, updatedAt, isArchived';
const CONVERSATIONS_SCHEMA = `${CONVERSATIONS_SCHEMA_V1}, folderId`;
const MESSAGES_SCHEMA = 'id, conversationId, sender, createdAt, [conversationId+metadata.position]';
const FOLDERS_SCHEMA = 'id, parentId, order';
const SEARCH_INDEX_SCHEMA = 'conversationId, updatedAt';
const CLASSIFICATION_CACHE_SCHEMA = 'conversationId, updatedAt';

const STORES_V2 = {
  conversations: CONVERSATIONS_SCHEMA,
  messages: MESSAGES_SCHEMA,
  folders: FOLDERS_SCHEMA,
};
const STORES_V3 = { ...STORES_V2, searchIndex: SEARCH_INDEX_SCHEMA };
const STORES_V4 = { ...STORES_V3, classificationCache: CLASSIFICATION_CACHE_SCHEMA };

// Export class for testability
export class ChatMemoryDB extends Dexie {
  conversations!: Table<ConversationMeta, string>;
  messages!: Table<Message, string>;
  folders!: Table<Folder, string>;
  searchIndex!: Table<SearchIndexRecord, string>;

  constructor(name = 'ChatMemoryDB') {
    super(name);
    this.version(1).stores({
      conversations: CONVERSATIONS_SCHEMA_V1,
      messages: MESSAGES_SCHEMA,
    });
    // v2: 添加 folders 表 + conversations.folderId 索引
    this.version(2)
      .stores(STORES_V2)
      .upgrade((tx) => {
        // 为已有 conversations 补充 folderId = null
        return tx
          .table('conversations')
          .toCollection()
          .modify((conv) => {
            if (conv.folderId === undefined) {
              conv.folderId = null;
            }
          });
      });
    this.version(3)
      .stores(STORES_V3)
      .upgrade(async (tx) => {
        const conversations = (await tx.table('conversations').toArray()) as ConversationMeta[];
        const messages = (await tx.table('messages').toArray()) as Message[];
        const grouped = new Map<string, Message[]>();

        for (const message of messages) {
          const bucket = grouped.get(message.conversationId) ?? [];
          bucket.push(message);
          grouped.set(message.conversationId, bucket);
        }

        const records = conversations.map((conv) =>
          this.buildSearchIndexRecord(conv, grouped.get(conv.id) ?? [])
        );
        if (records.length > 0) {
          await tx.table('searchIndex').bulkPut(records);
        }
      });
    this.version(4).stores(STORES_V4);
    this.version(5)
      .stores(STORES_V4)
      .upgrade(async (tx) => {
        await tx
          .table('conversations')
          .toCollection()
          .modify((conv) => {
            if ('tags' in conv) {
              delete conv.tags;
            }
          });
        await tx
          .table('classificationCache')
          .toCollection()
          .modify((record) => {
            if ('tags' in record) {
              delete record.tags;
            }
          });
      });
    // v6: Add independent conversationId index for messages to improve query performance
    this.version(6).stores(STORES_V4);
    // v7: 移除 AI 分类功能，删除分类缓存表
    this.version(7).stores({ classificationCache: null });
  }

  // ─────────────────────────────────────────
  // 对话 CRUD
  // ─────────────────────────────────────────

  async upsertConversation(conv: ConversationMeta): Promise<void> {
    await this.conversations.put(conv);
  }

  async getConversation(id: string): Promise<ConversationMeta | undefined> {
    return this.conversations.get(id);
  }

  async listConversations(platform?: string): Promise<ConversationMeta[]> {
    const query = platform
      ? this.conversations.where('platform').equals(platform)
      : this.conversations.toCollection();
    return query.sortBy('updatedAt').then((arr) => arr.reverse());
  }

  async deleteConversation(id: string): Promise<void> {
    await this.transaction(
      'rw',
      [this.conversations, this.messages, this.searchIndex],
      async () => {
        await this.conversations.delete(id);
        await this.messages.where('conversationId').equals(id).delete();
        await this.searchIndex.delete(id);
      }
    );
  }

  /** 批量删除多个对话及其消息 */
  async deleteConversations(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.transaction(
      'rw',
      [this.conversations, this.messages, this.searchIndex],
      async () => {
        await this.conversations.bulkDelete(ids);
        await this.searchIndex.bulkDelete(ids);
        // Optimized: use single bulkDelete with anyOf instead of loop
        await this.messages.where('conversationId').anyOf(ids).delete();
      }
    );
  }

  /** 将对话移入/移出文件夹 */
  async moveConversationsToFolder(convIds: string[], folderId: string | null): Promise<void> {
    await this.conversations.where('id').anyOf(convIds).modify({ folderId });
  }

  // ─────────────────────────────────────────
  // 消息操作
  // ─────────────────────────────────────────

  async getMessages(conversationId: string): Promise<Message[]> {
    return this.messages.where('conversationId').equals(conversationId).sortBy('metadata.position');
  }

  async countMessages(conversationId: string): Promise<number> {
    return this.messages.where('conversationId').equals(conversationId).count();
  }

  async deleteMessage(conversationId: string, messageId: string): Promise<void> {
    await this.transaction(
      'rw',
      [this.conversations, this.messages, this.searchIndex],
      async () => {
        const existingMessage = await this.messages.get(messageId);
        if (!existingMessage || existingMessage.conversationId !== conversationId) {
          return;
        }

        await this.messages.delete(messageId);

        const conversation = await this.conversations.get(conversationId);
        if (!conversation) {
          await this.searchIndex.delete(conversationId);
          return;
        }

        const remainingMessages = await this.messages
          .where('conversationId')
          .equals(conversationId)
          .sortBy('metadata.position');

        const updatedAt = new Date().toISOString();
        await this.conversations.update(conversationId, {
          updatedAt,
          'stats.lastSyncedAt': Date.now(),
          'stats.messageCount': remainingMessages.length,
        });

        await this.searchIndex.put(
          this.buildSearchIndexRecord({ ...conversation, updatedAt }, remainingMessages)
        );
      }
    );
  }

  /** 批量写入/更新消息，并同步更新对话元数据 */
  async applyMessages(
    conversationId: string,
    toUpsert: Message[],
    toDeleteIds: string[] = []
  ): Promise<void> {
    await this.transaction('rw', [this.conversations, this.messages], async () => {
      if (toUpsert.length > 0) {
        await this.messages.bulkPut(toUpsert);
      }
      if (toDeleteIds.length > 0) {
        await this.messages.bulkDelete(toDeleteIds);
      }

      const count = await this.messages.where('conversationId').equals(conversationId).count();
      await this.conversations.update(conversationId, {
        updatedAt: new Date().toISOString(),
        'stats.lastSyncedAt': Date.now(),
        'stats.messageCount': count,
      });
    });
  }

  // ─────────────────────────────────────────
  // 文件夹 CRUD
  // ─────────────────────────────────────────

  async createFolder(folder: Folder): Promise<void> {
    await this.folders.put(folder);
  }

  /** 创建文件夹：自动生成 ID 并追加到排序末尾 */
  async createFolderWithNextOrder(name: string, parentId: string | null): Promise<Folder> {
    const folders = await this.listFolders();
    const maxOrder = folders.length > 0 ? Math.max(...folders.map((f) => f.order)) : -1;
    const now = new Date().toISOString();
    const folder: Folder = {
      id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      parentId,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.createFolder(folder);
    return folder;
  }

  async getFolder(id: string): Promise<Folder | undefined> {
    return this.folders.get(id);
  }

  async findRootFolderByName(name: string): Promise<Folder | undefined> {
    return this.folders
      .filter((folder) => folder.parentId === null && folder.name === name)
      .first();
  }

  async listFolders(): Promise<Folder[]> {
    return this.folders.orderBy('order').toArray();
  }

  async updateFolder(
    id: string,
    changes: Partial<Pick<Folder, 'name' | 'parentId' | 'order'>>
  ): Promise<void> {
    await this.folders.update(id, { ...changes, updatedAt: new Date().toISOString() });
  }

  /** 删除文件夹，其中的对话移到"未分类"(folderId = null)，子文件夹提升到父级 */
  async deleteFolder(id: string): Promise<void> {
    await this.transaction('rw', [this.folders, this.conversations], async () => {
      const folder = await this.folders.get(id);
      const parentId = folder?.parentId ?? null;
      // 子文件夹提升到父级
      await this.folders.where('parentId').equals(id).modify({ parentId });
      // 文件夹内的对话移到未分类
      await this.conversations.where('folderId').equals(id).modify({ folderId: null });
      await this.folders.delete(id);
    });
  }

  // ─────────────────────────────────────────
  // 全文搜索
  // ─────────────────────────────────────────

  async refreshSearchIndex(conversationId: string): Promise<void> {
    const [ConversationMeta, messages] = await Promise.all([
      this.conversations.get(conversationId),
      this.getMessages(conversationId),
    ]);

    if (!ConversationMeta) {
      await this.searchIndex.delete(conversationId);
      return;
    }

    await this.searchIndex.put(this.buildSearchIndexRecord(ConversationMeta, messages));
  }

  async getSearchIndexRecord(conversationId: string): Promise<SearchIndexRecord | undefined> {
    return this.searchIndex.get(conversationId);
  }

  /**
   * 分页搜索。注意：当前实现会将 searchIndex 全量加载到内存后过滤，
   * 数据量为个人本地量级（数百对话）时无感知；若未来数据量增大需改为索引查询
   */
  async searchConversationsPaged(
    keyword: string,
    offset: number,
    limit: number,
    folderId: string | null,
    showAll: boolean
  ): Promise<{ items: ConversationMeta[]; total: number; hasMore: boolean }> {
    const normalizedKeyword = this.normalizeSearchText(keyword);
    if (!normalizedKeyword) {
      return { items: [], total: 0, hasMore: false };
    }

    const matchedIndices = await this.searchIndex
      .filter((entry) => entry.text.includes(normalizedKeyword))
      .toArray();

    if (matchedIndices.length === 0) {
      return { items: [], total: 0, hasMore: false };
    }

    const conversationIds = matchedIndices.map((entry) => entry.conversationId);
    const conversations = (await this.conversations.bulkGet(conversationIds))
      .filter((conv): conv is ConversationMeta => Boolean(conv))
      .filter((conv) => this.matchesFolderFilter(conv, folderId, showAll))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const total = conversations.length;
    const items = conversations.slice(offset, offset + limit);

    return {
      items,
      total,
      hasMore: offset + items.length < total,
    };
  }

  private buildSearchIndexRecord(
    ConversationMeta: ConversationMeta,
    messages: Message[]
  ): SearchIndexRecord {
    const textParts = [ConversationMeta.title, ...messages.map((message) => message.content)];
    return {
      conversationId: ConversationMeta.id,
      text: this.normalizeSearchText(textParts.join('\n')),
      updatedAt: ConversationMeta.updatedAt,
    };
  }

  private normalizeSearchText(text: string): string {
    return text.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  private matchesFolderFilter(
    ConversationMeta: ConversationMeta,
    folderId: string | null,
    showAll: boolean
  ): boolean {
    if (showAll) return true;
    if (folderId === null) {
      return ConversationMeta.folderId === null || ConversationMeta.folderId === undefined;
    }
    return ConversationMeta.folderId === folderId;
  }
}

// Singleton instance
export const db = new ChatMemoryDB();
