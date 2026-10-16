// src/shared/protocol.ts
// 强类型 IPC 消息协议 —— 所有 Content Script / Background / SidePanel 通信都经由此处

import type {
  SyncMessagesPayload,
  BadgeStatePayload,
  ConversationMeta,
  ConversationWithMessages,
  Folder,
} from '@/types';

// ─────────────────────────────────────────────
// 动作类型枚举
// ─────────────────────────────────────────────

export enum ActionType {
  // Content Script → Background
  CS_REQ_SYNC_MESSAGES = 'CS_REQ_SYNC_MESSAGES',
  CS_REQ_QUERY_CONVERSATION = 'CS_REQ_QUERY_CONVERSATION',

  // Background → Content Script
  BG_CMD_UPDATE_BADGE_STATE = 'BG_CMD_UPDATE_BADGE_STATE',
  BG_CMD_TOGGLE_SIDEBAR = 'BG_CMD_TOGGLE_SIDEBAR',

  // SidePanel → Background
  SB_REQ_LIST_CONVERSATIONS = 'SB_REQ_LIST_CONVERSATIONS',
  SB_REQ_GET_CONVERSATION = 'SB_REQ_GET_CONVERSATION',
  SB_REQ_DELETE_CONVERSATION = 'SB_REQ_DELETE_CONVERSATION',
  SB_REQ_DELETE_MESSAGE = 'SB_REQ_DELETE_MESSAGE',
  SB_REQ_BATCH_DELETE_CONVERSATIONS = 'SB_REQ_BATCH_DELETE_CONVERSATIONS',
  SB_REQ_SEARCH_CONVERSATIONS = 'SB_REQ_SEARCH_CONVERSATIONS',
  SB_REQ_EXPORT_DATA = 'SB_REQ_EXPORT_DATA',
  SB_REQ_EXPORT_CONVERSATIONS_ZIP = 'SB_REQ_EXPORT_CONVERSATIONS_ZIP',
  SB_REQ_MOVE_CONVERSATIONS = 'SB_REQ_MOVE_CONVERSATIONS',

  // 文件夹操作
  SB_REQ_LIST_FOLDERS = 'SB_REQ_LIST_FOLDERS',
  SB_REQ_CREATE_FOLDER = 'SB_REQ_CREATE_FOLDER',
  SB_REQ_UPDATE_FOLDER = 'SB_REQ_UPDATE_FOLDER',
  SB_REQ_DELETE_FOLDER = 'SB_REQ_DELETE_FOLDER',
}

// ─────────────────────────────────────────────
// 通用消息包装体
// ─────────────────────────────────────────────

export interface IPCMessage<T = unknown> {
  type: ActionType;
  payload?: T;
  error?: string;
  timestamp: number;
}

// ─────────────────────────────────────────────
// 具体 Payload 类型
// ─────────────────────────────────────────────

export type SyncMessagesMessage = RequestMessage<ActionType.CS_REQ_SYNC_MESSAGES>;
export type BadgeStateMessage = IPCMessage<BadgeStatePayload>;
export type ToggleSidebarMessage = IPCMessage<void>;

export interface QueryConversationPayload {
  conversationId: string;
}
export interface DeleteConversationPayload {
  conversationId: string;
}
export interface DeleteMessagePayload {
  conversationId: string;
  messageId: string;
}
export interface BatchDeletePayload {
  conversationIds: string[];
}
export interface MoveConversationsPayload {
  conversationIds: string[];
  folderId: string | null;
}
export interface SearchPayload {
  keyword: string;
  offset: number;
  limit: number;
  folderId: string | null;
  showAll: boolean;
}
export interface ExportPayload {
  conversationId: string;
}
export interface ExportZipPayload {
  conversationIds: string[];
  flatten?: boolean;
}
export interface CreateFolderPayload {
  name: string;
  parentId: string | null;
}
export interface UpdateFolderPayload {
  id: string;
  name?: string;
  parentId?: string | null;
  order?: number;
}
export interface DeleteFolderPayload {
  id: string;
}

export interface SearchResultPage {
  items: ConversationMeta[];
  total: number;
  hasMore: boolean;
}

export interface ExportedMarkdownFile {
  filename: string;
  content: string;
}

export interface ExportedZipFile {
  filename: string;
  base64: string;
}

// ─────────────────────────────────────────────
// 响应体
// ─────────────────────────────────────────────

export interface IPCResponse<T = unknown> {
  status: 'ok' | 'error';
  data?: T;
  error?: string;
}

