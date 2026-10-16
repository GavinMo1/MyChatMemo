import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SmartObserver } from '@/content/smartObserver';
import { ChatGPTAdapter } from '@/content/adapters/chatgpt';
import { GeminiAdapter } from '@/content/adapters/gemini';

const flush = () => Promise.resolve();

describe('SmartObserver', () => {
  const observers: SmartObserver[] = [];
  const observe = (options: ConstructorParameters<typeof SmartObserver>[0]) => {
    const observer = new SmartObserver(options);
    observers.push(observer);
    observer.startObserving();
    return observer;
  };
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<main id="test-container"><article>first turn</article></main>';
  });
  afterEach(() => {
    observers.splice(0).forEach((observer) => observer.stop());
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('uses 1500ms by default and respects an explicit debounce delay', async () => {
    const defaultTrigger = vi.fn();
    const customTrigger = vi.fn();
    observe({ containerSelector: 'main', onTrigger: defaultTrigger });
    observe({ containerSelector: 'main', debounceDelay: 200, onTrigger: customTrigger });
    document.querySelector('main')!.appendChild(document.createElement('article'));
    await flush();
    vi.advanceTimersByTime(199);
    expect(customTrigger).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(customTrigger).toHaveBeenCalledTimes(1);
    expect(defaultTrigger).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1300);
    expect(defaultTrigger).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['ChatGPT', new ChatGPTAdapter(), '<main><article>first</article></main>', 'main', 'article'],
    [
      'Gemini',
      new GeminiAdapter(),
      '<div id="chat-history"><div class="conversation-container">first</div></div>',
      '#chat-history',
      'div',
    ],
  ])(
    'captures new sibling rounds for %s rather than watching only the first message',
    async (_name, adapter, html, rootSelector, tag) => {
      document.body.innerHTML = html;
      const onTrigger = vi.fn();
      observe({ resolveTarget: () => adapter.getObservationRoot(), onTrigger });
      document.querySelector(rootSelector)!.appendChild(document.createElement(tag));
      await flush();
      vi.advanceTimersByTime(1500);
      expect(onTrigger).toHaveBeenCalledTimes(1);
    }
  );

  it('forces snapshots during continuous changes across multiple 10-second intervals', async () => {
    const onTrigger = vi.fn();
    observe({ containerSelector: 'main', onTrigger });
    for (let i = 0; i < 40; i++) {
      document.querySelector('main')!.appendChild(document.createElement('span'));
      await flush();
      vi.advanceTimersByTime(500);
    }
    expect(onTrigger).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1500);
    // The second forced snapshot already captured the final mutation.
    expect(onTrigger).toHaveBeenCalledTimes(2);
  });

  it('binds a late root and rebinds a replaced root, including pre-existing content', async () => {
    document.body.innerHTML = '';
    const onTrigger = vi.fn();
    const onTargetReady = vi.fn();
    observe({ containerSelector: 'main', onTrigger, onTargetReady });
    document.body.innerHTML = '<main><article>loaded before binding</article></main>';
    vi.advanceTimersByTime(500);
    expect(onTargetReady).toHaveBeenCalledTimes(1);
    const replacement = document.createElement('main');
    replacement.innerHTML = '<article>replacement content</article>';
    document.querySelector('main')!.replaceWith(replacement);
    vi.advanceTimersByTime(500);
    expect(onTargetReady).toHaveBeenCalledTimes(2);
    replacement.appendChild(document.createElement('article'));
    await flush();
    vi.advanceTimersByTime(1500);
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('bounds missing-root retries without observing body or html', async () => {
    document.body.innerHTML = '';
    const onTrigger = vi.fn();
    const onTargetReady = vi.fn();
    const observeSpy = vi.spyOn(MutationObserver.prototype, 'observe');
    observe({ containerSelector: 'main', onTrigger, onTargetReady });
    document.body.appendChild(document.createElement('aside'));
    await flush();
    vi.advanceTimersByTime(11000);
    expect(observeSpy).not.toHaveBeenCalled();
    expect(onTrigger).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    document.body.appendChild(document.createElement('main'));
    vi.advanceTimersByTime(2000);
    expect(onTargetReady).not.toHaveBeenCalled();
    observe({ containerSelector: 'body', onTrigger });
    vi.advanceTimersByTime(11000);
    expect(observeSpy).not.toHaveBeenCalled();
  });

  it('stop cancels queued saves, root checks and future mutations', async () => {
    const onTrigger = vi.fn();
    const observer = observe({ containerSelector: 'main', onTrigger });
    document.querySelector('main')!.appendChild(document.createElement('article'));
    await flush();
    observer.stop();
    document.querySelector('main')!.appendChild(document.createElement('article'));
    await flush();
    vi.advanceTimersByTime(15000);
    expect(onTrigger).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('recovers a slowly mounted root on focus after bounded polling pauses', () => {
    document.body.innerHTML = '';
    const onTargetReady = vi.fn();
    const observer = observe({ containerSelector: 'main', onTrigger: vi.fn(), onTargetReady });
    vi.advanceTimersByTime(11000);
    expect(vi.getTimerCount()).toBe(0);
    document.body.innerHTML = '<main><article>slow content</article></main>';
    window.dispatchEvent(new Event('focus'));
    expect(onTargetReady).toHaveBeenCalledTimes(1);
    observer.stop();
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vi.getTimerCount()).toBe(0);
    expect(onTargetReady).toHaveBeenCalledTimes(1);
  });

  it('reduces unrelated mutations and extraction calls compared with the previous body/300ms fallback', async () => {
    const baselineExtract = vi.fn();
    let baselineTimer: ReturnType<typeof setTimeout>;
    let baselineMutations = 0;
    const baseline = new MutationObserver((mutations) => {
      baselineMutations += mutations.length;
      clearTimeout(baselineTimer);
      baselineTimer = setTimeout(baselineExtract, 300);
    });
    baseline.observe(document.body, { childList: true, subtree: true });
    const currentExtract = vi.fn();
    observe({ containerSelector: 'main', onTrigger: currentExtract });
    const aside = document.createElement('aside');
    document.body.appendChild(aside);
    await flush();
    for (let i = 0; i < 10; i++) {
      aside.appendChild(document.createElement('span'));
      document.querySelector('main')!.appendChild(document.createElement('article'));
      await flush();
      vi.advanceTimersByTime(400);
    }
    vi.advanceTimersByTime(1500);
    expect(baselineMutations).toBe(21);
    expect(baselineExtract).toHaveBeenCalledTimes(10);
    expect(currentExtract).toHaveBeenCalledTimes(1);
    baseline.disconnect();
    clearTimeout(baselineTimer!);
  });

  it('ignores characterData changes', async () => {
    const onTrigger = vi.fn();
    observe({ containerSelector: 'main', onTrigger });
    document.querySelector('article')!.firstChild!.textContent = 'stream text';
    await flush();
    vi.advanceTimersByTime(1500);
    expect(onTrigger).not.toHaveBeenCalled();
  });
});
