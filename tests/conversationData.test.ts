import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConversationData } from '@/sidepanel/hooks/useConversationData';
import * as ipc from '@/browser/ipc';
import type { ConversationMeta } from '@/types';
import type { SearchResultPage } from '@/shared/protocol';

vi.mock('@/browser/ipc', () => ({
  listConversations: vi.fn(async () => []),
  listFolders: vi.fn(async () => []),
  searchConversationsPaged: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function page(id: string): SearchResultPage {
  const item: ConversationMeta = {
    id,
    platform: 'chatgpt',
    title: id,
    url: 'https://chatgpt.com/c/example',
    folderId: null,
    stats: { messageCount: 1, lastSyncedAt: 0 },
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    isArchived: false,
  };
  return { items: [item], total: 1, hasMore: false };
}

describe('conversation search response ordering', () => {
  let root: Root;
  let container: HTMLDivElement;
  let current: ReturnType<typeof useConversationData>;
  const onError = vi.fn(() => false);

  function Harness() {
    current = useConversationData({ invalidatedMessage: null, handlePanelError: onError });
    return null;
  }

  async function search(keyword: string) {
    await act(async () => current.setSearchQuery(keyword));
    await act(async () => vi.advanceTimersByTime(300));
  }

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.useFakeTimers();
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(React.createElement(Harness)));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
  });

  it('keeps the latest keyword results when an older response arrives last', async () => {
    const old = deferred<SearchResultPage>();
    const latest = deferred<SearchResultPage>();
    vi.mocked(ipc.searchConversationsPaged)
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(latest.promise);
    await search('old');
    await search('latest');
    await act(async () => latest.resolve(page('latest')));
    await act(async () => old.resolve(page('old')));
    expect(current.searchResults.map((item) => item.id)).toEqual(['latest']);
    expect(current.isLoading).toBe(false);
  });

  it('invalidates a response as soon as input changes, before the debounce fires', async () => {
    const old = deferred<SearchResultPage>();
    vi.mocked(ipc.searchConversationsPaged).mockReturnValueOnce(old.promise);
    await search('old');
    await act(async () => current.setSearchQuery('new'));
    await act(async () => old.resolve(page('old')));
    expect(current.searchResults).toEqual([]);
    expect(ipc.searchConversationsPaged).toHaveBeenCalledTimes(1);
  });

  it('does not reopen search after clearing input while a request is pending', async () => {
    const pending = deferred<SearchResultPage>();
    vi.mocked(ipc.searchConversationsPaged).mockReturnValueOnce(pending.promise);
    await search('old');
    await act(async () => current.setSearchQuery(''));
    await act(async () => pending.resolve(page('old')));
    expect(current.isSearchMode).toBe(false);
    expect(current.searchResults).toEqual([]);
    expect(current.isLoading).toBe(false);
  });

  it('ignores failures from a previous folder scope', async () => {
    const old = deferred<SearchResultPage>();
    const latest = deferred<SearchResultPage>();
    vi.mocked(ipc.searchConversationsPaged)
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(latest.promise);
    await search('topic');
    await act(async () => current.selectFolder('work'));
    await act(async () => vi.advanceTimersByTime(300));
    await act(async () => latest.resolve(page('work-result')));
    await act(async () => old.reject(new Error('stale failure')));
    expect(current.searchResults.map((item) => item.id)).toEqual(['work-result']);
    expect(onError).not.toHaveBeenCalled();
    expect(ipc.searchConversationsPaged).toHaveBeenLastCalledWith('topic', 0, 50, 'work', false);
  });

  it('does not start a stale keyword search after an earlier refresh finishes loading', async () => {
    const refreshList = deferred<ConversationMeta[]>();
    vi.mocked(ipc.searchConversationsPaged)
      .mockResolvedValueOnce(page('old'))
      .mockResolvedValueOnce(page('new'));
    await search('old');
    vi.mocked(ipc.listConversations).mockReturnValueOnce(refreshList.promise);
    let refreshing!: Promise<void>;
    await act(async () => {
      refreshing = current.refreshAll();
    });
    await search('new');
    await act(async () => {
      refreshList.resolve([]);
      await refreshing;
    });
    expect(ipc.searchConversationsPaged).toHaveBeenCalledTimes(2);
    expect(current.searchResults.map((item) => item.id)).toEqual(['new']);
  });

  it('does not append using the old results offset while a new keyword is debouncing', async () => {
    vi.mocked(ipc.searchConversationsPaged).mockResolvedValueOnce({
      ...page('old'),
      total: 2,
      hasMore: true,
    });
    await search('old');
    expect(current.hasMore).toBe(true);
    await act(async () => current.setSearchQuery('new'));
    await act(async () => current.loadMoreSearchResults());
    expect(ipc.searchConversationsPaged).toHaveBeenCalledTimes(1);
  });

  it('keeps list and search loading independent when a refresh finishes during a newer search', async () => {
    const list = deferred<ConversationMeta[]>();
    const result = deferred<SearchResultPage>();
    vi.mocked(ipc.listConversations).mockReturnValueOnce(list.promise);
    vi.mocked(ipc.searchConversationsPaged).mockReturnValueOnce(result.promise);
    let refreshing!: Promise<void>;
    await act(async () => {
      refreshing = current.refreshAll();
    });
    await search('new');
    await act(async () => {
      list.resolve([]);
      await refreshing;
    });
    expect(current.isLoading).toBe(true);
    expect(ipc.searchConversationsPaged).toHaveBeenCalledTimes(1);
    await act(async () => result.resolve(page('new')));
    expect(current.isLoading).toBe(false);
  });

  it.each(['all', 'folder', 'query'])(
    'does not cancel a pending search when reselecting the same %s',
    async (selection) => {
      if (selection === 'folder') await act(async () => current.selectFolder('work'));
      const pending = deferred<SearchResultPage>();
      vi.mocked(ipc.searchConversationsPaged).mockReturnValueOnce(pending.promise);
      await search('topic');
      await act(async () => {
        if (selection === 'all') current.selectAllFolders();
        else if (selection === 'folder') current.selectFolder('work');
        else current.setSearchQuery('topic');
      });
      await act(async () => pending.resolve(page('result')));
      expect(current.searchResults.map((item) => item.id)).toEqual(['result']);
      expect(current.isLoading).toBe(false);
      expect(ipc.searchConversationsPaged).toHaveBeenCalledTimes(1);
    }
  );
});
