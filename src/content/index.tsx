// src/content/index.tsx
// Content Script 入口 —— 薄编排层
// 职责：适配器匹配 → Observer 管理 → UI 注入 → 路由监听
// 策略：只有用户点击悬浮球后才保存当前对话，后续变更自动增量同步

import { adapterRegistry } from './adapters/registry';
import type { BaseAdapter } from './adapters/base';
import { SmartObserver } from './smartObserver';
import { interceptHistory } from './routerInterceptor';
import { mountFloatButton, type FloatButtonController } from './ui/floatButton';
import { mountFloatPanel, type FloatPanelController } from './ui/floatPanel';
import { mountTimelineNav, type TimelineNavController } from './ui/timelineNav';
import { ActionType } from '@/shared/protocol';
import { ROUTE_CHANGE_REINIT_DELAY } from '@/shared/constants';
import { createLogger } from '@/infrastructure/logger';
import {
  hydrateActivatedConversations,
  handleManualSave,
  getActivationKey,
  isActivated,
  sendBadgeState,
  shouldAutoSync,
  extractAndSync,
} from './syncManager';

// ─────────────────────────────────────────
// 状态
// ─────────────────────────────────────────
let observer: SmartObserver | null = null;
let unmountFloat: FloatButtonController | null = null;
let panelCtrl: FloatPanelController | null = null;
let timelineCtrl: TimelineNavController | null = null;
let currentConversationId: string | null = null;
let pendingReinitTimer: ReturnType<typeof setTimeout> | null = null;
const logger = createLogger('Content');

// ─────────────────────────────────────────
// 适配器快捷获取
// ─────────────────────────────────────────

function getAdapter(): BaseAdapter | null {
  return adapterRegistry.getAdapter(window.location.href);
}

// ─────────────────────────────────────────
// 初始化当前页面的监听（仅对已激活的对话启动 Observer）
// ─────────────────────────────────────────

function initPage(): void {
  observer?.stop();
  observer = null;
  currentConversationId = null;
  const adapter = getAdapter();
  if (!adapter) {
    logger.debug('当前页面不匹配任何适配器', { url: window.location.href });
    // 非对话页面销毁时间线
    timelineCtrl?.destroy();
    timelineCtrl = null;
    return;
  }

  logger.info('初始化页面适配器', {
    platform: adapter.platform,
    url: window.location.href,
  });

  // 挂载 / 刷新时间线导航
  timelineCtrl?.destroy();
  timelineCtrl = mountTimelineNav(adapter);

  const conversationId = adapter.extractConversationId(window.location.href);
  if (!conversationId) return;

  currentConversationId = conversationId;

  if (isActivated(adapter.platform, conversationId)) {
    // 已激活的对话 → 启动 Observer 自动增量同步
    startObserving(adapter, conversationId);
  }
  // 未激活的对话 → 不做任何事，等用户点击悬浮球
}

// ─────────────────────────────────────────
// 启动 Observer（仅对已激活对话调用）
// ─────────────────────────────────────────

function startObserving(adapter: BaseAdapter, conversationId: string): void {
  observer?.stop();

  const expectedActivationKey = getActivationKey(adapter.platform, conversationId);

  observer = new SmartObserver({
    resolveTarget: () => adapter.getObservationRoot(),
    onTargetReady: () => {
      void handleAutoSync(adapter, expectedActivationKey);
    },
    onTrigger: () => {
      void handleAutoSync(adapter, expectedActivationKey);
    },
  });
  observer.startObserving();
}

async function handleAutoSync(adapter: BaseAdapter, expectedActivationKey: string): Promise<void> {
  if (!shouldAutoSync(adapter, expectedActivationKey)) return;
  await extractAndSync(adapter);
}

// ─────────────────────────────────────────
// 点击悬浮球：首次手动保存成功后激活；已激活对话直接同步
// ─────────────────────────────────────────

function handleToggleSidebar(): void {
  const adapter = getAdapter();

  // 切换悬浮面板
  panelCtrl?.toggle();

  if (!adapter) return;

  void handleManualSave(adapter, () => {
    const conversationId = adapter.extractConversationId(window.location.href);
    if (!conversationId) return;
    startObserving(adapter, conversationId);
  });
}

// ─────────────────────────────────────────
// 监听来自 Background 的命令
// ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === ActionType.BG_CMD_UPDATE_BADGE_STATE && msg.payload) {
    sendBadgeState(msg.payload.state, msg.payload.message);
    sendResponse({ status: 'ok' });
  }
  // 不返回 true，因为我们同步调用 sendResponse
});

// ─────────────────────────────────────────
// 启动
// ─────────────────────────────────────────

async function boot(): Promise<void> {
  logger.info('MyChatMemo 启动', { url: window.location.href });

  await hydrateActivatedConversations();

  // 挂载悬浮面板（iframe 方式），面板关闭时自动显示悬浮球
  panelCtrl = mountFloatPanel((visible) => {
    if (visible) {
      unmountFloat?.hide();
    } else {
      unmountFloat?.show();
    }
  });

  // 挂载悬浮球
  unmountFloat = mountFloatButton(() => handleToggleSidebar());

  // 初始化当前页面（不会自动保存，仅检查是否已激活）
  initPage();

  // 监听 SPA 路由变化（返回值是清理函数，但 content script 无卸载生命周期，无需保存）
  interceptHistory(() => {
    observer?.stop();
    observer = null;
    timelineCtrl?.destroy();
    timelineCtrl = null;
    if (pendingReinitTimer !== null) {
      clearTimeout(pendingReinitTimer);
      pendingReinitTimer = null;
    }

    logger.debug('检测到路由变化', {
      url: window.location.href,
      conversationId: currentConversationId,
    });
    pendingReinitTimer = setTimeout(() => {
      pendingReinitTimer = null;
      initPage();
    }, ROUTE_CHANGE_REINIT_DELAY);
  });
}

// DOM 就绪后启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void boot();
  });
} else {
  void boot();
}
