// src/content/adapters/doubao.ts
// 豆包平台适配器
// 选择器、URL 验证、消息提取逻辑来自老架构 doubao.js（已验证有效）

import { BaseAdapter, type SelectorConfig, type UserTurn } from './base';
import type { RawMessage } from '@/types';
import { generateHashId } from '@/shared/utils';
import { createLogger } from '@/infrastructure/logger';

export class DoubaoAdapter extends BaseAdapter {
  readonly platform = 'doubao';
  readonly platformLabel = '豆包';
  private logger = createLogger('DoubaoAdapter');

  // ── 选择器配置：优先新版 block-v2（.md-box-root），保留旧版回退 ──
  // 2026-08 豆包改版：用户/助手正文统一渲染在 .md-box-root（Markdown 容器），
  // 旧版 .whitespace-pre-wrap / .flow-markdown-body 已从 DOM 中移除
  private readonly selectors: SelectorConfig = {
    observationRoot: ['#chat-route-main main', '#chat-route-main', 'main', '[role="main"]'],
    messageContainer: ['[data-message-id]', '[data-testid="union_message"]'],
    userContent: [
      '[data-message-id] .md-box-root',
      '[data-message-id] .whitespace-pre-wrap',
      '[data-testid="send_message"] [data-testid="message_text_content"]',
    ],
    assistantContent: [
      '[data-message-id] .md-box-root',
      '[data-message-id] .flow-markdown-body',
      '[data-testid="receive_message"] [data-testid="message_text_content"]',
    ],
    thinkingContent:
      '[data-thinking-box-expanded] .flow-markdown-body, [data-testid="think_block_collapse"] [data-testid="message_text_content"]',
    title: 'title',
  };

  // ─────────────────────────────────────────
  // 接口实现
  // ─────────────────────────────────────────

  getSelectors(): SelectorConfig {
    return this.selectors;
  }

  getUserTurns(): UserTurn[] {
    return this.querySelectorAllWithFallback(this.selectors.messageContainer).flatMap((element) => {
      const message = this.extractMessageFromContainer(element);
      return message?.sender === 'user' && message.content
        ? [{ element, text: message.content }]
        : [];
    });
  }

  /**
   * 验证是否为有效的豆包对话 URL
   * 来自老架构 doubao.js isValidConversationUrl
   */
  verifyUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname;

      if (!hostname.includes('doubao.com')) {
        return false;
      }

