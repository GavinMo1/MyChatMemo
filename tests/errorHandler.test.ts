import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ExtensionError,
  formatError,
  formatUserErrorMessage,
  handleError,
  handleIPCError,
  isContextInvalidatedError,
  logError,
} from '@/infrastructure/errorHandler';
import { getErrorMessage, isExtensionContextInvalidatedError } from '@/shared/extensionContext';
import { setLogLevel } from '@/infrastructure/logger';

beforeEach(() => {
  setLogLevel('debug');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('safe error messages', () => {
  it.each([
    [new Error('failed'), 'failed'],
    ['plain error', 'plain error'],
    [undefined, 'undefined'],
    [null, 'null'],
    [false, 'false'],
    [0, '0'],
    ['', ''],
    [BigInt(42), '42'],
    [Symbol('failure'), 'Symbol(failure)'],
    [{ message: 'details' }, '{"message":"details"}'],
  ])('returns a string for %s', (error, expected) => {
    expect(getErrorMessage(error)).toBe(expected);
    expect(formatError(error)).toBe(expected);
  });

  it('falls back for circular objects and custom toJSON returning undefined', () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(formatError(circular)).toBe('[object Object]');
    expect(formatError({ toJSON: () => undefined })).toBe('[object Object]');
  });

  it('does not throw even when both JSON serialization and string conversion fail', () => {
    const hostile = {
      toJSON: () => {
        throw new Error('json failed');
      },
      toString: () => {
        throw new Error('string failed');
      },
    };
    expect(formatError(hostile)).toBe('未知错误');
    expect(isExtensionContextInvalidatedError(hostile)).toBe(false);
    expect(isExtensionContextInvalidatedError(undefined)).toBe(false);
  });
});

describe('one logging output with development and production detail', () => {
  it('passes original error and full context to the logger during development', () => {
    vi.stubEnv('DEV', true);
    const error = new Error('save failed');
    const context = { component: 'Panel', action: 'save', metadata: { id: 'one' } };
    logError(error, context);
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      '[ErrorHandler] save failed',
      context,
      error
    );
  });

  it('keeps production logging to the readable message and component', () => {
    vi.stubEnv('DEV', false);
    const error = new Error('save failed');
    logError(error, { component: 'Panel', action: 'save', metadata: { details: 'private' } });
    expect(console.error).toHaveBeenCalledExactlyOnceWith('[ErrorHandler] save failed', {
      component: 'Panel',
    });
  });

  it.each([false, 0, ''])(
    'preserves falsy thrown values through errorHandler in development',
    (error) => {
      vi.stubEnv('DEV', true);
      logError(error);
      expect(console.error).toHaveBeenCalledExactlyOnceWith(
        `[ErrorHandler] ${String(error)}`,
        error
      );
    }
  );
});

describe('public error handling and context classification', () => {
  it.each(['message port closed', 'Could not establish connection'])(
    'keeps %s in the legacy broad classification without requiring refresh',
    (message) => {
      const error = new Error(message);
      expect(isContextInvalidatedError(error)).toBe(true);
      expect(isExtensionContextInvalidatedError(error)).toBe(false);
      expect(formatUserErrorMessage(error)).toBe(message);
      expect(handleIPCError(error)).toBe(message);
      expect(formatUserErrorMessage(error)).not.toContain('刷新');
    }
  );

  it('uses the refresh hint and IPC marker only for actual extension context invalidation', () => {
    expect(isContextInvalidatedError(new Error('Extension context invalidated.'))).toBe(true);
    expect(formatUserErrorMessage(new Error('Extension context invalidated.'))).toContain('刷新');
    expect(formatUserErrorMessage('Extension context invalidated.')).toContain('刷新');
    expect(handleIPCError(new Error('Extension context invalidated.'))).toBe('CONTEXT_INVALIDATED');
  });

  it('preserves ExtensionError, storage/network guidance, fallback and handleError callback APIs', () => {
    const context = { component: 'Panel', action: 'save' };
    const custom = new ExtensionError('用户说明', 'warning', context);
    expect(custom.severity).toBe('warning');
    expect(custom.context).toBe(context);
    expect(formatUserErrorMessage(custom)).toBe('用户说明');
    expect(formatUserErrorMessage(new Error('quota exceeded'))).toContain('存储空间不足');
    expect(formatUserErrorMessage(new Error('network unavailable'))).toContain('网络连接失败');
    expect(formatUserErrorMessage(undefined, '请重试')).toBe('请重试');
    const onError = vi.fn();
    handleError(custom, context, onError);
    expect(onError).toHaveBeenCalledExactlyOnceWith('用户说明');
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
