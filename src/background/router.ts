// src/background/router.ts
// IPC 路由中间件：统一处理来自 Content Script 和 SidePanel 的消息
// 采用 handler-map 模式，每个 ActionType 对应一个处理函数

import {
  ActionType,
  type IPCResponse,
  type SyncResponse,
  type QueryResponse,
  type ListResponse,
  type SearchResponse,
  type ExportResponse,
  type ExportZipResponse,
  type FolderListResponse,
  type FolderResponse,
  type SearchPayload,
  type QueryConversationPayload,
  type DeleteConversationPayload,
  type DeleteMessagePayload,
  type BatchDeletePayload,
  type ExportZipPayload,
  type MoveConversationsPayload,
  type CreateFolderPayload,
  type UpdateFolderPayload,
  type DeleteFolderPayload,
  type RequestHandlers,
  type RequestResponse,
} from '@/shared/protocol';
import { SyncEngine } from './syncEngine';
import { db } from './database';
import { exportConversationFile, exportConversationsToZip } from './exporter';
import { encodeArrayBufferToBase64 } from '@/shared/base64';
import type { SyncMessagesPayload } from '@/types';
import { createLogger } from '@/infrastructure/logger';
import { formatError } from '@/infrastructure/errorHandler';
import { validateBackgroundRequest } from '@/shared/protocolValidation';

/** 路由处理函数签名 */
type RouteHandler = (payload: unknown, senderTabId: number | undefined) => Promise<IPCResponse>;
type EmptyResponse = RequestResponse<ActionType.SB_REQ_DELETE_CONVERSATION>;

export class MessageRouter {
  private syncEngine: SyncEngine;
  private handlers: RequestHandlers;
  private logger = createLogger('Router');

  constructor() {
    this.syncEngine = new SyncEngine();
    this.handlers = this.buildHandlerMap();
  }

