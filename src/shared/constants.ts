// src/shared/constants.ts
// 全局常量集中管理 —— 消除魔法数字和重复字符串

// ─────────────────────────────────────────
// 平台显示名映射（UI 层使用）
// ─────────────────────────────────────────

import type { Platform } from '@/types';

/** 是否开启调试日志（开发环境默认开启） */
export const DEBUG_LOG_ENABLED = import.meta.env.DEV;

export const PLATFORM_LABELS: Record<Platform, string> = {
  kimi: 'Kimi',
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  doubao: '豆包',
  gemini: 'Gemini',
};

// ─────────────────────────────────────────
// 业务默认值
// ─────────────────────────────────────────

/** 无法提取标题时的默认对话标题 */
export const DEFAULT_CONVERSATION_TITLE = '新对话';

/** 锚点匹配取样的消息条数（syncEngine） */
export const ANCHOR_SAMPLE_COUNT = 6;

// ─────────────────────────────────────────
// 自定义事件名
// ─────────────────────────────────────────

/** 悬浮球状态更新事件 */
export const BADGE_STATE_EVENT = 'mychatmemo-badge-state';

/** SPA 路由变化事件 */
export const ROUTE_CHANGE_EVENT = 'mychatmemo-url-changed';

// ─────────────────────────────────────────
// 时间相关常量（毫秒）
// ─────────────────────────────────────────

/** Observer 短防抖延迟 */
export const OBSERVER_DEBOUNCE_DELAY = 1500;

/** Observer 强制快照间隔 */
export const OBSERVER_FORCE_SAVE_INTERVAL = 10_000;

/** 页面初始化同步延迟 */
export const INIT_SYNC_DELAY = 500;

/** 路由变化后重新初始化延迟 */
export const ROUTE_CHANGE_REINIT_DELAY = 300;

/** 搜索输入防抖延迟 */
export const SEARCH_DEBOUNCE_DELAY = 300;

/** 搜索分页大小 */
export const SEARCH_PAGE_SIZE = 50;

/** 徽章状态重置延迟（成功/错误后恢复 idle） */
export const BADGE_RESET_DELAY = 3000;

// ─────────────────────────────────────────
// UI 尺寸常量
// ─────────────────────────────────────────

/** 悬浮球尺寸 */
export const FLOAT_BUTTON_SIZE = 42;

/** 悬浮球圆角 */
export const FLOAT_BUTTON_RADIUS = 14;

/** 悬浮面板默认宽度 */
export const FLOAT_PANEL_WIDTH = 380;

/** 悬浮面板边距 */
export const FLOAT_PANEL_MARGIN = 12;

/** 悬浮面板最小宽度 */
export const FLOAT_PANEL_MIN_WIDTH = 300;

/** 悬浮面板最大宽度 */
export const FLOAT_PANEL_MAX_WIDTH = 600;

// ─────────────────────────────────────────
// Shadow DOM 宿主元素 ID
// ─────────────────────────────────────────

export const FLOAT_BUTTON_HOST_ID = 'mychatmemo-float-host';
export const FLOAT_PANEL_HOST_ID = 'mychatmemo-panel-host';
export const TIMELINE_NAV_HOST_ID = 'mychatmemo-timeline-host';
