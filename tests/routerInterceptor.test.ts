import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRouteRevision, interceptHistory } from '@/content/routerInterceptor';

describe('isolated-world route detection', () => {
  let cleanup: (() => void) | undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    history.replaceState({}, '', '/initial');
  });
  afterEach(() => {
    cleanup?.();
    vi.useRealTimers();
  });

  it('detects URL changes without relying on a patched main-world history method', () => {
    // Capture the original just as the website main world has its own method.
    const websitePushState = history.pushState.bind(history);
    const original = history.pushState;
    const onRoute = vi.fn();
    cleanup = interceptHistory(onRoute);
    expect(history.pushState).toBe(original);
    websitePushState({}, '', '/second');
    vi.advanceTimersByTime(500);
    expect(onRoute).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(onRoute).toHaveBeenCalledTimes(1);
    websitePushState({}, '', '/third');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(onRoute).toHaveBeenCalledTimes(2);
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('invalidates an extraction before the next polling tick', () => {
    const revision = getRouteRevision();
    history.replaceState({}, '', '/different');
    expect(getRouteRevision()).not.toBe(revision);
  });
});
