// 仅监听适配器指定的对话根；延迟挂载/替换时有限重试，绝不回退整个页面。
import { OBSERVER_DEBOUNCE_DELAY, OBSERVER_FORCE_SAVE_INTERVAL } from '@/shared/constants';

export interface SmartObserverOptions {
  containerSelector?: string;
  resolveTarget?: () => Element | null;
  debounceDelay?: number;
  forceSaveInterval?: number;
  onTrigger: () => void;
  /** 新根已就绪，调用方可补采集挂载前已有的内容。 */
  onTargetReady?: () => void;
}

const ROOT_CHECK_INTERVAL = 500;
const MAX_MISSING_ROOT_CHECKS = 20;

export class SmartObserver {
  private observer: MutationObserver | null = null;
  private target: Element | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private forceSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private rootCheckTimer: ReturnType<typeof setInterval> | null = null;
  private missingChecks = 0;
  private active = false;
  private readonly resumeRootChecks = () => {
    if (!this.active || this.rootCheckTimer !== null) return;
    this.missingChecks = 0;
    this.checkTarget();
    if (this.active) {
      this.rootCheckTimer = setInterval(() => this.checkTarget(), ROOT_CHECK_INTERVAL);
    }
  };

  constructor(private readonly options: SmartObserverOptions) {}

  startObserving(): void {
    this.stop();
    this.active = true;
    window.addEventListener('focus', this.resumeRootChecks);
    document.addEventListener('visibilitychange', this.resumeRootChecks);
    this.checkTarget();
    if (this.active) {
      this.rootCheckTimer = setInterval(() => this.checkTarget(), ROOT_CHECK_INTERVAL);
    }
  }

  private checkTarget(): void {
    if (!this.active) return;
    const candidate = this.options.resolveTarget
      ? this.options.resolveTarget()
      : this.options.containerSelector
        ? document.querySelector(this.options.containerSelector)
        : null;
    const next =
      candidate?.isConnected &&
      candidate !== document.body &&
      candidate !== document.documentElement
        ? candidate
        : null;
    if (next === this.target && next !== null) return;

    if (next !== this.target) {
      this.observer?.disconnect();
      this.observer = null;
      this.target = null;
      this.clearSaveTimers();
    }
    if (!next) {
      if (++this.missingChecks >= MAX_MISSING_ROOT_CHECKS) {
        if (this.rootCheckTimer !== null) clearInterval(this.rootCheckTimer);
        this.rootCheckTimer = null;
      }
      return;
    }

    this.missingChecks = 0;
    this.target = next;
    this.observer = new MutationObserver((mutations) => {
      if (
        mutations.some(
          (mutation) =>
            mutation.type === 'childList' &&
            (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)
        )
      )
        this.scheduleSave();
    });
    this.observer.observe(next, { childList: true, subtree: true, characterData: false });
    this.options.onTargetReady?.();
  }

  private scheduleSave(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.clearSaveTimers();
      this.options.onTrigger();
    }, this.options.debounceDelay ?? OBSERVER_DEBOUNCE_DELAY);

    if (this.forceSaveTimer === null) {
      this.forceSaveTimer = setTimeout(() => {
        this.clearSaveTimers();
        this.options.onTrigger();
      }, this.options.forceSaveInterval ?? OBSERVER_FORCE_SAVE_INTERVAL);
    }
  }

  private clearSaveTimers(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    if (this.forceSaveTimer !== null) clearTimeout(this.forceSaveTimer);
    this.debounceTimer = null;
    this.forceSaveTimer = null;
  }

  stop(): void {
    this.active = false;
    window.removeEventListener('focus', this.resumeRootChecks);
    document.removeEventListener('visibilitychange', this.resumeRootChecks);
    this.observer?.disconnect();
    this.observer = null;
    this.target = null;
    this.missingChecks = 0;
    this.clearSaveTimers();
    if (this.rootCheckTimer !== null) clearInterval(this.rootCheckTimer);
    this.rootCheckTimer = null;
  }
}
