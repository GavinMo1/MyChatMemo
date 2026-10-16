// src/content/adapters/gemini.ts
// Gemini 平台适配器
// 选择器、URL 验证、消息提取逻辑来自老架构 gemini.js（已验证有效）

import { BaseAdapter, type SelectorConfig } from './base';
import type { RawMessage } from '@/types';
import { generateHashId } from '@/shared/utils';
import { createLogger } from '@/infrastructure/logger';

export class GeminiAdapter extends BaseAdapter {
  readonly platform = 'gemini';
  readonly platformLabel = 'Gemini';
  private logger = createLogger('GeminiAdapter');

  // ── 选择器配置（来自老架构 gemini.js）──
  private readonly selectors: SelectorConfig = {
    observationRoot: ['#chat-history'],
    messageContainer: [
      '.conversation-container', // 对话块（每块包含一问一答）
    ],
    userContent: ['user-query .query-text'],
    assistantContent: ['model-response .model-response-text'],
    // Gemini 暂无思考链展示
    title: 'title',
  };

  // ─────────────────────────────────────────
  // 接口实现
  // ─────────────────────────────────────────

  getSelectors(): SelectorConfig {
    return this.selectors;
  }

  /**
   * 从 document.title 解析对话标题
   * Gemini 页面标题格式为 "对话标题 - Gemini"，需去掉后缀
   */
  extractTitle(): string | null {
    const pageTitle = document.title?.trim();
    if (!pageTitle) return null;

    // 去掉 " - Gemini" 后缀
    const cleaned = pageTitle.replace(/\s*[-–—]\s*Gemini\s*$/i, '').trim();

    // 如果去掉后缀后为空、或仍是通用页面标题，则返回 null 让上层走 fallback
    if (!cleaned || /^google\s*gemini$/i.test(cleaned) || /^gemini$/i.test(cleaned)) {
      return null;
    }

    return cleaned;
  }

  /**
   * 验证是否为有效的 Gemini 对话 URL
   * 来自老架构 gemini.js isValidConversationUrl
   */
  verifyUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname;

      if (!hostname.includes('gemini.google.com')) {
        return false;
      }

      // 支持多种 URL 格式
      const validPatterns = [
        /^\/gem\/[^/]+\/[^/]+$/, // /gem/*/conversation_id
        /^\/app\/[^/]+$/, // /app/conversation_id
        /^\/[^/]+\/[^/]+\/app\/[^/]+$/, // /*/*/app/conversation_id
        /^\/[^/]+\/[^/]+\/gem\/[^/]+\/[^/]+$/, // /*/*/gem/*/conversation_id
      ];

      // 排除初始无内容页面
      if (
        pathname === '/app' ||
        /^\/gem\/[^/]+$/.test(pathname) ||
        /^\/[^/]+\/[^/]+\/app$/.test(pathname) ||
        /^\/[^/]+\/[^/]+\/gem\/[^/]+$/.test(pathname)
      ) {
        return false;
      }

      return validPatterns.some((pattern) => pattern.test(pathname));
    } catch {
      return false;
    }
  }

  /**
   * 从 URL 提取对话 ID
   * 来自老架构 gemini.js extractConversationInfo
   */
  extractConversationId(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const pathWithoutLeadingSlash = pathname.startsWith('/') ? pathname.substring(1) : pathname;

      const pathSegments = pathWithoutLeadingSlash.split('/');

      let conversationId: string | null = null;

      if (pathSegments.length >= 2) {
        if (pathSegments[0] === 'app' && pathSegments[1]) {
          conversationId = pathSegments[1];
        } else if (pathSegments[0] === 'gem' && pathSegments.length >= 3 && pathSegments[2]) {
          conversationId = pathSegments[2];
        } else if (pathSegments.length >= 4 && pathSegments[2] === 'app' && pathSegments[3]) {
          conversationId = pathSegments[3];
        } else if (pathSegments.length >= 5 && pathSegments[2] === 'gem' && pathSegments[4]) {
          conversationId = pathSegments[4];
        }
      }

      if (conversationId) {
        // 使用完整路径作为对话 ID，将斜杠替换为下划线
        return pathWithoutLeadingSlash.replace(/\//g, '_');
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * 提取页面所有可见消息
   * 核心逻辑来自老架构 gemini.js extractMessages
   *
   * Gemini 的对话块 (.conversation-container) 每块包含一个用户提问和一个 AI 回复
   * 因此在 position 计算上采用 blockIndex*2 / blockIndex*2+1 确保顺序稳定
   */
  extractMessages(): RawMessage[] {
    const messages: RawMessage[] = [];

    // Gemini 的聊天历史容器
    const chatHistory = document.querySelector('#chat-history');
    if (!chatHistory) {
      this.logger.debug('未找到聊天历史容器', {
        selector: '#chat-history',
      });
      return messages;
    }

    const conversationBlocks = chatHistory.querySelectorAll('.conversation-container');
    if (conversationBlocks.length === 0) {
      this.logger.debug('未找到对话块', {
        selector: '.conversation-container',
      });
      return messages;
    }

    // 检查是否有正在编辑的消息
    const hasEditMode = Array.from(conversationBlocks).some((el) => this.isInEditMode(el));
    if (hasEditMode) {
      this.logger.debug('检测到编辑状态，跳过提取');
      return [];
    }

    conversationBlocks.forEach((block, blockIndex) => {
      // ── 用户消息 ─────────────────────────────────────────────────
      const userQueryContainer = block.querySelector('user-query .query-text');
      if (userQueryContainer) {
        const userContent = this.sanitizeContent(userQueryContainer);
        if (userContent.trim()) {
          const position = blockIndex * 2; // 用户消息在偶数位置
          messages.push({
            hashId: generateHashId('user', userContent),
            sender: 'user',
            content: userContent,
            position,
          });
        }
      }

      // ── AI 消息 ──────────────────────────────────────────────────
      const modelResponseEntity = block.querySelector('model-response');
      if (modelResponseEntity) {
        const responseTextEl = modelResponseEntity.querySelector('.model-response-text');
        if (responseTextEl) {
          const aiContent = this.sanitizeContent(responseTextEl);
          if (aiContent.trim()) {
            const position = blockIndex * 2 + 1; // AI 消息在奇数位置
            messages.push({
              hashId: generateHashId('assistant', aiContent),
              sender: 'assistant',
              content: aiContent,
              position,
            });
          }
        }
      }
    });

    this.logger.debug('提取完成', { messageCount: messages.length });
    return messages;
  }
}
