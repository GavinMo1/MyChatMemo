// src/infrastructure/logger.ts
// 统一日志工具：提供分级日志、作用域前缀和上下文对象输出

import { DEBUG_LOG_ENABLED } from '@/shared/constants';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

let currentLevel: LogLevel = DEBUG_LOG_ENABLED ? 'debug' : 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return levelOrder[level] >= levelOrder[currentLevel];
}

function write(
  level: LogLevel,
  scope: string,
  message: string,
  context?: Record<string, unknown>,
  error?: unknown
): void {
  if (!shouldLog(level)) return;

  const prefix = `[${scope}] ${message}`;
  const hasContext = context && Object.keys(context).length > 0;
  const hasError = error !== undefined;

  if (level === 'error') {
    if (hasContext && hasError) {
      console.error(prefix, context, error);
      return;
    }
    if (hasContext) {
      console.error(prefix, context);
      return;
    }
    if (hasError) {
      console.error(prefix, error);
      return;
    }
    console.error(prefix);
    return;
  }

  if (level === 'warn') {
    hasContext ? console.warn(prefix, context) : console.warn(prefix);
    return;
  }

  if (level === 'info') {
    hasContext ? console.info(prefix, context) : console.info(prefix);
    return;
  }

  hasContext ? console.debug(prefix, context) : console.debug(prefix);
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, context?: Record<string, unknown>) =>
      write('debug', scope, message, context),
    info: (message: string, context?: Record<string, unknown>) =>
      write('info', scope, message, context),
    warn: (message: string, context?: Record<string, unknown>) =>
      write('warn', scope, message, context),
    error: (message: string, context?: Record<string, unknown>, error?: unknown) =>
      write('error', scope, message, context, error),
  };
}
