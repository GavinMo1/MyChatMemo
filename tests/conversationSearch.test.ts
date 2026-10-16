import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConversationSearch } from '@/sidepanel/hooks/useConversationSearch';
import { searchConversationsPaged } from '@/browser/ipc';
import type { SearchResultPage } from '@/shared/protocol';
import type { ConversationMeta } from '@/types';

vi.mock('@/browser/ipc', () => ({ searchConversationsPaged: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
function page(ids: string[], hasMore = false): SearchResultPage {
  return {
    items: ids.map(
      (id): ConversationMeta => ({
        id,
        title: id,
        platform: 'chatgpt',
        url: '',
        folderId: null,
        stats: { messageCount: 1, lastSyncedAt: 0 },
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        isArchived: false,
      })
    ),
    total: 3,
    hasMore,
  };
}

describe('conversation search lifecycle', () => {
  let root: Root;
  let host: HTMLDivElement;
  let current: ReturnType<typeof useConversationSearch>;
  let mounted: boolean;
  const onError = vi.fn(() => false);
  function Harness({
    folderId = null,
    invalidated = null,
  }: {
    folderId?: string | null;
    invalidated?: string | null;
  }) {
    current = useConversationSearch({
      activeFolderId: folderId,
      showAllConvs: folderId === null,
      invalidatedMessage: invalidated,
      handlePanelError: onError,
    });
    return null;
  }
  async function search(query = 'topic') {
    await act(async () => current.setSearchQuery(query));
    await act(async () => vi.advanceTimersByTime(300));
  }
  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.useFakeTimers();
    vi.mocked(searchConversationsPaged).mockReset();
    onError.mockClear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    mounted = true;
    await act(async () => root.render(React.createElement(Harness)));
  });
  afterEach(async () => {
    if (mounted) await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
  });

  it('treats blank input as idle without scheduling a request', async () => {
    await search('   ');
    expect(searchConversationsPaged).not.toHaveBeenCalled();
    expect(current.isSearchMode).toBe(false);
    expect(current.isSearching).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('locks pagination immediately and appends each ID once', async () => {
    const next = deferred<SearchResultPage>();
    vi.mocked(searchConversationsPaged)
      .mockResolvedValueOnce(page(['one'], true))
      .mockReturnValueOnce(next.promise);
    await search();
    let loading!: Promise<void>;
    await act(async () => {
      loading = current.loadMoreSearchResults();
      void current.loadMoreSearchResults();
    });
    expect(searchConversationsPaged).toHaveBeenCalledTimes(2);
    expect(searchConversationsPaged).toHaveBeenLastCalledWith('topic', 1, 50, null, true);
    expect(current.isLoadingMore).toBe(true);
    expect(current.isSearching).toBe(false);
    await act(async () => {
      next.resolve(page(['one', 'two', 'two', 'three']));
      await loading;
    });
    expect(current.searchResults.map((item) => item.id)).toEqual(['one', 'two', 'three']);
    expect(current.searchTotal).toBe(3);
    expect(current.hasMore).toBe(false);
    expect(current.isLoadingMore).toBe(false);
  });

  it('ignores a pending page when its folder scope changes', async () => {
    const oldPage = deferred<SearchResultPage>();
    vi.mocked(searchConversationsPaged)
      .mockResolvedValueOnce(page(['old'], true))
      .mockReturnValueOnce(oldPage.promise)
      .mockResolvedValueOnce(page(['work']));
    await search();
    let loading!: Promise<void>;
    await act(async () => {
      loading = current.loadMoreSearchResults();
    });
    await act(async () => root.render(React.createElement(Harness, { folderId: 'work' })));
    await act(async () => vi.advanceTimersByTime(300));
    await act(async () => {
      oldPage.resolve(page(['stale']));
      await loading;
    });
    expect(current.searchResults.map((item) => item.id)).toEqual(['work']);
    expect(current.isLoadingMore).toBe(false);
  });

  it('rejects pagination from the previous query even before React renders the input change', async () => {
    vi.mocked(searchConversationsPaged).mockResolvedValueOnce(page(['old'], true));
    await search('old');
    await act(async () => {
      current.setSearchQuery('new');
      await current.loadMoreSearchResults();
    });
    expect(searchConversationsPaged).toHaveBeenCalledTimes(1);
  });

  it('replaces a pending append with refresh results and blocks paging during the replacement', async () => {
    const append = deferred<SearchResultPage>();
    const replacement = deferred<SearchResultPage>();
    vi.mocked(searchConversationsPaged)
      .mockResolvedValueOnce(page(['old'], true))
      .mockReturnValueOnce(append.promise)
      .mockReturnValueOnce(replacement.promise);
    await search();
    let appending!: Promise<void>;
    let refreshing!: Promise<void>;
    await act(async () => {
      appending = current.loadMoreSearchResults();
    });
    const refresh = current.prepareRefresh();
    await act(async () => {
      refreshing = refresh();
      void current.loadMoreSearchResults();
    });
    expect(searchConversationsPaged).toHaveBeenCalledTimes(3);
    expect(current.isSearching).toBe(true);
    expect(current.isLoadingMore).toBe(false);
    await act(async () => {
      append.resolve(page(['stale']));
      await appending;
    });
    expect(current.isSearching).toBe(true);
    await act(async () => {
      replacement.resolve(page(['fresh']));
      await refreshing;
    });
    expect(current.searchResults.map((item) => item.id)).toEqual(['fresh']);
    expect(current.isSearching).toBe(false);
  });

  it('does not clear a newer request loading state when an obsolete request finishes', async () => {
    const old = deferred<SearchResultPage>();
    const latest = deferred<SearchResultPage>();
    vi.mocked(searchConversationsPaged)
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(latest.promise);
    await search('old');
    await search('latest');
    await act(async () => old.resolve(page(['old'])));
    expect(current.isSearching).toBe(true);
    await act(async () => latest.resolve(page(['latest'])));
    expect(current.isSearching).toBe(false);
  });

  it('settles a current failure and allows retrying the same page', async () => {
    vi.mocked(searchConversationsPaged)
      .mockResolvedValueOnce(page(['one'], true))
      .mockRejectedValueOnce(new Error('failed page'))
      .mockResolvedValueOnce(page(['two']));
    await search();
    await act(async () => current.loadMoreSearchResults());
    expect(current.isLoadingMore).toBe(false);
    expect(current.searchResults.map((item) => item.id)).toEqual(['one']);
    expect(onError).toHaveBeenCalledOnce();
    await act(async () => current.loadMoreSearchResults());
    expect(current.searchResults.map((item) => item.id)).toEqual(['one', 'two']);
    expect(searchConversationsPaged).toHaveBeenLastCalledWith('topic', 1, 50, null, true);
  });

  it('invalidates responses and pending debounce timers when the extension context fails', async () => {
    const old = deferred<SearchResultPage>();
    vi.mocked(searchConversationsPaged).mockReturnValueOnce(old.promise);
    await search();
    await act(async () => root.render(React.createElement(Harness, { invalidated: '请刷新页面' })));
    await act(async () => old.reject(new Error('obsolete context failure')));
    expect(onError).not.toHaveBeenCalled();
    expect(current.isSearching).toBe(false);
    expect(current.searchResults).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not report late failures or leave timers after unmounting', async () => {
    const old = deferred<SearchResultPage>();
    vi.mocked(searchConversationsPaged).mockReturnValueOnce(old.promise);
    await search();
    await act(async () => root.unmount());
    mounted = false;
    await act(async () => old.reject(new Error('late failure')));
    expect(onError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