/** 只有请求动作可以发送给后台；新增请求时必须同时补齐下面的映射。 */
export type RequestAction = Exclude<ActionType, `BG_CMD_${string}`>;
/** 兼容旧调用方用空对象表达“无参数”；在线消息格式保持不变。 */
export type NoPayload = undefined | Record<string, never>;

/** 请求的唯一类型底账：动作决定参数与成功响应，调用方不能自行指定返回类型。 */
export interface IPCRequestMap {
  [ActionType.CS_REQ_SYNC_MESSAGES]: {
    payload: SyncMessagesPayload;
    data: { saved: boolean; messageCount: number };
  };
  [ActionType.CS_REQ_QUERY_CONVERSATION]: {
    payload: QueryConversationPayload;
    data: ConversationMeta | null;
  };
  [ActionType.SB_REQ_LIST_CONVERSATIONS]: { payload: NoPayload; data: ConversationMeta[] };
  [ActionType.SB_REQ_GET_CONVERSATION]: {
    payload: QueryConversationPayload;
    data: ConversationWithMessages | null;
  };
  [ActionType.SB_REQ_DELETE_CONVERSATION]: { payload: DeleteConversationPayload; data: void };
  [ActionType.SB_REQ_DELETE_MESSAGE]: { payload: DeleteMessagePayload; data: void };
  [ActionType.SB_REQ_BATCH_DELETE_CONVERSATIONS]: { payload: BatchDeletePayload; data: void };
  [ActionType.SB_REQ_SEARCH_CONVERSATIONS]: { payload: SearchPayload; data: SearchResultPage };
  [ActionType.SB_REQ_EXPORT_DATA]: { payload: ExportPayload; data: ExportedMarkdownFile };
  [ActionType.SB_REQ_EXPORT_CONVERSATIONS_ZIP]: {
    payload: ExportZipPayload;
    data: ExportedZipFile;
  };
  [ActionType.SB_REQ_MOVE_CONVERSATIONS]: { payload: MoveConversationsPayload; data: void };
  [ActionType.SB_REQ_LIST_FOLDERS]: { payload: NoPayload; data: Folder[] };
  [ActionType.SB_REQ_CREATE_FOLDER]: { payload: CreateFolderPayload; data: Folder };
  [ActionType.SB_REQ_UPDATE_FOLDER]: { payload: UpdateFolderPayload; data: void };
  [ActionType.SB_REQ_DELETE_FOLDER]: { payload: DeleteFolderPayload; data: void };
}

// 这两个索引在新增 RequestAction 却遗漏映射时会直接产生编译错误。
export type RequestPayload<A extends RequestAction> = IPCRequestMap[A]['payload'];
export type RequestData<A extends RequestAction> = IPCRequestMap[A]['data'];

/** 分配成动作元组的联合，避免 union 动作与另一动作的 payload 被错误拼配。 */
export type RequestArguments<A extends RequestAction = RequestAction> = {
  [K in A]: undefined extends RequestPayload<K>
    ? [type: K, payload?: RequestPayload<K>]
    : [type: K, payload: RequestPayload<K>];
}[A];

export type RequestMessage<A extends RequestAction = RequestAction> = {
  [K in A]: { type: K; timestamp: number } & (undefined extends RequestPayload<K>
    ? { payload?: RequestPayload<K> }
    : { payload: RequestPayload<K> });
}[A];

export type RequestResponse<A extends RequestAction> =
  | { status: 'error'; error: string }
  | ({ status: 'ok' } & ([RequestData<A>] extends [void]
      ? { data?: RequestData<A> }
      : { data: RequestData<A> }));

export type RequestHandlers = {
  [A in RequestAction]: (
    payload: RequestPayload<A>,
    senderTabId: number | undefined
  ) => Promise<RequestResponse<A>>;
};

export type SyncResponse = RequestResponse<ActionType.CS_REQ_SYNC_MESSAGES>;
export type QueryResponse = RequestResponse<ActionType.SB_REQ_GET_CONVERSATION>;
export type ListResponse = RequestResponse<ActionType.SB_REQ_LIST_CONVERSATIONS>;
export type SearchResponse = RequestResponse<ActionType.SB_REQ_SEARCH_CONVERSATIONS>;
export type ExportResponse = RequestResponse<ActionType.SB_REQ_EXPORT_DATA>;
export type ExportZipResponse = RequestResponse<ActionType.SB_REQ_EXPORT_CONVERSATIONS_ZIP>;
export type FolderListResponse = RequestResponse<ActionType.SB_REQ_LIST_FOLDERS>;
export type FolderResponse = RequestResponse<ActionType.SB_REQ_CREATE_FOLDER>;
