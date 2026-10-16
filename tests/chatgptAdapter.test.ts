// tests/chatgptAdapter.test.ts
import { describe, it, expect } from 'vitest';
import { ChatGPTAdapter } from '@/content/adapters/chatgpt';

describe('ChatGPTAdapter', () => {
  const adapter = new ChatGPTAdapter();

  describe('platform', () => {
    it('has correct platform identifier', () => {
      expect(adapter.platform).toBe('chatgpt');
    });
  });

  describe('verifyUrl', () => {
    it('accepts chatgpt.com URLs', () => {
      expect(adapter.verifyUrl('https://chatgpt.com/c/abc123')).toBe(true);
      expect(adapter.verifyUrl('https://chatgpt.com/g/gpt1/c/abc123')).toBe(true);
    });

    it('accepts chat.openai.com URLs', () => {
      expect(adapter.verifyUrl('https://chat.openai.com/c/abc123')).toBe(true);
      expect(adapter.verifyUrl('https://chat.openai.com/g/gpt1/c/abc123')).toBe(true);
    });

    it('rejects other domains', () => {
      expect(adapter.verifyUrl('https://example.com/c/abc123')).toBe(false);
      expect(adapter.verifyUrl('https://chatgpt.com/')).toBe(false);
      expect(adapter.verifyUrl('https://chatgpt.com/c')).toBe(false);
      expect(adapter.verifyUrl('https://chatgpt.com/chat')).toBe(false);
    });
  });

  describe('extractConversationId', () => {
    it('extracts ID from chatgpt.com URL', () => {
      expect(adapter.extractConversationId('https://chatgpt.com/c/abc123')).toBe('c_abc123');
      expect(adapter.extractConversationId('https://chatgpt.com/g/gpt1/c/abc123')).toBe('g_gpt1_c_abc123');
    });

    it('extracts ID from chat.openai.com URL', () => {
      expect(adapter.extractConversationId('https://chat.openai.com/c/abc123')).toBe('c_abc123');
      expect(adapter.extractConversationId('https://chat.openai.com/g/gpt1/c/abc123')).toBe('g_gpt1_c_abc123');
    });

    it('returns null for homepage', () => {
      expect(adapter.extractConversationId('https://chatgpt.com/')).toBe(null);
      expect(adapter.extractConversationId('https://chatgpt.com/c')).toBe(null);
      expect(adapter.extractConversationId('https://chatgpt.com/chat')).toBe(null);
    });
  });

  describe('extractMessages', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
    });

    it('extracts user and assistant messages', () => {
      // Setup DOM with user and assistant messages in separate articles
      document.body.innerHTML = `
        <main>
          <div data-message-author-role="user">
            <div class="whitespace-pre-wrap">Hello, how are you?</div>
          </div>
          <div data-message-author-role="assistant">
            <div class="markdown prose">I'm doing great, thanks for asking!</div>
          </div>
          <div data-message-author-role="user">
            <div class="whitespace-pre-wrap">What's the weather like?</div>
          </div>
          <div data-message-author-role="assistant">
            <div class="markdown">It's sunny and warm today.</div>
          </div>
        </main>
      `;

      const messages = adapter.extractMessages();

      expect(messages).toHaveLength(4);
      expect(messages[0].sender).toBe('user');
      expect(messages[0].content).toBe('Hello, how are you?');
      expect(messages[1].sender).toBe('assistant');
      expect(messages[1].content).toBe('I\'m doing great, thanks for asking!');
      expect(messages[2].sender).toBe('user');
      expect(messages[2].content).toBe('What\'s the weather like?');
      expect(messages[3].sender).toBe('assistant');
      expect(messages[3].content).toBe('It\'s sunny and warm today.');
    });

    it('handles thinking blocks correctly', () => {
      // Setup DOM with thinking block (no .markdown class, no buttons, visible)
      document.body.innerHTML = `
        <main>
          <div data-message-author-role="user">
            <div class="whitespace-pre-wrap">Solve this problem</div>
          </div>
          <div data-message-author-role="assistant">
            <div>Let me think about this carefully...</div>
            <div class="markdown prose">Here's the solution</div>
          </div>
        </main>
      `;

      const messages = adapter.extractMessages();

      expect(messages).toHaveLength(2);
      expect(messages[1].sender).toBe('assistant');
      expect(messages[1].content).toBe('Here\'s the solution');
      expect(messages[1].thinking).toBe('Let me think about this carefully...');
    });

    it('detects edit mode', () => {
      // Setup DOM with edit mode indicators - textarea:focus
      document.body.innerHTML = `
        <main>
          <article>
            <textarea id="edit-textarea">Editing message...</textarea>
          </article>
        </main>
      `;

      // Simulate focus
      const textarea = document.getElementById('edit-textarea') as HTMLTextAreaElement;
      textarea.focus();

      const messages = adapter.extractMessages();

      // Should return empty array when in edit mode
      expect(messages).toHaveLength(0);
    });

    it('ignores empty messages', () => {
      document.body.innerHTML = `
        <main>
          <div data-message-author-role="user">
            <div class="whitespace-pre-wrap">   </div>
          </div>
          <div data-message-author-role="assistant">
            <div class="markdown"></div>
          </div>
        </main>
      `;

      const messages = adapter.extractMessages();

      expect(messages).toHaveLength(0);
    });

    it('maintains message order', () => {
      document.body.innerHTML = `
        <main>
          <div data-message-author-role="user">
            <div class="whitespace-pre-wrap">First</div>
          </div>
          <div data-message-author-role="assistant">
            <div class="markdown">Second</div>
          </div>
          <div data-message-author-role="user">
            <div class="whitespace-pre-wrap">Third</div>
          </div>
        </main>
      `;

      const messages = adapter.extractMessages();

      expect(messages).toHaveLength(3);
      expect(messages[0].position).toBe(0);
      expect(messages[0].content).toBe('First');
      expect(messages[1].position).toBe(1);
      expect(messages[1].content).toBe('Second');
      expect(messages[2].position).toBe(2);
      expect(messages[2].content).toBe('Third');
    });
  });

  describe('extractTitle', () => {
    it('extracts title from navigation', () => {
      document.body.innerHTML = `
        <nav>
          <div class="text-token-text-primary">My Conversation Title</div>
        </nav>
      `;

      const title = adapter.extractTitle();

      expect(title).toBe('My Conversation Title');
    });

    it('returns null when title element not found', () => {
      document.body.innerHTML = '<nav></nav>';

      const title = adapter.extractTitle();

      expect(title).toBe(null);
    });
  });
});
