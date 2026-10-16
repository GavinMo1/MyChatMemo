// src/content/syncManager.ts
// 同步管理器 —— 从 index.tsx 中提取，负责消息提取、同步上报、状态管理
// 职责单一：管理哪些对话已被激活，以及如何触发同步

import type { BaseAdapter } from './adapters/base';
import type { SyncMessagesPayload, BadgeStatePayload } from '@/types';
import { generateTitleFromContent } from '@/shared/utils';
import { BADGE_STATE_EVENT, DEFAULT_CONVERSATION_TITLE } from '@/shared/constants';
import { queryConversation, syncMessages } from '@/browser/ipc';
import { createLogger } from '@/infrastructure/logger';
import { getRouteRevision } from './routerInterceptor';

// ─────────────────────────────────────────
// 已激活（用户主动点击保存过）的对话 ID 集合
// 只有在此集合中的对话才会被 Observer 自动增量同步
// ─────────────────────────────────────────
const activatedConversations = new Set<string>();
const logger = createLogger('SyncManager');
const ACTIVATED_CONVERSATIONS_STORAGE_KEY = 'mychatmemo:activatedConversations:v1';
interface ExtractionTask {
  promise: Promise<ExtractAndSyncResult>;
  dirty: boolean;
  snapshotTaken: boolean;
  options: ExtractAndSyncOptions;
}
const inFlightExtractions = new Map<string, ExtractionTask>();

export interface ExtractAndSyncResult {
  status:
    | 'success'
    | 'skipped_no_conversation'
    | 'skipped_no_messages'
    | 'skipped_route_changed'
    | 'error';
  saved?: boolean;
  messageCount?: number;
  error?: string;
}

export interface ExtractAndSyncOptions {
  /** 允许适配器主动滚动虚拟列表做完整采集，适合用户手动保存时使用 */
  fullPage?: boolean;
}

export function getActivationKey(platform: string, conversationId: string): string {
  return `${platform}:${conversationId}`;
}

function readActivatedKeysFromStorage(): Promise<string[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([ACTIVATED_CONVERSATIONS_STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        logger.warn('读取激活状态失败，回退为空', {
          error: chrome.runtime.lastError.message,
        });
        resolve([]);
        return;
      }

      const keys = result[ACTIVATED_CONVERSATIONS_STORAGE_KEY];
      resolve(Array.isArray(keys) ? keys.filter((k) => typeof k === 'string') : []);
    });
  });
}

function persistActivatedKeysToStorage(keys: string[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [ACTIVATED_CONVERSATIONS_STORAGE_KEY]: keys }, () => {
      if (chrome.runtime.lastError) {
        logger.warn('写入激活状态失败', {
          error: chrome.runtime.lastError.message,
          count: keys.length,
        });
      }
      resolve();
    });
  });
}

/** 启动时恢复激活状态 */
export async function hydrateActivatedConversations(): Promise<void> {
  const keys = await readActivatedKeysFromStorage();
  const validKeys = await filterPersistedActivationKeys(keys);
  activatedConversations.clear();
  validKeys.forEach((key) => activatedConversations.add(key));

  if (validKeys.length !== keys.length) {
    await persistActivatedKeysToStorage(validKeys);
  }

  logger.info('激活状态恢复完成', { count: activatedConversations.size });
}

/** 检查对话是否已激活 */
export function isActivated(platform: string, conversationId: string): boolean {
  return activatedConversations.has(getActivationKey(platform, conversationId));
}

/** 激活一个对话（用户首次手动保存成功后调用） */
export async function activate(platform: string, conversationId: string): Promise<void> {
  const key = getActivationKey(platform, conversationId);
  if (activatedConversations.has(key)) return;

  activatedConversations.add(key);
  logger.info('用户激活对话保存', { platform, conversationId });
  await persistActivatedKeysToStorage(Array.from(activatedConversations));
}

// ─────────────────────────────────────────
// 向悬浮球发送状态（页面内直接事件）
// ─────────────────────────────────────────

export function sendBadgeState(state: BadgeStatePayload['state'], message?: string): void {
  window.dispatchEvent(
    new CustomEvent<BadgeStatePayload>(BADGE_STATE_EVENT, {
      detail: { state, message },
    })
  );
}

export async function handleManualSave(
  adapter: BaseAdapter,
  onActivated: () => void
): Promise<ExtractAndSyncResult> {
  const route = getRouteRevision();
  const conversationId = adapter.extractConversationId(window.location.href);
  if (!conversationId) {
    sendBadgeState('idle', '当前页面不是可保存的对话');
    return { status: 'skipped_no_conversation' };
  }

  sendBadgeState('extracting');
  const result = await extractAndSync(adapter, {
    fullPage: true,
  });

  if (getRouteRevision() !== route) return { status: 'skipped_route_changed' };

  if (result.status === 'success') {
    if (!isActivated(adapter.platform, conversationId)) {
      await activate(adapter.platform, conversationId);
    }
    if (getRouteRevision() === route) onActivated();
    return result;
  }

  if (result.status === 'skipped_no_messages') {
    sendBadgeState('idle', '当前对话暂无可保存内容');
  } else if (result.status === 'skipped_no_conversation') {
    sendBadgeState('idle', '当前页面不是可保存的对话');
  }

  return result;
}

