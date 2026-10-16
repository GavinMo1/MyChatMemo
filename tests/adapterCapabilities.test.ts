import { beforeEach, describe, expect, it } from 'vitest';
import { ChatGPTAdapter } from '@/content/adapters/chatgpt';
import { GeminiAdapter } from '@/content/adapters/gemini';
import { KimiAdapter } from '@/content/adapters/kimi';
import { DoubaoAdapter } from '@/content/adapters/doubao';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('adapter observation and timeline capabilities', () => {
  it('does not substitute a message item or the whole page for a missing root', () => {
    document.body.innerHTML =
      '<article>one message</article><div class="conversation-container">one round</div>';
    expect(new ChatGPTAdapter().getObservationRoot()).toBeNull();
    expect(new GeminiAdapter().getObservationRoot()).toBeNull();
  });

  it('groups Kimi user content into a single timeline entry', () => {
    document.body.innerHTML =
      '<main><div class="chat-content-item-user"><div class="user-content">first</div><div class="user-content">second</div></div></main>';
    const adapter = new KimiAdapter();
    expect(adapter.getUserTurns().map((turn) => turn.text)).toEqual(['first\nsecond']);
    expect(adapter.getObservationRoot()).toBe(document.querySelector('main'));
  });

  it('uses the same modern Doubao role logic for saving and timeline entries', () => {
    document.body.innerHTML = `<main>
      <section><div data-message-id="user"><div class="md-box-root">question</div></div><div data-foundation-type="send-message-action-bar"></div></section>
      <section><div data-message-id="assistant"><div class="md-box-root">answer</div></div><div data-foundation-type="receive-message-action-bar"></div></section>
    </main>`;
    const adapter = new DoubaoAdapter();
    expect(adapter.extractMessages().map((message) => message.sender)).toEqual([
      'user',
      'assistant',
    ]);
    expect(adapter.getUserTurns().map((turn) => turn.text)).toEqual(['question']);
    expect(adapter.getObservationRoot()).toBe(document.querySelector('main'));
  });
});
