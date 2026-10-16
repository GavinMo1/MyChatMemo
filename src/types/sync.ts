// src/types/sync.ts
// 同步相关 Payload 类型

import type { RawMessage } from './message';

/** CS -> BG: 同步消息的 Payload */
export interface SyncMessagesPayload {
  url: string;
  platform: string;
  conversationId: string;
  title: string;
  currentMessages: RawMessage[];
  /** 缺省为局部 DOM 快照；只有确认包含完整对话时才可声明 complete。
   * 手动保存或尝试滚动加载并不能证明快照完整。
   */
  snapshot?: 'partial' | 'complete';
}
