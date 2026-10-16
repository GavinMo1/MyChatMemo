import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ConversationDetail from '@/sidepanel/components/ConversationDetail';

describe('ConversationDetail', () => {
  it('does not render platform and archived-folder badges anymore', () => {
    const html = renderToStaticMarkup(React.createElement(ConversationDetail, {
      conversation: {
        id: 'conv_detail',
        platform: 'gemini',
        title: '测试对话',
        url: 'https://example.com/detail',
        folderId: 'folder_done',
        messages: [
          {
            id: 'msg_1',
            conversationId: 'conv_detail',
            sender: 'user',
            content: '你好',
            createdAt: '2026-03-27T10:00:00.000Z',
            updatedAt: '2026-03-27T10:00:00.000Z',
            metadata: {
              position: 0,
              wordCount: 2,
            },
          },
        ],
        stats: {
          messageCount: 1,
          lastSyncedAt: Date.now(),
        },
        createdAt: '2026-03-27T10:00:00.000Z',
        updatedAt: '2026-03-27T10:00:00.000Z',
        isArchived: false,
      },
      onDeleteMessage: vi.fn(),
    }));

    expect(html).toContain('共 1 条消息');
    expect(html).toContain('原始链接');
    expect(html).not.toContain('已归档');
    expect(html).not.toContain('gemini');
  });
});
