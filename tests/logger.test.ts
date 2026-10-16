import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger, setLogLevel } from '@/infrastructure/logger';

describe('logger output', () => {
  beforeEach(() => {
    setLogLevel('debug');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });
  afterEach(() => {
    setLogLevel('debug');
    vi.restoreAllMocks();
  });

  it.each([false, 0, '', null])(
    'preserves the original falsy error %s with and without context',
    (error) => {
      const logger = createLogger('Test');
      logger.error('failed', undefined, error);
      expect(console.error).toHaveBeenLastCalledWith('[Test] failed', error);
      const context = { action: 'save' };
      logger.error('failed', context, error);
      expect(console.error).toHaveBeenLastCalledWith('[Test] failed', context, error);
    }
  );

  it('omits an unspecified error and an empty context', () => {
    const logger = createLogger('Test');
    logger.error('failed');
    logger.error('failed', {});
    expect(vi.mocked(console.error).mock.calls).toEqual([['[Test] failed'], ['[Test] failed']]);
  });

  it('applies one log threshold to every output level', () => {
    const logger = createLogger('Test');
    setLogLevel('warn');
    logger.debug('debug');
    logger.info('info');
    logger.warn('warning', { count: 1 });
    logger.error('error');
    expect(console.debug).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith('[Test] warning', { count: 1 });
    expect(console.error).toHaveBeenCalledExactlyOnceWith('[Test] error');
  });
});
