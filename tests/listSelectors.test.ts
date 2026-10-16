import { describe, expect, it } from 'vitest';
import type { ConversationMeta } from '@/types';
import { buildConversationListKey, filterConversationsByScope } from '@/sidepanel/listSelectors';

function createConversation(
  id: string,
  folderId: string | null,
): ConversationMeta {
  return {
    id,
    platform: 'gemini',
    title: `标题 ${id}`,
    url: `https://example.com/${id}`,
    folderId,
    stats: {
      messageCount: 1,
      lastSyncedAt: Date.now(),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isArchived: false,
  };
}

describe('listSelectors', () => {
  it('filters conversations by folder scope', () => {
    const conversations = [
      createConversation('a', null),
      createConversation('b', 'folder_1'),
      createConversation('c', 'folder_2'),
    ];

    expect(filterConversationsByScope(conversations, true, null).map(item => item.id)).toEqual(['a', 'b', 'c']);
    expect(filterConversationsByScope(conversations, false, null).map(item => item.id)).toEqual(['a']);
    expect(filterConversationsByScope(conversations, false, 'folder_1').map(item => item.id)).toEqual(['b']);
  });

  it('builds stable list keys for folder and search modes', () => {
    expect(buildConversationListKey({
      isSearchMode: false,
      searchQuery: '',
      showAllConvs: true,
      activeFolderId: null,
    })).toBe('folder:all');

    expect(buildConversationListKey({
      isSearchMode: false,
      searchQuery: '',
      showAllConvs: false,
      activeFolderId: null,
    })).toBe('folder:uncategorized');

    expect(buildConversationListKey({
      isSearchMode: true,
      searchQuery: '  react  ',
      showAllConvs: false,
      activeFolderId: 'folder_1',
    })).toBe('search:react:folder_1');
  });
});
