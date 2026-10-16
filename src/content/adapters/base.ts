// src/content/adapters/base.ts
// 抽象基类适配器
// 扩展新平台只需继承此类，实现 abstract 方法即可
//
// 最小实现清单:
//   1. platform: string              —— 平台标识（如 'chatgpt'）
//   2. platformLabel: string          —— 平台显示名（如 'ChatGPT'）
//   3. verifyUrl(url): boolean        —— 判断 URL 是否属于本平台
//   4. extractConversationId(url)     —— 从 URL 提取对话 ID
//   5. extractMessages(): RawMessage[] —— 从 DOM 提取当前可见消息
//   6. getSelectors(): SelectorConfig —— 返回选择器配置
//
// 可选覆盖:
//   - extractTitle()     —— 自定义标题提取
//   - sanitizeContent()  —— 自定义内容清洗
//   - prepareForExtraction() —— 提取前的异步准备（例如触发虚拟列表渲染）

import type { RawMessage } from '@/types';
import { elementToMarkdown } from '../elementToMarkdown';

export interface SelectorConfig {
  /** 覆盖所有消息的稳定根，不能使用单条消息选择器。 */
  observationRoot?: string[];
  messageContainer: string[];
  userContent: string[];
  assistantContent: string[];
  thinkingContent?: string;
  title: string;
}

export interface UserTurn {
  element: Element;
  text: string;
}

export interface ExtractionOptions {
  /** 是否允许适配器主动滚动虚拟列表来采集完整对话 */
  fullPage?: boolean;
}

export abstract class BaseAdapter {
  /** 平台标识，用于数据存储（如 'kimi', 'chatgpt'） */
  abstract readonly platform: string;

  /** 平台显示名，用于 UI 展示（如 'Kimi', 'ChatGPT'） */
  abstract readonly platformLabel: string;

  // ─────────────────────────────────────────
  // 子类必须实现的方法
  // ─────────────────────────────────────────

  /** 验证 URL 是否属于本平台的有效对话页面 */
  abstract verifyUrl(url: string): boolean;

  /** 从 URL 提取对话 ID */
  abstract extractConversationId(url: string): string | null;

  /** 提取当前页面所有可见消息 */
  abstract extractMessages(): RawMessage[];

  /** 获取选择器配置 */
  abstract getSelectors(): SelectorConfig;

  // ─────────────────────────────────────────
  // 可选生命周期钩子（子类可覆盖）
  // ─────────────────────────────────────────

  /** 观察器与时间线共享同一根；找不到时由调用方有限重试。 */
  getObservationRoot(): Element | null {
    const root = this.querySelectorWithFallback(this.getSelectors().observationRoot ?? []);
    return root === document.body || root === document.documentElement ? null : root;
  }

  /** 时间线仅消费统一能力，不需要知道平台 DOM 结构。 */
  getUserTurns(): UserTurn[] {
    return this.querySelectorAllWithFallback(this.getSelectors().userContent)
      .map((element) => ({ element, text: element.textContent?.trim() ?? '' }))
      .filter((turn) => turn.text.length > 0);
  }

  /** 提取前的异步准备（可用于虚拟列表预渲染等） */
  async prepareForExtraction(_url: string, _options?: ExtractionOptions): Promise<void> {
    // 默认无操作
  }

  // ─────────────────────────────────────────
  // 公共工具方法
  // ─────────────────────────────────────────

  /** 多层级回退选择器查询（单个） */
  protected querySelectorWithFallback(
    selectors: string[],
    parent: Element | Document = document
  ): Element | null {
    for (const sel of selectors) {
      try {
        const el = parent.querySelector(sel);
        if (el) return el;
      } catch {
        // 无效选择器，跳过
      }
    }
    return null;
  }

  /** 多层级回退选择器查询（全部） */
  protected querySelectorAllWithFallback(
    selectors: string[],
    parent: Element | Document = document
  ): Element[] {
    for (const sel of selectors) {
      try {
        const els = Array.from(parent.querySelectorAll(sel));
        if (els.length > 0) return els;
      } catch {
        // 无效选择器，跳过
      }
    }
    return [];
  }

  /**
   * 提取元素的格式化内容（HTML → Markdown）
   * 克隆节点后移除干扰元素（按钮/图标等），再将 HTML 还原为 Markdown 格式
   */
  protected sanitizeContent(element: Element): string {
    return elementToMarkdown(element);
  }

  /** 提取页面标题（子类可覆盖） */
  extractTitle(): string | null {
    const selectors = this.getSelectors();
    const el = this.querySelectorWithFallback([selectors.title]);
    return el ? (el as HTMLElement).innerText?.trim() || null : null;
  }

  /** 检查元素是否处于编辑状态（老架构 isInEditMode 逻辑） */
  protected isInEditMode(element: Element): boolean {
    return !!element.querySelector('textarea:focus');
  }
}
