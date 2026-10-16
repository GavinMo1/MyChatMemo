// 搜索独占防抖、分页与请求生命周期；列表/详情加载不修改这里的状态。
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { ConversationMeta } from '@/types';
import type { SearchResultPage } from '@/shared/protocol';
import { SEARCH_DEBOUNCE_DELAY, SEARCH_PAGE_SIZE } from '@/shared/constants';
import { searchConversationsPaged } from '@/browser/ipc';

interface Options {
  activeFolderId: string | null;
  showAllConvs: boolean;
  invalidatedMessage: string | null;
  handlePanelError: (label: string, err: unknown) => boolean;
}

type SearchStatus = 'idle' | 'debouncing' | 'loading' | 'ready' | 'loadingMore' | 'error';
interface SearchState {
  status: SearchStatus;
  items: ConversationMeta[];
  total: number;
  hasMore: boolean;
  /** 仅成功响应可以建立可分页的结果范围。 */
  resultsScope: string | null;
}
type SearchAction =
  | { type: 'reset'; pending: boolean }
  | { type: 'start'; append: boolean }
  | { type: 'success'; page: SearchResultPage; scope: string; append: boolean }
  | { type: 'failure' };

const emptyState: SearchState = {
  status: 'idle',
  items: [],
  total: 0,
  hasMore: false,
  resultsScope: null,
};

function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case 'reset':
      return { ...emptyState, status: action.pending ? 'debouncing' : 'idle' };
    case 'start':
      return { ...state, status: action.append ? 'loadingMore' : 'loading' };
    case 'success': {
      const items = action.append ? [...state.items] : [];
      const seen = new Set(items.map((item) => item.id));
      for (const item of action.page.items) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          items.push(item);
        }
      }
      return {
        status: 'ready',
        items,
        total: action.page.total,
        hasMore: action.page.hasMore,
        resultsScope: action.scope,
      };
    }
    case 'failure':
      return { ...state, status: 'error' };
  }
}

export function useConversationSearch({
  activeFolderId,
  showAllConvs,
  invalidatedMessage,
  handlePanelError,
}: Options) {
  const [searchQuery, setQuery] = useState('');
  const [state, dispatch] = useReducer(searchReducer, emptyState);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);
  // 同一帧重复点击分页时，React 尚未渲染 loadingMore；这个锁立即生效。
  const inFlightRef = useRef<number | null>(null);
  const scopeKey = JSON.stringify([
    searchQuery.trim(),
    activeFolderId,
    showAllConvs,
    invalidatedMessage,
  ]);
  const scopeRef = useRef<string | null>(scopeKey);
  scopeRef.current = scopeKey;

  const invalidateScope = useCallback(() => {
    requestRef.current += 1;
    scopeRef.current = null;
    inFlightRef.current = null;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const setSearchQuery = useCallback(
    (query: string) => {
      if (query === searchQuery) return;
      invalidateScope();
      setQuery(query);
    },
    [invalidateScope, searchQuery]
  );

  const runSearch = useCallback(
    async (offset = 0, append = false) => {
      if (invalidatedMessage || !searchQuery.trim() || scopeRef.current !== scopeKey) return;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
      const requestId = ++requestRef.current;
      inFlightRef.current = requestId;
      const isCurrent = () => requestRef.current === requestId && scopeRef.current === scopeKey;
      dispatch({ type: 'start', append });
      try {
        const page = await searchConversationsPaged(
          searchQuery.trim(),
          offset,
          SEARCH_PAGE_SIZE,
          activeFolderId,
          showAllConvs
        );
        if (isCurrent()) dispatch({ type: 'success', page, scope: scopeKey, append });
      } catch (error) {
        if (isCurrent()) {
          dispatch({ type: 'failure' });
          handlePanelError('[SidePanel] 搜索对话失败', error);
        }
      } finally {
        if (inFlightRef.current === requestId) inFlightRef.current = null;
      }
    },
    [activeFolderId, handlePanelError, invalidatedMessage, scopeKey, searchQuery, showAllConvs]
  );

  useEffect(() => {
    invalidateScope();
    scopeRef.current = scopeKey;
    const pending = !invalidatedMessage && Boolean(searchQuery.trim());
    dispatch({ type: 'reset', pending });
    if (pending) timerRef.current = setTimeout(() => void runSearch(), SEARCH_DEBOUNCE_DELAY);
    // 改词/切范围/失效/卸载都使结果、错误与 finally 的旧回调失效。
    return invalidateScope;
  }, [invalidateScope, invalidatedMessage, searchQuery, runSearch, scopeKey]);

  const loadMoreSearchResults = useCallback(async () => {
    if (
      invalidatedMessage ||
      !state.hasMore ||
      inFlightRef.current !== null ||
      state.resultsScope !== scopeKey ||
      scopeRef.current !== scopeKey
    )
      return;
    await runSearch(state.items.length, true);
  }, [
    invalidatedMessage,
    runSearch,
    scopeKey,
    state.hasMore,
    state.items.length,
    state.resultsScope,
  ]);

  /** 列表刷新前捕获；等待期间用户改词、切范围或发起新搜索后，不再重启旧搜索。 */
  const prepareRefresh = useCallback(() => {
    const requestAtStart = requestRef.current;
    return async () => {
      if (requestRef.current === requestAtStart) await runSearch();
    };
  }, [runSearch]);

  const hasCurrentResults = state.resultsScope === scopeKey;
  return {
    searchQuery,
    setSearchQuery,
    searchResults: hasCurrentResults ? state.items : emptyState.items,
    searchTotal: hasCurrentResults ? state.total : 0,
    hasMore: hasCurrentResults && state.hasMore,
    isSearchMode: hasCurrentResults,
    isSearching: state.status === 'loading',
    isLoadingMore: state.status === 'loadingMore',
    loadMoreSearchResults,
    invalidateScope,
    prepareRefresh,
  };
}
