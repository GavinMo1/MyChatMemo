// src/types/message.ts
// 消息相关类型

import type { Attachment } from './attachment';

export interface Message {
  /** 唯一 ID: msg_{conversationId}_{sender}_position_{index} */
  id: string;
  conversationId: string;
  sender: 'user' | 'assistant';
  content: string; // 纯文本/Markdown
  htmlContent?: string;
  thinking?: string; // Kimi 思考过程
  attachments?: Attachment[];
  createdAt: string; // ISO 8601
  updatedAt: string;
  metadata: {
    position: number; // 在对话中的顺序索引（从 0 开始）
    wordCount: number;
    model?: string;
  };
}

/** Content Script 上报给 Background 的原始消息快照 */
export interface RawMessage {
  /** sender + content[:50] 的哈希，用于锚点匹配 */
  hashId: string;
  sender: 'user' | 'assistant';
  content: string;
  thinking?: string;
  position: number;
}
