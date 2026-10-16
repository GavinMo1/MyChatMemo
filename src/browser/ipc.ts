// src/browser/ipc.ts
// 类型安全的 IPC 通信封装 —— 消除 sidepanel/popup 中重复的 chrome.runtime.sendMessage 样板代码

import {
  ActionType,
  type IPCResponse,
  type ExportedMarkdownFile,
  type ExportedZipFile,
  type SearchResultPage,
  type RequestArguments,
  type RequestData,
} from '@/shared/protocol';
import type {
  ConversationMeta,
  ConversationWithMessages,
  Folder,
  SyncMessagesPayload,
} from '@/types';

/**
 * 发送 IPC 消息并等待响应
 * @throws 当响应 status 为 'error' 时抛出
 */
export async function sendRequest<Args extends RequestArguments>(
  ...[type, payload]: Args
): Promise<RequestData<Args[0]>> {
  const response: IPCResponse<RequestData<Args[0]>> = await chrome.runtime.sendMessage({
    type,
    payload,
    timestamp: Date.now(),
  });

  if (response.status === 'error') {
    throw new Error(response.error ?? '未知错误');
  }

  // IPCResponse 保留旧 wire 封套的可选 data；请求映射约定了每个成功 data 的类型。
  return response.data as RequestData<Args[0]>;
}

// ─────────────────────────────────────────
// 对话相关 API
// ─────────────────────────────────────────

/** 获取对话列表（不含消息体） */
export async function listConversations(): Promise<ConversationMeta[]> {
  return sendRequest(ActionType.SB_REQ_LIST_CONVERSATIONS);
}

/** 获取单个对话详情（含消息） */
export async function getConversation(
  conversationId: string
): Promise<ConversationWithMessages | null> {
  return sendRequest(ActionType.SB_REQ_GET_CONVERSATION, {
    conversationId,
  });
}

/** Content Script 查询对话是否已真实入库 */
export async function queryConversation(conversationId: string): Promise<ConversationMeta | null> {
  return sendRequest(ActionType.CS_REQ_QUERY_CONVERSATION, { conversationId });
}

/** 删除单个对话 */
export async function deleteConversation(conversationId: string): Promise<void> {
  await sendRequest(ActionType.SB_REQ_DELETE_CONVERSATION, { conversationId });
}

/** 删除单条消息 */
export async function deleteMessage(conversationId: string, messageId: string): Promise<void> {
  await sendRequest(ActionType.SB_REQ_DELETE_MESSAGE, { conversationId, messageId });
}

/** 批量删除对话 */
export async function batchDeleteConversations(conversationIds: string[]): Promise<void> {
  await sendRequest(ActionType.SB_REQ_BATCH_DELETE_CONVERSATIONS, { conversationIds });
}

/** 导出对话为 Markdown */
export async function exportConversation(conversationId: string): Promise<ExportedMarkdownFile> {
  return sendRequest(ActionType.SB_REQ_EXPORT_DATA, { conversationId });
}

/** 搜索对话（分页） */
export async function searchConversationsPaged(
  keyword: string,
  offset: number,
  limit: number,
  folderId: string | null,
  showAll: boolean
): Promise<SearchResultPage> {
  return sendRequest(ActionType.SB_REQ_SEARCH_CONVERSATIONS, {
    keyword,
    offset,
    limit,
    folderId,
    showAll,
  });
}

/** 批量导出对话为 ZIP */
export async function exportConversationsZip(
  conversationIds: string[],
  options?: { flatten?: boolean }
): Promise<ExportedZipFile> {
  return sendRequest(ActionType.SB_REQ_EXPORT_CONVERSATIONS_ZIP, {
    conversationIds,
    flatten: options?.flatten ?? false,
  });
}

/** 移动对话到文件夹 */
export async function moveConversations(
  conversationIds: string[],
  folderId: string | null
): Promise<void> {
  await sendRequest(ActionType.SB_REQ_MOVE_CONVERSATIONS, { conversationIds, folderId });
}

// ─────────────────────────────────────────
// 文件夹相关 API
// ─────────────────────────────────────────

/** 获取文件夹列表 */
export async function listFolders(): Promise<Folder[]> {
  return sendRequest(ActionType.SB_REQ_LIST_FOLDERS);
}

/** 创建文件夹 */
export async function createFolder(name: string, parentId: string | null = null): Promise<Folder> {
  return sendRequest(ActionType.SB_REQ_CREATE_FOLDER, { name, parentId });
}

/** 更新文件夹 */
export async function updateFolder(
  id: string,
  changes: { name?: string; parentId?: string | null; order?: number }
): Promise<void> {
  await sendRequest(ActionType.SB_REQ_UPDATE_FOLDER, { id, ...changes });
}

/** 删除文件夹 */
export async function deleteFolder(id: string): Promise<void> {
  await sendRequest(ActionType.SB_REQ_DELETE_FOLDER, { id });
}

/** 同步消息（从 content script 使用） */
export async function syncMessages(
  payload: SyncMessagesPayload
): Promise<{ saved: boolean; messageCount: number }> {
  return sendRequest(ActionType.CS_REQ_SYNC_MESSAGES, payload);
}
