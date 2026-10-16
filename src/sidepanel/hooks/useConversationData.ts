// 对话列表、文件夹与筛选编排；搜索请求生命周期由独立 hook 管理。
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ConversationMeta, Folder } from '@/types';
import * as ipc from '@/browser/ipc';
import { buildConversationListKey, filterConversationsByScope } from '../listSelectors';
import { useConversationSearch } from './useConversationSearch';

interface Options {
  invalidatedMessage: string | null;
  handlePanelError: (label: string, err: unknown) => boolean;
}

export function useConversationData({ invalidatedMessage, handlePanelError }: Options) {
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [listLoads, setListLoads] = useState(0);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [showAllConvs, setShowAllConvs] = useState(true);
  const { invalidateScope, prepareRefresh, ...search } = useConversationSearch({
    activeFolderId,
    showAllConvs,
    invalidatedMessage,
    handlePanelError,
  });

  const loadConversations = useCallback(async () => {
    if (invalidatedMessage) return;
    setListLoads((count) => count + 1);
    try {
      setConversations(await ipc.listConversations());
    } catch (err) {
      handlePanelError('[SidePanel] 加载对话列表失败', err);
    } finally {
      setListLoads((count) => count - 1);
    }
  }, [handlePanelError, invalidatedMessage]);

  const loadFolders = useCallback(async () => {
    if (invalidatedMessage) return;
    try {
      setFolders(await ipc.listFolders());
    } catch (err) {
      handlePanelError('[SidePanel] 加载文件夹失败', err);
    }
  }, [handlePanelError, invalidatedMessage]);

  const refreshConversations = useCallback(async () => {
    const refreshSearch = prepareRefresh();
    await loadConversations();
    await refreshSearch();
  }, [loadConversations, prepareRefresh]);

  const refreshAll = useCallback(async () => {
    const refreshSearch = prepareRefresh();
    await Promise.all([loadConversations(), loadFolders()]);
    await refreshSearch();
  }, [loadConversations, loadFolders, prepareRefresh]);

  const selectFolder = useCallback(
    (id: string | null) => {
      if (!showAllConvs && activeFolderId === id) return;
      invalidateScope();
      setActiveFolderId(id);
      setShowAllConvs(false);
    },
    [activeFolderId, invalidateScope, showAllConvs]
  );

  const selectAllFolders = useCallback(() => {
    if (showAllConvs) return;
    invalidateScope();
    setActiveFolderId(null);
    setShowAllConvs(true);
  }, [invalidateScope, showAllConvs]);

  useEffect(() => {
    void loadConversations();
    void loadFolders();
  }, [loadConversations, loadFolders]);

  const filteredConversations = useMemo(
    () => filterConversationsByScope(conversations, showAllConvs, activeFolderId),
    [activeFolderId, conversations, showAllConvs]
  );
  const currentConversations = search.isSearchMode ? search.searchResults : filteredConversations;
  const conversationListKey = buildConversationListKey({
    isSearchMode: search.isSearchMode,
    searchQuery: search.searchQuery,
    showAllConvs,
    activeFolderId,
  });

  return {
    conversations,
    folders,
    loadConversations,
    loadFolders,
    refreshConversations,
    refreshAll,
    ...search,
    isLoading: listLoads > 0 || search.isSearching,
    activeFolderId,
    showAllConvs,
    selectFolder,
    selectAllFolders,
    currentConversations,
    conversationListKey,
  };
}