  setup(): void {
    chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
      const senderTabId = sender.tab?.id;
      // 所有错误处理在 dispatch 内部异步完成
      this.dispatch(message, senderTabId, sendResponse);
      return true; // 保持消息通道开放（异步响应必须）
    });
    this.logger.info('IPC 路由已就绪');
  }

  // ─────────────────────────────────────────
  // 消息分发
  // ─────────────────────────────────────────

  private dispatch(
    input: unknown,
    senderTabId: number | undefined,
    sendResponse: (response: IPCResponse) => void
  ): void {
    const validation = validateBackgroundRequest(input);
    if (!validation.valid) {
      sendResponse({ status: 'error', error: validation.error });
      return;
    }
    const { message } = validation;
    this.logger.debug('收到消息', {
      type: message.type,
      senderTabId,
    });

    // 动态索引会丢失判别联合中 type 与 payload 的关联。
    // message 已按同一动作完成运行时校验；handler 表逐动作受 RequestHandlers 检查。
    // 只在这个分发边界擦除关联，避免每个 handler 对 unknown 再做断言。
    const handler = this.handlers[message.type] as RouteHandler;

    Promise.resolve()
      .then(() => handler(message.payload, senderTabId))
      .then((response) => sendResponse(response))
      .catch((err) => {
        this.logger.error(
          '处理消息失败',
          {
            type: message.type,
            senderTabId,
          },
          err
        );
        sendResponse({ status: 'error', error: formatError(err) });
      });
  }

  // ─────────────────────────────────────────
  // 构建 handler 映射表
  // ─────────────────────────────────────────

  private buildHandlerMap(): RequestHandlers {
    return {
      [ActionType.CS_REQ_SYNC_MESSAGES]: (payload, tabId) =>
        this.handleSyncMessages(payload, tabId),
      [ActionType.CS_REQ_QUERY_CONVERSATION]: (payload) => this.handleQueryConversation(payload),
      [ActionType.SB_REQ_LIST_CONVERSATIONS]: () => this.handleListConversations(),
      [ActionType.SB_REQ_GET_CONVERSATION]: (payload) => this.handleGetConversation(payload),
      [ActionType.SB_REQ_DELETE_CONVERSATION]: (payload) => this.handleDeleteConversation(payload),
      [ActionType.SB_REQ_DELETE_MESSAGE]: (payload) => this.handleDeleteMessage(payload),
      [ActionType.SB_REQ_BATCH_DELETE_CONVERSATIONS]: (payload) => this.handleBatchDelete(payload),
      [ActionType.SB_REQ_SEARCH_CONVERSATIONS]: (payload) => this.handleSearch(payload),
      [ActionType.SB_REQ_EXPORT_DATA]: (payload) => this.handleExport(payload),
      [ActionType.SB_REQ_EXPORT_CONVERSATIONS_ZIP]: (payload) => this.handleExportZip(payload),
      [ActionType.SB_REQ_MOVE_CONVERSATIONS]: (payload) => this.handleMoveConversations(payload),
      [ActionType.SB_REQ_LIST_FOLDERS]: () => this.handleListFolders(),
      [ActionType.SB_REQ_CREATE_FOLDER]: (payload) => this.handleCreateFolder(payload),
      [ActionType.SB_REQ_UPDATE_FOLDER]: (payload) => this.handleUpdateFolder(payload),
      [ActionType.SB_REQ_DELETE_FOLDER]: (payload) => this.handleDeleteFolder(payload),
    };
  }

  // ─────────────────────────────────────────
  // 具体 Handler 实现
  // ─────────────────────────────────────────

  private async handleSyncMessages(
    payload: SyncMessagesPayload,
    tabId: number | undefined
  ): Promise<SyncResponse> {
    try {
      const data = await this.syncEngine.handleSync(payload);
      if (tabId) this.pushBadgeToTab(tabId, 'success');
      return { status: 'ok', data };
    } catch (err) {
      this.logger.error(
        '同步失败',
        {
          tabId,
          conversationId: payload.conversationId,
          platform: payload.platform,
        },
        err
      );
      if (tabId) this.pushBadgeToTab(tabId, 'error', String(err));
      return { status: 'error', error: String(err) };
    }
  }

  private async handleQueryConversation(
    payload: QueryConversationPayload
  ): Promise<RequestResponse<ActionType.CS_REQ_QUERY_CONVERSATION>> {
    const conv = await db.getConversation(payload.conversationId);
    return { status: 'ok', data: conv ?? null };
  }

  private async handleListConversations(): Promise<ListResponse> {
    const list = await db.listConversations();
    return { status: 'ok', data: list };
  }

  private async handleGetConversation(payload: QueryConversationPayload): Promise<QueryResponse> {
    const [conv, msgs] = await Promise.all([
      db.getConversation(payload.conversationId),
      db.getMessages(payload.conversationId),
    ]);
    if (!conv) return { status: 'ok', data: null };
    return { status: 'ok', data: { ...conv, messages: msgs } };
  }

  private async handleDeleteConversation(
    payload: DeleteConversationPayload
  ): Promise<EmptyResponse> {
    await db.deleteConversation(payload.conversationId);
    return { status: 'ok' };
  }

  private async handleDeleteMessage(payload: DeleteMessagePayload): Promise<EmptyResponse> {
    await db.deleteMessage(payload.conversationId, payload.messageId);
    return { status: 'ok' };
  }

  private async handleBatchDelete(payload: BatchDeletePayload): Promise<EmptyResponse> {
    await db.deleteConversations(payload.conversationIds);
    return { status: 'ok' };
  }

  private async handleSearch(payload: SearchPayload): Promise<SearchResponse> {
    const result = await db.searchConversationsPaged(
      payload.keyword,
      payload.offset,
      payload.limit,
      payload.folderId,
      payload.showAll
    );
    const items = result.items;
    return {
      status: 'ok',
      data: {
        items,
        total: result.total,
        hasMore: result.hasMore,
      },
    };
  }

  private async handleExport(payload: QueryConversationPayload): Promise<ExportResponse> {
    const conv = await db.getConversation(payload.conversationId);
    if (!conv) return { status: 'error', error: '对话不存在' };
    const messages = await db.getMessages(payload.conversationId);
    const exported = exportConversationFile({ ...conv, messages });
    return { status: 'ok', data: exported };
  }

  private async handleExportZip(payload: ExportZipPayload): Promise<ExportZipResponse> {
    if (payload.conversationIds.length === 0) {
      return { status: 'error', error: '未选择任何对话' };
    }

    const folders = await db.listFolders();
    const loaded = await Promise.all(
      payload.conversationIds.map((conversationId) =>
        this.loadConversationForExport(conversationId)
      )
    );
    const conversations = loaded.filter(
      (conv): conv is Exclude<(typeof loaded)[number], null> => conv !== null
    );

    if (conversations.length === 0) {
      return { status: 'error', error: '未找到可导出的对话' };
    }

    const exported = await exportConversationsToZip(conversations, folders, {
      flatten: payload.flatten,
    });
    return {
      status: 'ok',
      data: {
        filename: exported.filename,
        base64: encodeArrayBufferToBase64(exported.buffer),
      },
    };
  }

  private async handleMoveConversations(payload: MoveConversationsPayload): Promise<EmptyResponse> {
    await db.moveConversationsToFolder(payload.conversationIds, payload.folderId);
    return { status: 'ok' };
  }

  private async handleListFolders(): Promise<FolderListResponse> {
    const list = await db.listFolders();
    return { status: 'ok', data: list };
  }

  private async handleCreateFolder(payload: CreateFolderPayload): Promise<FolderResponse> {
    const folder = await db.createFolderWithNextOrder(payload.name, payload.parentId);
    return { status: 'ok', data: folder };
  }

  private async handleUpdateFolder(payload: UpdateFolderPayload): Promise<EmptyResponse> {
    const { id, ...changes } = payload;
    await db.updateFolder(id, changes);
    return { status: 'ok' };
  }

  private async handleDeleteFolder(payload: DeleteFolderPayload): Promise<EmptyResponse> {
    await db.deleteFolder(payload.id);
    return { status: 'ok' };
  }

  // ─────────────────────────────────────────
  // 向指定 tab 推送徽章状态
  // ─────────────────────────────────────────

  private pushBadgeToTab(
    tabId: number,
    state: 'success' | 'error' | 'syncing' | 'idle',
    errorMsg?: string
  ): void {
    chrome.tabs
      .sendMessage(tabId, {
        type: ActionType.BG_CMD_UPDATE_BADGE_STATE,
        payload: { state, message: errorMsg },
        timestamp: Date.now(),
      })
      .catch(() => {
        /* content script 可能不存在，忽略 */
      });
  }

  private async loadConversationForExport(conversationId: string) {
    const conv = await db.getConversation(conversationId);
    if (!conv) return null;
    const messages = await db.getMessages(conversationId);
    return { ...conv, messages };
  }
}
