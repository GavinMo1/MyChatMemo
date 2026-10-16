// src/types/index.ts
// 类型桶导出 —— 统一从此处导入所有类型

export type { Attachment } from './attachment';
export type { Message, RawMessage } from './message';
export type {
  ConversationMeta,
  ConversationWithMessages,
  ConversationPatch,
  Platform,
} from './conversation';
export type { Folder } from './folder';
export type { SyncMessagesPayload } from './sync';
export type { BadgeStatePayload } from './badge';
export type { SearchIndexRecord } from './search';