export function shouldAutoSync(adapter: BaseAdapter, expectedActivationKey: string): boolean {
  const conversationId = adapter.extractConversationId(window.location.href);
  if (!conversationId) return false;

  const currentActivationKey = getActivationKey(adapter.platform, conversationId);
  if (currentActivationKey !== expectedActivationKey) {
    logger.debug('跳过自动同步：观察器绑定的对话与当前页面不一致', {
      expectedActivationKey,
      currentActivationKey,
      url: window.location.href,
    });
    return false;
  }

  if (!isActivated(adapter.platform, conversationId)) {
    logger.debug('跳过自动同步：当前对话未激活', {
      expectedActivationKey,
      url: window.location.href,
    });
    return false;
  }

  return true;
}

// ─────────────────────────────────────────
// 核心：提取并上报
// ─────────────────────────────────────────

export async function extractAndSync(
  adapter: BaseAdapter,
  options: ExtractAndSyncOptions = {}
): Promise<ExtractAndSyncResult> {
  const url = window.location.href;
  const conversationId = adapter.extractConversationId(url);
  if (!conversationId) {
    return { status: 'skipped_no_conversation' };
  }

  const route = getRouteRevision();
  const extractionKey = `${getActivationKey(adapter.platform, conversationId)}:${route}`;
  const running = inFlightExtractions.get(extractionKey);
  if (running) {
    logger.debug('复用正在进行的同步任务', {
      extractionKey,
      url,
    });
    // 准备阶段复用即可；快照已发送时收到的新变化必须在响应后补采。
    if (running.snapshotTaken || (options.fullPage && !running.options.fullPage)) {
      running.dirty = true;
    }
    if (options.fullPage) running.options.fullPage = true;
    return running.promise;
  }

  const entry: ExtractionTask = {
    promise: Promise.resolve({ status: 'skipped_no_messages' }),
    dirty: false,
    snapshotTaken: false,
    options: { ...options },
  };
  const run = async (): Promise<ExtractAndSyncResult> => {
    let result: ExtractAndSyncResult;
    do {
      entry.dirty = false;
      entry.snapshotTaken = false;
      result = await doExtractAndSync(adapter, url, conversationId, entry.options, () => {
        entry.snapshotTaken = true;
      });
    } while (
      entry.dirty &&
      getRouteRevision() === route &&
      result.status !== 'skipped_route_changed'
    );
    return result;
  };
  entry.promise = run()
    .then((result) => {
      inFlightExtractions.delete(extractionKey);
      return result;
    })
    .catch((error) => {
      inFlightExtractions.delete(extractionKey);
      throw error;
    });

  inFlightExtractions.set(extractionKey, entry);
  return entry.promise;
}

async function doExtractAndSync(
  adapter: BaseAdapter,
  url: string,
  conversationId: string,
  options: ExtractAndSyncOptions,
  onSnapshotTaken: () => void
): Promise<ExtractAndSyncResult> {
  const route = getRouteRevision();
  try {
    await adapter.prepareForExtraction(url, { fullPage: options.fullPage });
    if (getRouteRevision() !== route || window.location.href !== url) {
      return { status: 'skipped_route_changed' };
    }

    const currentMessages = adapter.extractMessages();
    if (currentMessages.length === 0) {
      return { status: 'skipped_no_messages' };
    }

    sendBadgeState('syncing');

    const title =
      adapter.extractTitle() ||
      generateTitleFromContent(
        currentMessages.find((m) => m.sender === 'user')?.content || DEFAULT_CONVERSATION_TITLE
      );

    const payload: SyncMessagesPayload = {
      url: url.split('?')[0],
      platform: adapter.platform,
      conversationId,
      title,
      currentMessages,
      // 当前适配器只能证明采到了可见消息，fullPage 是采集意图，不是完整性证据。
      snapshot: 'partial',
    };

    onSnapshotTaken();
    const result = await syncMessages(payload);
    if (getRouteRevision() !== route) return { status: 'skipped_route_changed' };
    // 成功状态由 Background 广播回来
    return {
      status: 'success',
      saved: result.saved,
      messageCount: result.messageCount,
    };
  } catch (err) {
    if (getRouteRevision() !== route) return { status: 'skipped_route_changed' };
    logger.error(
      '同步失败',
      {
        conversationId,
        platform: adapter.platform,
        url,
      },
      err
    );
    const error = String(err);
    sendBadgeState('error', error);
    return {
      status: 'error',
      error,
    };
  }
}

function parseActivationKey(key: string): { platform: string; conversationId: string } | null {
  const separatorIndex = key.indexOf(':');
  if (separatorIndex <= 0 || separatorIndex === key.length - 1) {
    return null;
  }

  return {
    platform: key.slice(0, separatorIndex),
    conversationId: key.slice(separatorIndex + 1),
  };
}

async function filterPersistedActivationKeys(keys: string[]): Promise<string[]> {
  const validations = await Promise.all(
    keys.map(async (key) => {
      const parsed = parseActivationKey(key);
      if (!parsed) {
        return null;
      }

      try {
        const conversation = await queryConversation(parsed.conversationId);
        if (!conversation || conversation.platform !== parsed.platform) {
          return null;
        }
        return key;
      } catch (error) {
        logger.warn('校验激活状态失败，保留原记录', {
          key,
          error: String(error),
        });
        return key;
      }
    })
  );

  return validations.filter((key): key is string => key !== null);
}
