import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import FolderTree from '@/sidepanel/components/FolderTree';
import type { ConversationMeta, Folder } from '@/types';

const folders: Folder[] = [
  {
    id: 'folder_work',
    name: '工作',
    parentId: null,
    order: 0,
    createdAt: '2026-03-27T10:00:00.000Z',
    updatedAt: '2026-03-27T10:00:00.000Z',
  },
  {
    id: 'folder_sub',
    name: '阶段一',
    parentId: 'folder_work',
    order: 1,
    createdAt: '2026-03-27T10:00:00.000Z',
    updatedAt: '2026-03-27T10:00:00.000Z',
  },
];

const conversations: ConversationMeta[] = [
  {
    id: 'conv_1',
    platform: 'gemini',
    title: '迭代规划',
    url: 'https://example.com/1',
    folderId: 'folder_work',
    stats: { messageCount: 3, lastSyncedAt: Date.now() },
    createdAt: '2026-03-27T10:00:00.000Z',
    updatedAt: '2026-03-27T10:00:00.000Z',
    isArchived: false,
  },
];

describe('FolderTree', () => {
  it('renders a compact filter bar and keeps the folder panel collapsed by default', () => {
    const html = renderToStaticMarkup(React.createElement(FolderTree, {
      folders,
      activeFolderId: null,
      showAllConvs: true,
      conversations,
      onSelectFolder: vi.fn(),
      onSelectAll: vi.fn(),
      onCreateFolder: vi.fn(),
      onRenameFolder: vi.fn(),
      onDeleteFolder: vi.fn(),
    }));

    expect(html).toContain('当前筛选');
    expect(html).toContain('文件夹');
    expect(html).not.toContain('选择筛选范围，或在这里管理文件夹。');
    expect(html).not.toContain('工作');
  });
});
