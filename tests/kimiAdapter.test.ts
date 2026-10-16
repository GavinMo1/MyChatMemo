// tests/kimiAdapter.test.ts
import { describe, it, expect } from 'vitest';
import { KimiAdapter } from '@/content/adapters/kimi';

describe('KimiAdapter', () => {
  const adapter = new KimiAdapter();

  describe('platform', () => {
    it('has correct platform identifier', () => {
      expect(adapter.platform).toBe('kimi');
    });
  });

  describe('verifyUrl', () => {
    it('accepts kimi.moonshot.cn URLs', () => {
      // 只接受有 conversationId 的 URL
      expect(adapter.verifyUrl('https://kimi.moonshot.cn/chat/abc123')).toBe(true);
      expect(adapter.verifyUrl('https://kimi.moonshot.cn/chat/abc123/continue')).toBe(true);
    });

    it('accepts kimi.com URLs', () => {
      expect(adapter.verifyUrl('https://kimi.com/chat/abc123')).toBe(true);
      expect(adapter.verifyUrl('https://kimi.com/chat/abc123/continue')).toBe(true);
    });

    it('rejects other domains and invalid URLs', () => {
      expect(adapter.verifyUrl('https://example.com/chat/abc123')).toBe(false);
      // 首页和不完整的 URL
      expect(adapter.verifyUrl('https://kimi.com/')).toBe(false);
      expect(adapter.verifyUrl('https://kimi.com/chat')).toBe(false);
      expect(adapter.verifyUrl('https://kimi.com/chat/')).toBe(false);
      expect(adapter.verifyUrl('https://kimi.moonshot.cn/')).toBe(false);
      expect(adapter.verifyUrl('https://kimi.moonshot.cn/chat')).toBe(false);
      expect(adapter.verifyUrl('invalid-url')).toBe(false);
    });
  });

  describe('extractConversationId', () => {
    it('extracts ID from kimi.moonshot.cn URL', () => {
      expect(adapter.extractConversationId('https://kimi.moonshot.cn/chat/abc123')).toBe('chat_abc123');
      expect(adapter.extractConversationId('https://kimi.moonshot.cn/chat/abc123/continue')).toBe('chat_abc123_continue');
    });

    it('extracts ID from kimi.com URL', () => {
      expect(adapter.extractConversationId('https://kimi.com/chat/abc123')).toBe('chat_abc123');
      expect(adapter.extractConversationId('https://kimi.com/chat/abc123/continue')).toBe('chat_abc123_continue');
    });

    it('returns null for homepage', () => {
      expect(adapter.extractConversationId('https://kimi.com/')).toBe(null);
      expect(adapter.extractConversationId('https://kimi.com/chat')).toBe(null);
      expect(adapter.extractConversationId('https://kimi.moonshot.cn/')).toBe(null);
      expect(adapter.extractConversationId('https://kimi.moonshot.cn/chat')).toBe(null);
    });
  });

  describe('extractMessages', () => {
    it('extracts messages with correct ordering', () => {
      document.body.innerHTML = `
        <div class="chat-content-item chat-content-item-user">
          <div class="user-content">第一条用户消息</div>
        </div>
        <div class="chat-content-item chat-content-item-assistant">
          <div class="markdown-container">第一条助手回复</div>
        </div>
        <div class="chat-content-item chat-content-item-user">
          <div class="user-content">第二条用户消息</div>
        </div>
        <div class="chat-content-item chat-content-item-assistant">
          <div class="think-stage">
            <div class="markdown-container">思考过程</div>
          </div>
          <div class="markdown-container">第二条助手回复</div>
        </div>
      `;

      const messages = adapter.extractMessages();

      expect(messages).toHaveLength(4);
      expect(messages[0]).toMatchObject({
        sender: 'user',
        content: '第一条用户消息',
        position: 0,
      });
      expect(messages[1]).toMatchObject({
        sender: 'assistant',
        content: '第一条助手回复',
        position: 1,
      });
      expect(messages[2]).toMatchObject({
        sender: 'user',
        content: '第二条用户消息',
        position: 2,
      });
      expect(messages[3]).toMatchObject({
        sender: 'assistant',
        content: '第二条助手回复',
        thinking: '思考过程',
        position: 3,
      });
    });

    it('handles markdown content', () => {
      document.body.innerHTML = `
        <div class="chat-content-item chat-content-item-user">
          <div class="user-content">解释一下**加粗**和*斜体*</div>
        </div>
        <div class="chat-content-item chat-content-item-assistant">
          <div class="markdown-container">
            <p>Markdown 支持：</p>
            <ul>
              <li>加粗文本</li>
              <li>斜体文本</li>
            </ul>
            <pre><code>代码块示例</code></pre>
          </div>
        </div>
      `;

      const messages = adapter.extractMessages();

      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({
        sender: 'user',
        content: '解释一下**加粗**和*斜体*',
      });
      expect(messages[1].sender).toBe('assistant');
      expect(messages[1].content).toContain('Markdown 支持：');
      expect(messages[1].content).toContain('- 加粗文本');
      expect(messages[1].content).toContain('- 斜体文本');
      expect(messages[1].content).toContain('代码块示例');
    });
  });
});
