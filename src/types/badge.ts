// src/types/badge.ts
// 悬浮球状态类型

/** BG -> CS: 悬浮球状态更新 */
export interface BadgeStatePayload {
  state: 'idle' | 'extracting' | 'syncing' | 'success' | 'error';
  message?: string;
}