      // 只处理 /chat/ 后面有具体路径的情况
      // 排除 /chat 或 /chat/ 这种没有具体对话 ID 的情况
      // 排除 /chat/local 路径
      return /^\/chat\/(?!local)[^/]+.*$/.test(pathname);
    } catch {
      return false;
    }
  }

  /**
   * 从 URL 提取对话 ID
   * 来自老架构 doubao.js extractConversationInfo
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
        return pathWithoutLeadingSlash.replace(/\//g, '_');
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 提取页面所有可见消息
   * 核心逻辑来自老架构 doubao.js extractMessages
   */
  extractMessages(): RawMessage[] {
    const messages: RawMessage[] = [];

    // 查找所有消息容器
    const containers = this.querySelectorAllWithFallback(this.selectors.messageContainer);

    if (containers.length === 0) {
      this.logger.debug('未找到消息容器');
      return messages;
    }

    // 检查是否有正在编辑的消息
    const hasEditMode = containers.some((el) => this.isInEditMode(el));
    if (hasEditMode) {
      this.logger.debug('检测到编辑状态，跳过提取');
      return [];
    }

    containers.forEach((container, index) => {
      const extracted = this.extractMessageFromContainer(container);
      if (!extracted) {
        return;
      }

      if (extracted.content && extracted.sender) {
        messages.push({
          hashId: generateHashId(extracted.sender, extracted.content),
          sender: extracted.sender,
          content: extracted.content,
          thinking: extracted.thinking,
          position: index,
        });
      }
    });

    this.logger.debug('提取完成', { messageCount: messages.length });
    return messages;
  }

  private extractMessageFromContainer(
    container: Element
  ): Omit<RawMessage, 'hashId' | 'position'> | null {
    return this.extractModernMessage(container) ?? this.extractLegacyMessage(container);
  }

  private extractModernMessage(container: Element): Omit<RawMessage, 'hashId' | 'position'> | null {
    const foundationType = this.getModernFoundationType(container);
    if (!foundationType) {
      return null;
    }

    const isUser = foundationType.includes('send-message');
    const thinking = isUser ? undefined : this.extractModernThinking(container);

    // 新版 block-v2 结构（2026-08 改版）：正文统一渲染在 .md-box-root，
    // 容器层级为 [data-container-type="block-v2"] > [data-render-engine="node"] > .md-box-root
    const markdownRoots = Array.from(container.querySelectorAll('.md-box-root')).filter(
      (element) => !this.isThinkingContent(element)
    );
    if (markdownRoots.length > 0) {
      const content = markdownRoots
        .map((element) => this.sanitizeContent(element))
        .filter(Boolean)
        .join('\n\n');

      if (!content) {
        return null;
      }

      return isUser ? { sender: 'user', content } : { sender: 'assistant', content, thinking };
    }

    // 旧版 modern 结构回退（2025 版 DOM，已下线，保留以防灰度残留）
    if (isUser) {
      const userTextElement = container.querySelector('.whitespace-pre-wrap');
      const content = userTextElement ? this.sanitizeContent(userTextElement) : '';

      if (!content) {
        return null;
      }

      return {
        sender: 'user',
        content,
      };
    }

    const allMarkdown = Array.from(container.querySelectorAll('.flow-markdown-body'));
    const markdownContent =
      allMarkdown
        .filter((element) => !this.isThinkingContent(element))
        .map((element) => this.sanitizeContent(element))
        .find(Boolean) ?? '';
    const content = markdownContent || this.extractAssistantPlainText(container);

    if (!content) {
      return null;
    }

    return {
      sender: 'assistant',
      content,
      thinking,
    };
  }

  /**
   * 提取思考内容。仅覆盖旧版标记（[data-thinking-box-expanded]）；
   * 新版 block-v2 的思考块标记尚无样本，如确认思考内容混入正文需补充区分逻辑
   */
  private extractModernThinking(container: Element): string | undefined {
    const thinkingBox = container.querySelector('[data-thinking-box-expanded]');
    const thinkingMarkdown = thinkingBox?.querySelector('.flow-markdown-body');
    return thinkingMarkdown ? this.sanitizeContent(thinkingMarkdown) || undefined : undefined;
  }

  private isThinkingContent(element: Element): boolean {
    return Boolean(
      element.closest('[data-thinking-box-expanded], [data-testid="think_block_collapse"]')
    );
  }

  private extractAssistantPlainText(container: Element): string {
    const clone = container.cloneNode(true) as Element;

    clone
      .querySelectorAll(
        [
          '[data-thinking-box-expanded]',
          '[data-testid="think_block_collapse"]',
          '[data-foundation-type="receive-message-suggest-foundation"]',
          'button',
          'svg',
          'img',
          'input',
          'textarea',
          '[role="button"]',
          '[contenteditable="true"]',
          '[data-testid*="copy"]',
          '[data-testid*="toolbar"]',
          '[class*="toolbar"]',
          '[class*="action"]',
        ].join(',')
      )
      .forEach((node) => node.remove());

    return this.sanitizeContent(clone);
  }

  private getModernFoundationType(container: Element): string {
    const parent = container.parentElement;
    if (!parent) {
      return '';
    }

    const actionBar = parent.querySelector('[data-foundation-type]');
    return actionBar?.getAttribute('data-foundation-type') ?? '';
  }

  private extractLegacyMessage(container: Element): Omit<RawMessage, 'hashId' | 'position'> | null {
    const sendMessage = container.querySelector('[data-testid="send_message"]');
    if (sendMessage) {
      const userTextElement = sendMessage.querySelector('[data-testid="message_text_content"]');
      const content = userTextElement ? this.sanitizeContent(userTextElement) : '';

      if (!content) {
        return null;
      }

      return {
        sender: 'user',
        content,
      };
    }

    const receiveMessage = container.querySelector('[data-testid="receive_message"]');
    if (!receiveMessage) {
      return null;
    }

    const thinkBlock = receiveMessage.querySelector('[data-testid="think_block_collapse"]');
    const thinkingTextElement = thinkBlock?.querySelector('[data-testid="message_text_content"]');
    const thinking = thinkingTextElement
      ? this.sanitizeContent(thinkingTextElement) || undefined
      : undefined;

    const allTextElements = Array.from(
      receiveMessage.querySelectorAll('[data-testid="message_text_content"]')
    );
    const content =
      allTextElements
        .filter((textElement) => !textElement.closest('[data-testid="think_block_collapse"]'))
        .map((textElement) => this.sanitizeContent(textElement))
        .find(Boolean) ?? '';

    if (!content) {
      return null;
    }

    return {
      sender: 'assistant',
      content,
      thinking,
    };
  }
}
