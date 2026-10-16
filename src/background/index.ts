// src/background/index.ts
// Service Worker 生命周期管理 + 初始化

import { MessageRouter } from './router';
import { createLogger } from '@/infrastructure/logger';

const router = new MessageRouter();
const logger = createLogger('Background');
router.setup();

// ── 插件安装 / 更新钩子 ──────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  logger.info('onInstalled', { reason: details.reason });
});

// ── SidePanel 行为配置 ───────────────────────────────────────────
// 不设置 openPanelOnActionClick，因为点击图标打开 Popup
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch((err) => logger.error('setPanelBehavior 失败', undefined, err));

logger.info('Service Worker 已启动');
