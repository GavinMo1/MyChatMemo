// src/types/attachment.ts
// 附件类型定义

export interface Attachment {
  type: 'image' | 'file';
  url?: string;
  content?: string; // Base64
  filename?: string;
}
