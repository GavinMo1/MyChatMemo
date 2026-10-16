// src/types/conversation.ts
// 对话相关类型

import type { Message } from './message';

/** 支持的 AI 平台标识（扩展新平台时在此添加） */
export type Platform = 'kimi' | 'chatgpt' | 'claude' | 'doubao' | 'gemini';

/**
 * 对话元数据（conversations 表存储的形态）
 * 注意：消息体只存于 messages 表，不在此类型上冗余
 */
export interface ConversationMeta {
  id: string;
  platform: Platform;
  title: string;
  url: string;
  /** 所属文件夹 ID，null 表示未分类 */
  folderId: string | null;
  stats: {
    messageCount: number;
    totalTokens?: number;
    lastSyncedAt: number;
  };
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
}

/** 对话元数据 + 完整消息列表（详情视图、导出等场景使用） */
export interface ConversationWithMessages extends ConversationMeta {
  messages: Message[];
}

/** Background 执行增量更新时的差异包 */
export interface ConversationPatch {
  conversationId: string;
  newMessages: Message[];
  updatedMessages: Pick<Message, 'id' | 'content' | 'updatedAt'>[];
  deletedMessageIds: string[];
}
