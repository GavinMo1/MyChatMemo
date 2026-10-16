import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiAdapter } from '@/content/adapters/gemini';
import { ChatGPTAdapter } from '@/content/adapters/chatgpt';
import { extractAndSync } from '@/content/syncManager';
import { BaseAdapter, type SelectorConfig } from '@/content/adapters/base';
import type { RawMessage } from '@/types';

const syncMessagesMock = vi.fn().mockResolvedValue({ saved: true, messageCount: 1 });
const queryConversationMock = vi.fn().mockResolvedValue(null);

vi.mock('@/browser/ipc', () => ({
  syncMessages: (...args: unknown[]) => syncMessagesMock(...args),
  queryConversation: (...args: unknown[]) => queryConversationMock(...args),
}));

describe('GeminiAdapter.extractTitle', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('strips trailing "- Gemini" and returns conversation title', () => {
    document.title = '如何优化前端性能 - Gemini';

    const adapter = new GeminiAdapter();
    expect(adapter.extractTitle()).toBe('如何优化前端性能');
  });

  it('returns null for generic page title to enable fallback', () => {
    document.title = 'Google Gemini';

    const adapter = new GeminiAdapter();
    expect(adapter.extractTitle()).toBeNull();
  });
});

describe('ChatGPTAdapter.extractTitle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('reads title from navigation element when present', () => {
    document.body.innerHTML = '<nav><span class="text-token-text-primary">项目需求讨论</span></nav>';
    const titleEl = document.querySelector('.text-token-text-primary') as HTMLElement;
    Object.defineProperty(titleEl, 'innerText', {
      configurable: true,
      get: () => '项目需求讨论',
    });

    const adapter = new ChatGPTAdapter();
    expect(adapter.extractTitle()).toBe('项目需求讨论');
  });

  it('returns null when nav title element is missing', () => {
    const adapter = new ChatGPTAdapter();
    expect(adapter.extractTitle()).toBeNull();
  });
});

describe('syncManager title fallback', () => {
  beforeEach(() => {
    syncMessagesMock.mockClear();
  });

  it('uses first user message content when adapter.extractTitle returns null', async () => {
    const messages: RawMessage[] = [
      {
        hashId: 'u_1',
        sender: 'user',
        content: '这是第一条用户提问，用于生成默认标题',
        position: 0,
      },
      {
        hashId: 'a_1',
        sender: 'assistant',
        content: '这是助手回答',
        position: 1,
      },
    ];

    class FakeAdapter extends BaseAdapter {
      readonly platform = 'gemini';
      readonly platformLabel = 'Gemini';

      verifyUrl(): boolean {
        return true;
      }

      extractConversationId(): string | null {
        return 'gem_app_test123';
      }

      extractMessages(): RawMessage[] {
        return messages;
      }

      getSelectors(): SelectorConfig {
        return {
          messageContainer: ['#chat-history'],
          userContent: ['user-query .query-text'],
          assistantContent: ['model-response .model-response-text'],
          title: 'title',
        };
      }

      extractTitle(): string | null {
        return null;
      }
    }

    const fakeAdapter = new FakeAdapter();

    const result = await extractAndSync(fakeAdapter);

    expect(syncMessagesMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('success');
    const payload = syncMessagesMock.mock.calls[0][0] as { title: string };
    expect(payload.title).toBe('这是第一条用户提问，用于生成默认标题');
  });
});
