// src/content/adapters/chatgpt.ts
// ChatGPT 平台适配器
// 选择器、URL 验证、消息提取逻辑来自老架构 chatgpt.js（已验证有效）

import { BaseAdapter, type SelectorConfig } from './base';
import type { RawMessage } from '@/types';
import { generateHashId } from '@/shared/utils';
import { createLogger } from '@/infrastructure/logger';

export class ChatGPTAdapter extends BaseAdapter {
  readonly platform = 'chatgpt';
  readonly platformLabel = 'ChatGPT';
  private logger = createLogger('ChatGPTAdapter');

  // ── 选择器配置（来自老架构 chatgpt.js）──
  private readonly selectors: SelectorConfig = {
    observationRoot: ['main', '[role="main"]'],
    messageContainer: [
      'article', // 当前版本（已验证）
      '[data-testid^="conversation-turn-"]', // 可能的未来版本
    ],
    userContent: ['div[data-message-author-role="user"] .whitespace-pre-wrap'],
    assistantContent: [
      'div[data-message-author-role="assistant"] .markdown.prose',
      'div[data-message-author-role="assistant"] .markdown',
    ],
    title: 'nav .text-token-text-primary',
  };

  // ─────────────────────────────────────────
  // 接口实现
  // ─────────────────────────────────────────

  getSelectors(): SelectorConfig {
    return this.selectors;
  }

  /**
   * 验证是否为有效的 ChatGPT 对话 URL
   * 来自老架构 chatgpt.js isValidConversationUrl
   */
  verifyUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname;

      if (!hostname.includes('chatgpt.com') && !hostname.includes('chat.openai.com')) {
        return false;
      }

      const validPatterns = [
        /^\/c\/[^/]+$/, // /c/conversation_id
        /^\/g\/[^/]+\/c\/[^/]+$/, // /g/gpt_id/c/conversation_id
      ];

      return validPatterns.some((pattern) => pattern.test(pathname));
    } catch {
      return false;
    }
  }

  /**
   * 从 URL 提取对话 ID
   * 来自老架构 chatgpt.js extractConversationInfo
   */
  extractConversationId(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const pathWithoutLeadingSlash = pathname.startsWith('/') ? pathname.substring(1) : pathname;

      if (
        pathWithoutLeadingSlash &&
        pathWithoutLeadingSlash !== '' &&
        pathWithoutLeadingSlash !== 'c' &&
        pathWithoutLeadingSlash !== 'chat'
      ) {
        // 例: "c/abc123" -> "c_abc123", "g/gpt1/c/abc" -> "g_gpt1_c_abc"
        return pathWithoutLeadingSlash.replace(/\//g, '_');
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 提取页面所有可见消息
   * 核心逻辑来自老架构 chatgpt.js extractMessages
   */
  extractMessages(): RawMessage[] {
    const messages: RawMessage[] = [];

    const conversationContainer =
      document.querySelector('main') ?? document.querySelector('[role="main"]') ?? document.body;

    if (!conversationContainer) {
      this.logger.debug('未找到对话容器', {
        selector: 'main,[role="main"]',
      });
      return messages;
    }

    // 检查是否有正在编辑的消息
    const articles = conversationContainer.querySelectorAll('article');
    const hasEditMode = Array.from(articles).some((el) => this.isInEditMode(el));
    if (hasEditMode) {
      this.logger.debug('检测到编辑状态，跳过提取');
      return [];
    }

    // 收集所有用户和 AI 消息元素（老架构逻辑）
    const userMessages = conversationContainer.querySelectorAll(
      'div[data-message-author-role="user"]'
    );
    const aiMessages = conversationContainer.querySelectorAll(
      'div[data-message-author-role="assistant"]'
    );

    interface MessageEntry {
      element: Element;
      type: 'user' | 'assistant';
    }

    const allEntries: MessageEntry[] = [];

    userMessages.forEach((element) => {
      allEntries.push({ element, type: 'user' });
    });
    aiMessages.forEach((element) => {
      allEntries.push({ element, type: 'assistant' });
    });

    // 按 DOM 实际位置排序（老架构逻辑）
    allEntries.sort((a, b) => {
      const pos = a.element.compareDocumentPosition(b.element);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    allEntries.forEach(({ element, type }, index) => {
      if (type === 'user') {
        const userTextEl = element.querySelector('.whitespace-pre-wrap');
        if (userTextEl) {
          const content = (userTextEl as HTMLElement).innerText?.trim();
          if (content) {
            messages.push({
              hashId: generateHashId('user', content),
              sender: 'user',
              content,
              position: index,
            });
          }
        }
      } else {
        let thinking: string | undefined;
        let content = '';

        // 提取 AI thinking 文本（老架构逻辑）
        const potentialThinkingEls = element.querySelectorAll(':scope > div:not(.markdown)');
        potentialThinkingEls.forEach((ptEl) => {
          const htmlEl = ptEl as HTMLElement;
          if (
            htmlEl.offsetParent !== null &&
            htmlEl.innerText?.trim() &&
            !htmlEl.querySelector('button') &&
            !htmlEl.classList.contains('flex')
          ) {
            thinking = htmlEl.innerText.trim();
          }
        });

        // 提取 AI 正式消息（老架构逻辑）
        const markdownEl =
          element.querySelector('.markdown.prose') ?? element.querySelector('.markdown');
        if (markdownEl) {
          content = this.sanitizeContent(markdownEl);
        }

        if (content) {
          messages.push({
            hashId: generateHashId('assistant', content),
            sender: 'assistant',
            content,
            thinking,
            position: index,
          });
        }
      }
    });

    this.logger.debug('提取完成', { messageCount: messages.length });
    return messages;
  }

  /** 提取对话标题 */
  extractTitle(): string | null {
    const titleEl = this.querySelectorWithFallback(['nav .text-token-text-primary']);
    return titleEl ? (titleEl as HTMLElement).innerText?.trim() || null : null;
  }
}
