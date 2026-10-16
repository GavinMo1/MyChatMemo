// src/content/adapters/kimi.ts
// Kimi 平台适配器
// 选择器、URL 验证、消息提取逻辑严格来自老架构 kimi.js（已验证有效）

import { BaseAdapter, type SelectorConfig, type UserTurn } from './base';
import type { RawMessage } from '@/types';
import { generateHashId } from '@/shared/utils';
import { createLogger } from '@/infrastructure/logger';

export class KimiAdapter extends BaseAdapter {
  readonly platform = 'kimi';
  readonly platformLabel = 'Kimi';
  private logger = createLogger('KimiAdapter');

  // ── 多层级回退选择器（与老架构保持一致，来自 kimi.js 及架构文档 §7.1）──
  private readonly selectors: SelectorConfig = {
    observationRoot: ['.chat-content', '.chat-content-list', 'main', '[role="main"]'],
    messageContainer: [
      '.chat-content-item', // 当前版本（已验证）
      '[data-testid="message-item"]', // 可能的未来版本
      '.chat-item', // 兜底
    ],
    userContent: [
      '.user-content', // 当前版本（已验证）
      '.chat-content-item-user .markdown-body',
    ],
    assistantContent: [
      '.markdown-container', // 主选择器（排除 think-stage 在提取时处理）
      '.editor-content',
      '.chat-content-item-assistant .markdown-body',
    ],
    thinkingContent: '.think-stage .markdown-container',
    title: '.chat-title, header h1',
  };

  // ─────────────────────────────────────────
  // 接口实现
  // ─────────────────────────────────────────

  getSelectors(): SelectorConfig {
    return this.selectors;
  }

  getUserTurns(): UserTurn[] {
    return Array.from(document.querySelectorAll('.chat-content-item-user'))
      .map((element) => ({
        element,
        text: Array.from(element.querySelectorAll('.user-content'))
          .map((content) => content.textContent?.trim() ?? '')
          .filter(Boolean)
          .join('\n'),
      }))
      .filter((turn) => turn.text.length > 0);
  }

  /**
   * 验证是否为有效的 Kimi 对话 URL
   * 来自老架构 kimi.js isValidConversationUrl
   */
  verifyUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname;

      // 支持 kimi.com 和 kimi.moonshot.cn 两个域名
      if (!hostname.includes('kimi.com') && !hostname.includes('kimi.moonshot.cn')) {
        return false;
      }

      // 匹配 /chat/ 后面有具体路径的情况
      return /^\/chat\/[^/]+.*$/.test(pathname);
    } catch {
      return false;
    }
  }

  /**
   * 从 URL 提取对话 ID
   * 来自老架构 kimi.js extractConversationInfo
   */
  extractConversationId(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const pathWithoutLeadingSlash = pathname.startsWith('/') ? pathname.substring(1) : pathname;

      if (
        pathWithoutLeadingSlash &&
        pathWithoutLeadingSlash !== '' &&
        pathWithoutLeadingSlash !== 'chat'
      ) {
        // 例: "chat/abc123" -> "chat_abc123"
        return pathWithoutLeadingSlash.replace(/\//g, '_');
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 提取页面所有可见消息
   * 核心逻辑严格来自老架构 kimi.js extractMessages，保持选择器不变
   */
  extractMessages(): RawMessage[] {
    const messages: RawMessage[] = [];

    // 查找所有消息容器（多层级回退）
    const containers = this.querySelectorAllWithFallback(this.selectors.messageContainer);

    if (containers.length === 0) {
      this.logger.debug('未找到消息容器');
      return messages;
    }

    // 检查是否有正在编辑的消息，若有则跳过（老架构逻辑）
    const hasEditMode = containers.some((el) => this.isInEditMode(el));
    if (hasEditMode) {
      this.logger.debug('检测到编辑状态，跳过提取');
      return [];
    }

    containers.forEach((container, index) => {
      let content = '';
      let sender: 'user' | 'assistant' | null = null;
      let thinking: string | undefined;

      // ── 用户消息 ─────────────────────────────────────────────────
      if (container.classList.contains('chat-content-item-user')) {
        sender = 'user';
        // 提取所有 .user-content 的内容（老架构逻辑）
        const userContents = container.querySelectorAll('.user-content');
        const parts: string[] = [];
        userContents.forEach((el) => {
          const text = this.sanitizeContent(el);
          if (text) parts.push(text);
        });
        content = parts.join('\n\n');
      }

      // ── AI 消息 ──────────────────────────────────────────────────
      if (container.classList.contains('chat-content-item-assistant')) {
        sender = 'assistant';

        // 提取思考过程（Kimi 特有的 think-stage，老架构逻辑）
        const thinkStage = container.querySelector('.think-stage');
        if (thinkStage) {
          const thinkContent = thinkStage.querySelector('.markdown-container');
          if (thinkContent) {
            thinking = this.sanitizeContent(thinkContent) || undefined;
          }
        }

        // 收集正文内容元素：.markdown-container 和 .editor-content，排除 .think-stage 内部
        // 严格来自老架构 kimi.js 的提取逻辑
        const contentElements: Element[] = [];

        container.querySelectorAll('.markdown-container').forEach((el) => {
          if (!el.closest('.think-stage')) {
            contentElements.push(el);
          }
        });

        container.querySelectorAll('.editor-content').forEach((el) => {
          if (!el.closest('.think-stage')) {
            contentElements.push(el);
          }
        });

        // 按 DOM 顺序排序（老架构逻辑）
        contentElements.sort((a, b) => {
          const pos = a.compareDocumentPosition(b);
          if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
          if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
          return 0;
        });

        const parts: string[] = [];
        contentElements.forEach((el) => {
          const text = this.sanitizeContent(el);
          if (text) parts.push(text);
        });
        content = parts.join('\n\n');
      }

      if (content && sender) {
        messages.push({
          hashId: generateHashId(sender, content),
          sender,
          content,
          thinking,
          position: index,
        });
      }
    });

    this.logger.debug('提取完成', { messageCount: messages.length });
    return messages;
  }

  /** 提取对话标题（Kimi 特定选择器） */
  extractTitle(): string | null {
    const titleEl = this.querySelectorWithFallback(['.chat-title', 'header h1']);
    return titleEl ? (titleEl as HTMLElement).innerText?.trim() || null : null;
  }
}
