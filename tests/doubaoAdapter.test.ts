import { beforeEach, describe, expect, it } from 'vitest';
import { DoubaoAdapter } from '@/content/adapters/doubao';

describe('DoubaoAdapter URL handling', () => {
  it('accepts chat detail URLs and rejects unsupported paths', () => {
    const adapter = new DoubaoAdapter();

    expect(adapter.verifyUrl('https://www.doubao.com/chat/123456')).toBe(true);
    expect(adapter.verifyUrl('https://www.doubao.com/chat/local')).toBe(false);
    expect(adapter.verifyUrl('https://www.doubao.com/chat')).toBe(false);
    expect(adapter.verifyUrl('https://example.com/chat/123456')).toBe(false);
  });

  it('derives conversation id from the full pathname', () => {
    const adapter = new DoubaoAdapter();

    expect(
      adapter.extractConversationId('https://www.doubao.com/chat/abc/def'),
    ).toBe('chat_abc_def');
  });
});

describe('DoubaoAdapter.extractMessages', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('extracts user and assistant messages from the block-v2 md-box-root structure (2026-08)', () => {
    // DOM 骨架取自 doubao-dom-structure-v3.json 探测报告
    document.body.innerHTML = `
      <div class="message-row">
        <div data-message-id="user-1" class="flex-row flex w-full justify-end">
          <div class="flex flex-col gap-8" data-container-type="block-v2">
            <div class="flex justify-end" data-render-engine="node" data-plugin-identifier="block_type:10000">
              <div class="content-XXXXXX rounded-s-radius-s">
                <div class="container-aaaaaa">
                  <div class="md-box-root" data-streaming="false">
                    <div class="container-bbbbbb">
                      <div class="container-cccccc">一句话概括</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div data-foundation-type="send-message-action-bar"></div>
      </div>
      <div class="message-row">
        <div data-message-id="assistant-1" class="relative grid w-full">
          <div class="relative z-0 min-w-0">
            <div class="flex w-full flex-col" data-container-type="block-v2">
              <div data-render-engine="node" data-plugin-identifier="block_type:10000">
                <div class="container-aaaaaa">
                  <div class="md-box-root" data-streaming="false">
                    <div class="container-bbbbbb">
                      <div class="container-cccccc">我是字节跳动自研的豆包，能力包括：</div>
                    </div>
                    <div class="container-bbbbbb">
                      <ol class="container-dddddd">
                        <li><strong>技术学习</strong></li>
                        <li><strong>知识科普</strong></li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div data-foundation-type="receive-message-action-bar"></div>
      </div>
    `;

    const adapter = new DoubaoAdapter();
    const messages = adapter.extractMessages();

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      sender: 'user',
      content: '一句话概括',
      position: 0,
    });
    expect(messages[1]).toMatchObject({
      sender: 'assistant',
      position: 1,
    });
    expect(messages[1].content).toContain('我是字节跳动自研的豆包');
    expect(messages[1].content).toContain('1. **技术学习**');
    expect(messages[1].content).toContain('2. **知识科普**');
  });

  it('excludes thinking-box md-box-root from assistant content in the block-v2 structure', () => {
    document.body.innerHTML = `
      <div class="message-row">
        <div data-message-id="assistant-1">
          <div data-container-type="block-v2">
            <div data-render-engine="node">
              <div data-thinking-box-expanded="true">
                <div class="md-box-root"><p>先分析用户意图。</p></div>
              </div>
              <div class="md-box-root"><p>正式回复内容。</p></div>
            </div>
          </div>
        </div>
        <div data-foundation-type="receive-message-action-bar"></div>
      </div>
    `;

    const adapter = new DoubaoAdapter();
    const messages = adapter.extractMessages();

    expect(messages).toHaveLength(1);
    expect(messages[0].sender).toBe('assistant');
    expect(messages[0].content).toContain('正式回复内容。');
    expect(messages[0].content).not.toContain('先分析用户意图。');
  });

  it('extracts user and assistant messages from the modern data-message-id structure', () => {
    document.body.innerHTML = `
      <div class="message-row">
        <div data-foundation-type="send-message-action-bar"></div>
        <div data-message-id="user-1">
          <div class="whitespace-pre-wrap">请帮我总结这段内容。</div>
        </div>
      </div>
      <div class="message-row">
        <div data-foundation-type="receive-message-action-bar"></div>
        <div data-message-id="assistant-1">
          <div data-thinking-box-expanded="true">
            <div class="flow-markdown-body">
              <p>先提炼核心观点，再组织成简洁总结。</p>
            </div>
          </div>
          <div class="flow-markdown-body">
            <p>总结如下：</p>
            <ul>
              <li>第一点</li>
              <li>第二点</li>
            </ul>
          </div>
        </div>
      </div>
    `;

    const adapter = new DoubaoAdapter();
    const messages = adapter.extractMessages();

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      sender: 'user',
      content: '请帮我总结这段内容。',
      position: 0,
    });
    expect(messages[1]).toMatchObject({
      sender: 'assistant',
      thinking: '先提炼核心观点，再组织成简洁总结。',
      position: 1,
    });
    expect(messages[1].content).toContain('总结如下：');
    expect(messages[1].content).toContain('- 第一点');
    expect(messages[1].content).toContain('- 第二点');
  });

  it('falls back to the legacy data-testid structure', () => {
    document.body.innerHTML = `
      <div data-testid="union_message">
        <div data-testid="send_message">
          <div data-testid="message_text_content">旧版用户消息</div>
        </div>
      </div>
      <div data-testid="union_message">
        <div data-testid="receive_message">
          <div data-testid="think_block_collapse">
            <div data-testid="message_text_content">旧版思考内容</div>
          </div>
          <div data-testid="message_text_content">旧版助手回复</div>
        </div>
      </div>
    `;

    const adapter = new DoubaoAdapter();
    const messages = adapter.extractMessages();

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      sender: 'user',
      content: '旧版用户消息',
      position: 0,
    });
    expect(messages[1]).toMatchObject({
      sender: 'assistant',
      content: '旧版助手回复',
      thinking: '旧版思考内容',
      position: 1,
    });
  });

  it('extracts assistant plain text when the modern markdown wrapper is absent', () => {
    document.body.innerHTML = `
      <div class="message-row">
        <div data-foundation-type="send-message-action-bar"></div>
        <div data-message-id="user-1">
          <div class="whitespace-pre-wrap">简单对话一下</div>
        </div>
      </div>
      <div class="message-row">
        <div data-message-id="assistant-1" class="relative flex-row flex w-full">
          好呀～随便聊聊😆 你今天过得怎么样？
        </div>
        <div data-foundation-type="receive-message-action-bar"></div>
      </div>
      <div class="message-row">
        <div data-message-id="assistant-2" class="relative flex-row flex w-full">
          那就挺好的😉 这会儿是休息摸鱼还是忙完啦？
        </div>
        <div data-foundation-type="receive-message-action-bar"></div>
        <div data-foundation-type="receive-message-suggest-foundation">
          有什么好玩的游戏推荐吗？
          最近有什么好看的电影或电视剧吗？
        </div>
      </div>
    `;

    const adapter = new DoubaoAdapter();
    const messages = adapter.extractMessages();

    expect(messages).toHaveLength(3);
    expect(messages[1]).toMatchObject({
      sender: 'assistant',
      content: '好呀～随便聊聊😆 你今天过得怎么样？',
      position: 1,
    });
    expect(messages[2]).toMatchObject({
      sender: 'assistant',
      content: '那就挺好的😉 这会儿是休息摸鱼还是忙完啦？',
      position: 2,
    });
    expect(messages[2].content).not.toContain('有什么好玩的游戏推荐吗？');
  });

  it('returns an empty array when any visible message is being edited', () => {
    document.body.innerHTML = `
      <div class="message-row">
        <div data-foundation-type="send-message-action-bar"></div>
        <div data-message-id="user-1">
          <textarea autofocus></textarea>
          <div class="whitespace-pre-wrap">正在编辑的内容</div>
        </div>
      </div>
    `;

    const textarea = document.querySelector('textarea');
    textarea?.focus();

    const adapter = new DoubaoAdapter();
    expect(adapter.extractMessages()).toEqual([]);
  });
});
