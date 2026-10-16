// src/content/adapters/index.ts
// 适配器模块公开导出

export { BaseAdapter } from './base';
export type { SelectorConfig } from './base';
export { KimiAdapter } from './kimi';
export { DoubaoAdapter } from './doubao';
export { GeminiAdapter } from './gemini';
export { ChatGPTAdapter } from './chatgpt';
export { adapterRegistry } from './registry';
