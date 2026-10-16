import { describe, expect, it } from 'vitest';
import {
  getExtensionContextInvalidatedMessage,
  isExtensionContextInvalidatedError,
} from '@/shared/extensionContext';

describe('extension context helpers', () => {
  it('detects extension context invalidation errors', () => {
    expect(isExtensionContextInvalidatedError(new Error('Extension context invalidated.'))).toBe(true);
    expect(isExtensionContextInvalidatedError('Error: Extension context invalidated.')).toBe(true);
    expect(isExtensionContextInvalidatedError(new Error('another error'))).toBe(false);
  });

  it('returns user-facing reopen messages', () => {
    expect(getExtensionContextInvalidatedMessage('sidepanel')).toContain('重新打开这个面板');
    expect(getExtensionContextInvalidatedMessage('popup')).toContain('重新打开这个弹窗');
  });
});
