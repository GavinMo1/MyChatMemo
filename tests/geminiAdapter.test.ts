// tests/geminiAdapter.test.ts
import { describe, it, expect } from 'vitest';
import { GeminiAdapter } from '@/content/adapters/gemini';

describe('GeminiAdapter', () => {
  const adapter = new GeminiAdapter();

  describe('platform', () => {
    it('has correct platform identifier', () => {
      expect(adapter.platform).toBe('gemini');
    });
  });

  describe('verifyUrl', () => {
    it('accepts gemini.google.com URLs', () => {
      // Valid conversation URLs
      expect(adapter.verifyUrl('https://gemini.google.com/app/abc123')).toBe(true);
      expect(adapter.verifyUrl('https://gemini.google.com/gem/session/abc123')).toBe(true);
      expect(adapter.verifyUrl('https://gemini.google.com/u/0/app/abc123')).toBe(true);
      expect(adapter.verifyUrl('https://gemini.google.com/u/0/gem/session/abc123')).toBe(true);
    });

    it('rejects other domains', () => {
      // Invalid domains
      expect(adapter.verifyUrl('https://google.com/app/abc123')).toBe(false);
      expect(adapter.verifyUrl('https://chat.openai.com/c/abc123')).toBe(false);
      expect(adapter.verifyUrl('https://example.com')).toBe(false);

      // Invalid Gemini URLs (no conversation ID)
      expect(adapter.verifyUrl('https://gemini.google.com/app')).toBe(false);
      expect(adapter.verifyUrl('https://gemini.google.com/gem/session')).toBe(false);
      expect(adapter.verifyUrl('https://gemini.google.com/u/0/app')).toBe(false);

      // Invalid URL format
      expect(adapter.verifyUrl('not-a-url')).toBe(false);
    });
  });

  describe('extractConversationId', () => {
    it('extracts ID from URL with conversation ID', () => {
      // /app/conversation_id format
      expect(adapter.extractConversationId('https://gemini.google.com/app/abc123'))
        .toBe('app_abc123');

      // /gem/*/conversation_id format
      expect(adapter.extractConversationId('https://gemini.google.com/gem/session/xyz789'))
        .toBe('gem_session_xyz789');

      // /*/*/app/conversation_id format
      expect(adapter.extractConversationId('https://gemini.google.com/u/0/app/def456'))
        .toBe('u_0_app_def456');

      // /*/*/gem/*/conversation_id format
      expect(adapter.extractConversationId('https://gemini.google.com/u/0/gem/session/ghi012'))
        .toBe('u_0_gem_session_ghi012');
    });

    it('handles URL without conversation ID', () => {
      // Empty conversation ID
      expect(adapter.extractConversationId('https://gemini.google.com/app')).toBe(null);
      expect(adapter.extractConversationId('https://gemini.google.com/gem/session')).toBe(null);
      expect(adapter.extractConversationId('https://gemini.google.com/u/0/app')).toBe(null);

      // Invalid URL format
      expect(adapter.extractConversationId('not-a-url')).toBe(null);
      expect(adapter.extractConversationId('https://google.com')).toBe(null);
    });
  });

  describe('extractMessages', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
    });

    it('extracts user and model messages', () => {
      // Setup DOM with conversation blocks
      document.body.innerHTML = `
        <div id="chat-history">
          <div class="conversation-container">
            <user-query>
              <div class="query-text">What is AI?</div>
            </user-query>
            <model-response>
              <div class="model-response-text">AI stands for Artificial Intelligence.</div>
            </model-response>
          </div>
          <div class="conversation-container">
            <user-query>
              <div class="query-text">Tell me more</div>
            </user-query>
            <model-response>
              <div class="model-response-text">It's the simulation of human intelligence by machines.</div>
            </model-response>
          </div>
        </div>
      `;

      const messages = adapter.extractMessages();

      expect(messages).toHaveLength(4);
      expect(messages[0].sender).toBe('user');
      expect(messages[0].content).toBe('What is AI?');
      expect(messages[0].position).toBe(0);
      expect(messages[1].sender).toBe('assistant');
      expect(messages[1].content).toBe('AI stands for Artificial Intelligence.');
      expect(messages[1].position).toBe(1);
      expect(messages[2].sender).toBe('user');
      expect(messages[2].content).toBe('Tell me more');
      expect(messages[2].position).toBe(2);
      expect(messages[3].sender).toBe('assistant');
      expect(messages[3].content).toBe('It\'s the simulation of human intelligence by machines.');
      expect(messages[3].position).toBe(3);
    });

    it('handles message blocks correctly', () => {
      // Each block should contain one user-model pair
      document.body.innerHTML = `
        <div id="chat-history">
          <div class="conversation-container">
            <user-query>
              <div class="query-text">Question 1</div>
            </user-query>
            <model-response>
              <div class="model-response-text">Answer 1</div>
            </model-response>
          </div>
        </div>
      `;

      const messages = adapter.extractMessages();

      expect(messages).toHaveLength(2);
      // User message at even position
      expect(messages[0].sender).toBe('user');
      expect(messages[0].position).toBe(0);
      // Assistant message at odd position
      expect(messages[1].sender).toBe('assistant');
      expect(messages[1].position).toBe(1);
    });

    it('detects edit mode', () => {
      // Setup DOM with edit mode indicators
      document.body.innerHTML = `
        <div id="chat-history">
          <div class="conversation-container">
            <user-query>
              <textarea>Editing...</textarea>
            </user-query>
          </div>
        </div>
      `;

      const messages = adapter.extractMessages();

      // Should return empty array when in edit mode
      expect(messages).toHaveLength(0);
    });

    it('ignores empty messages', () => {
      document.body.innerHTML = `
        <div id="chat-history">
          <div class="conversation-container">
            <user-query>
              <div class="query-text">   </div>
            </user-query>
            <model-response>
              <div class="model-response-text"></div>
            </model-response>
          </div>
        </div>
      `;

      const messages = adapter.extractMessages();

      expect(messages).toHaveLength(0);
    });

    it('returns empty array when chat history not found', () => {
      document.body.innerHTML = '<div></div>';

      const messages = adapter.extractMessages();

      expect(messages).toHaveLength(0);
    });

    it('returns empty array when no conversation blocks found', () => {
      document.body.innerHTML = '<div id="chat-history"></div>';

      const messages = adapter.extractMessages();

      expect(messages).toHaveLength(0);
    });
  });

  describe('extractTitle', () => {
    it('cleans title from Gemini suffixes', () => {
      // Test various suffix formats
      document.title = 'My Conversation - Gemini';
      expect(adapter.extractTitle()).toBe('My Conversation');

      document.title = 'Another Chat – Gemini';
      expect(adapter.extractTitle()).toBe('Another Chat');

      document.title = 'Test Title — Gemini';
      expect(adapter.extractTitle()).toBe('Test Title');

      document.title = 'Chat Title - gemini';
      expect(adapter.extractTitle()).toBe('Chat Title');
    });

    it('returns null for generic titles', () => {
      document.title = 'Gemini';
      expect(adapter.extractTitle()).toBe(null);

      document.title = 'Google Gemini';
      expect(adapter.extractTitle()).toBe(null);

      document.title = 'gemini - Gemini';
      expect(adapter.extractTitle()).toBe(null);
    });

    it('returns null for empty title', () => {
      document.title = '';
      expect(adapter.extractTitle()).toBe(null);

      document.title = ' - Gemini';
      expect(adapter.extractTitle()).toBe(null);
    });

    it('handles titles without suffix', () => {
      document.title = 'Just A Title';
      expect(adapter.extractTitle()).toBe('Just A Title');
    });
  });
});
