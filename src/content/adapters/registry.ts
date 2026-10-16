// src/content/adapters/registry.ts
// 适配器注册表 —— 集中管理所有平台适配器
// 扩展新平台时只需：1) 创建适配器类  2) 在此注册

import type { BaseAdapter } from './base';
import { KimiAdapter } from './kimi';
import { DoubaoAdapter } from './doubao';
import { GeminiAdapter } from './gemini';
import { ChatGPTAdapter } from './chatgpt';

/**
 * 适配器注册表
 * - 通过 register() 注册新适配器
 * - 通过 getAdapter() 根据当前 URL 自动匹配适配器
 *
 * 未来扩展示例:
 *   import { ChatGPTAdapter } from './chatgpt';
 *   registry.register(new ChatGPTAdapter());
 */
class AdapterRegistry {
  private adapters: BaseAdapter[] = [];

  /** 注册一个平台适配器 */
  register(adapter: BaseAdapter): void {
    this.adapters.push(adapter);
  }

  /** 根据 URL 匹配并返回对应的适配器，无匹配返回 null */
  getAdapter(url: string): BaseAdapter | null {
    return this.adapters.find((a) => a.verifyUrl(url)) ?? null;
  }

  /** 获取所有已注册的适配器 */
  getAll(): readonly BaseAdapter[] {
    return this.adapters;
  }

  /** 获取所有已注册的平台标识 */
  getPlatforms(): string[] {
    return this.adapters.map((a) => a.platform);
  }
}

// ─────────────────────────────────────────
// 创建全局注册表并注册内置适配器
// ─────────────────────────────────────────

export const adapterRegistry = new AdapterRegistry();

// 注册内置适配器（扩展新平台时在此添加）
adapterRegistry.register(new KimiAdapter());
adapterRegistry.register(new DoubaoAdapter());
adapterRegistry.register(new GeminiAdapter());
adapterRegistry.register(new ChatGPTAdapter());
