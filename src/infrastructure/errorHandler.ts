// src/infrastructure/errorHandler.ts
// 统一错误处理和用户反馈

import { getErrorMessage, isExtensionContextInvalidatedError } from '@/shared/extensionContext';
import { createLogger } from './logger';

const logger = createLogger('ErrorHandler');

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'fatal';

export interface ErrorContext {
  component?: string;
  action?: string;
  metadata?: Record<string, unknown>;
}

export class ExtensionError extends Error {
  constructor(
    message: string,
    public severity: ErrorSeverity = 'error',
    public context?: ErrorContext
  ) {
    super(message);
    this.name = 'ExtensionError';
  }
}

/**
 * 提取错误的可读消息（用于日志与 IPC 错误响应）
 */
export function formatError(error: unknown): string {
  return getErrorMessage(error);
}

/**
 * 兼容旧调用方的广义扩展连接故障判断（含端口关闭与连接失败）。
 * 用户刷新提示应使用 isExtensionContextInvalidatedError 的窄义判断。
 */
export function isContextInvalidatedError(error: unknown): boolean {
  if (!error) return false;
  // 保留旧 API 的广义连接故障分类；它不等于需要用户刷新页面。
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('extension context invalidated') ||
    message.includes('message port closed') ||
    message.includes('could not establish connection')
  );
}

/**
 * 格式化错误消息供用户查看
 */
export function formatUserErrorMessage(error: unknown, fallback = '操作失败'): string {
  if (!error) return fallback;

  if (error instanceof ExtensionError) {
    return error.message;
  }

  // 只有真正的上下文失效需要刷新，普通端口关闭或连接失败保持原错误信息。
  if (isExtensionContextInvalidatedError(error)) {
    return '扩展已重新加载，请刷新页面后重试';
  }

  if (error instanceof Error) {
    // 特殊错误类型的用户友好消息
    if (error.message.includes('quota')) {
      return '存储空间不足，请删除一些对话后重试';
    }

    if (error.message.includes('network')) {
      return '网络连接失败，请检查网络后重试';
    }

    return error.message || fallback;
  }

  return getErrorMessage(error) || fallback;
}

/**
 * 记录错误日志（开发环境详细，生产环境简化）
 */
export function logError(error: unknown, context?: ErrorContext): void {
  const isDev = import.meta.env.DEV;

  if (isDev) {
    logger.error(formatError(error), context ? { ...context } : undefined, error);
  } else {
    logger.error(
      formatError(error),
      context?.component ? { component: context.component } : undefined
    );
  }
}

/**
 * 处理 IPC 错误并返回用户友好消息
 */
export function handleIPCError(error: unknown, context?: ErrorContext): string {
  logError(error, context);

  // 如果是上下文失效，返回特殊标记
  if (isExtensionContextInvalidatedError(error)) {
    return 'CONTEXT_INVALIDATED';
  }

  return formatUserErrorMessage(error);
}

/**
 * 通用错误处理器（用于 UI 组件）
 */
export function handleError(
  error: unknown,
  context?: ErrorContext,
  onError?: (message: string) => void
): void {
  const message = formatUserErrorMessage(error);
  logError(error, context);

  if (onError) {
    onError(message);
  }
}
