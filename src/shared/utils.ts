// src/shared/utils.ts
// 共享工具函数 —— 可在 Content Script 和 Background 中使用（不依赖 DOM）

/**
 * 生成轻量级内容哈希（djb2 变体）
 * 与老架构 DataUtils.hashContent 算法一致
 */
export function hashContent(str: string): string {
  let hash = 0;
  if (str.length === 0) return hash.toString(36);
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // 强制转 32 位整数
  }
  return Math.abs(hash).toString(36);
}

/**
 * 生成消息哈希 ID（用于锚点匹配）
 * 格式: {sender_prefix}_{base64(content[:50])[:16]}
 */
export function generateHashId(sender: 'user' | 'assistant', content: string): string {
  const prefix = sender === 'user' ? 'u' : 'a';
  const fingerprint = content.substring(0, 50);
  // btoa 仅支持 Latin-1，对中文先进行 encodeURIComponent 处理
  const safeFingerprint = encodeURIComponent(fingerprint);
  return `${prefix}_${btoa(safeFingerprint).substring(0, 16)}`;
}

/**
 * 生成消息唯一 ID
 * 格式: msg_{conversationId}_{sender}_position_{index}
 * 包含 conversationId 以确保跨对话唯一性
 */
export function generateMessageId(conversationId: string, sender: string, index: number): string {
  return `msg_${conversationId}_${sender}_position_${index}`;
}

/**
 * 从消息内容生成对话标题（取第一条用户消息前 50 字符）
 */
export function generateTitleFromContent(content: string): string {
  const trimmed = content.trim();
  return trimmed.length > 50 ? trimmed.substring(0, 50) + '…' : trimmed;
}

/**
 * 计算字符数（粗略词数，兼容中英文）
 */
export function countWords(text: string): number {
  // 中文：每个字符算一个词；英文：按空格拆分
  const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const english = (text.replace(/[\u4e00-\u9fa5]/g, ' ').match(/\S+/g) || []).length;
  return chinese + english;
}

/**
 * 节流函数（返回值保留最后一次调用的结果）
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, delay);
  };
}

// 日期格式化缓存
const dateFormatCache = new Map<string, string>();
const MAX_CACHE_SIZE = 1000;

/**
 * 格式化日期（带缓存）
 * 性能优化：避免重复格式化相同的日期字符串
 */
export function formatDateCached(dateStr: string): string {
  // 检查缓存
  const cached = dateFormatCache.get(dateStr);
  if (cached) return cached;

  // 格式化日期
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  let formatted: string;
  if (diff < 60000) {
    formatted = '刚刚';
  } else if (diff < 3600000) {
    formatted = `${Math.floor(diff / 60000)} 分钟前`;
  } else if (diff < 86400000) {
    formatted = `${Math.floor(diff / 3600000)} 小时前`;
  } else if (diff < 604800000) {
    formatted = `${Math.floor(diff / 86400000)} 天前`;
  } else {
    formatted = date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  // 缓存结果（限制缓存大小）
  if (dateFormatCache.size >= MAX_CACHE_SIZE) {
    const firstKey = dateFormatCache.keys().next().value;
    if (firstKey) dateFormatCache.delete(firstKey);
  }
  dateFormatCache.set(dateStr, formatted);

  return formatted;
}
