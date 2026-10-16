import 'fake-indexeddb/auto';

// JSDOM doesn't implement innerText properly, so we polyfill it
Object.defineProperty(HTMLElement.prototype, 'innerText', {
  get() {
    return this.textContent;
  },
  set(value) {
    this.textContent = value;
  },
  configurable: true,
});

// JSDOM doesn't implement offsetParent, so we polyfill it
Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
  get() {
    // Simple implementation: return null for hidden elements, parentElement for visible
    if (this.style.display === 'none') {
      return null;
    }
    return this.parentElement;
  },
  configurable: true,
});
