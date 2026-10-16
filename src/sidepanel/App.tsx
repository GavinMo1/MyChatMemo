// src/sidepanel/App.tsx
// 侧边栏主应用 —— 组合数据 hooks 与展示组件，持有跨视图的操作回调

import React, { useCallback, useState } from 'react';
import type { ConversationWithMessages } from '@/types';
import * as ipc from '@/browser/ipc';
import { decodeBase64ToArrayBuffer } from '@/shared/base64';
import { RefreshIcon } from '@/ui/icons';
import ConversationList from './components/ConversationList';
import ConversationDetail from './components/ConversationDetail';
import FolderTree from './components/FolderTree';
import ListHeader from './components/ListHeader';
import BatchActionBar from './components/BatchActionBar';
import MoveToFolderBar from './components/MoveToFolderBar';
import { usePanelError } from './hooks/usePanelError';
import { useConversationData } from './hooks/useConversationData';
import { useSelection } from './hooks/useSelection';
import { downloadBlob } from './downloadBlob';
import { showConfirm } from '@/ui/Toast';

type View = 'list' | 'detail';

const App: React.FC = () => {
  const { invalidatedMessage, handlePanelError } = usePanelError();
  const {
    conversations,
    folders,
    loadFolders,
    refreshConversations,
    refreshAll,
    searchQuery,
    setSearchQuery,
    searchTotal,
    hasMore,
    isSearchMode,
    isLoading: isListLoading,
    isLoadingMore,
    loadMoreSearchResults,
    activeFolderId,
    showAllConvs,
    selectFolder,
    selectAllFolders,
    currentConversations,
    conversationListKey,
  } = useConversationData({ invalidatedMessage, handlePanelError });
  const {
    selectedIds,
    isSelectMode,
    toggleSelect,
    enterSelectMode,
    exitSelectMode,
    clearSelection,
    selectAll,
  } = useSelection();

  const [view, setView] = useState<View>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedConv, setSelectedConv] = useState<ConversationWithMessages | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const isLoading = isDetailLoading || (view === 'list' && isListLoading);

  const closeDetail = useCallback(() => {
    setView('list');
    setSelectedConv(null);
  }, []);

  const openConversation = useCallback(
    async (id: string) => {
      if (invalidatedMessage) return;

      setIsDetailLoading(true);
      try {
        const data = await ipc.getConversation(id);
        if (data) {
          setSelectedConv(data);
          setSelectedId(id);
          setView('detail');
        }
      } catch (err) {
        handlePanelError('[SidePanel] 加载对话详情失败', err);
      } finally {
        setIsDetailLoading(false);
      }
    },
    [handlePanelError, invalidatedMessage]
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      const confirmed = await showConfirm('确认删除此对话记录？');
      if (!confirmed) return;
      await ipc.deleteConversation(id);
      if (selectedId === id) {
        closeDetail();
      }
      await refreshConversations();
    },
    [closeDetail, refreshConversations, selectedId]
  );

  const batchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const confirmed = await showConfirm(`确认删除选中的 ${selectedIds.size} 条对话记录？`);
    if (!confirmed) return;
    await ipc.batchDeleteConversations([...selectedIds]);
    clearSelection();
    if (selectedId && selectedIds.has(selectedId)) {
      closeDetail();
    }
    await refreshConversations();
  }, [clearSelection, closeDetail, refreshConversations, selectedId, selectedIds]);

  const exportConversation = useCallback(
    async (id: string) => {
      if (invalidatedMessage) return;

      try {
        const exported = await ipc.exportConversation(id);
        downloadBlob(
          new Blob([exported.content], { type: 'text/markdown;charset=utf-8' }),
          exported.filename
        );
      } catch (err) {
        handlePanelError('[SidePanel] 导出失败', err);
      }
    },
    [handlePanelError, invalidatedMessage]
  );

  const deleteMessage = useCallback(
    async (conversationId: string, messageId: string) => {
      if (invalidatedMessage) return;
      const confirmed = await showConfirm('确认删除这条消息？');
      if (!confirmed) return;
      await ipc.deleteMessage(conversationId, messageId);

      const [updatedConversation] = await Promise.all([
        ipc.getConversation(conversationId),
        refreshConversations(),
      ]);

      if (updatedConversation) {
        setSelectedConv(updatedConversation);
      }
    },
    [invalidatedMessage, refreshConversations]
  );

  const exportSelectedZip = useCallback(
    async (flatten = false) => {
      if (invalidatedMessage) return;
      if (selectedIds.size === 0) return;
      try {
        const exported = await ipc.exportConversationsZip([...selectedIds], { flatten });
        downloadBlob(
          new Blob([decodeBase64ToArrayBuffer(exported.base64)], { type: 'application/zip' }),
          exported.filename
        );
      } catch (err) {
        handlePanelError('[SidePanel] 批量导出失败', err);
      }
    },
    [handlePanelError, invalidatedMessage, selectedIds]
  );

  const createFolder = useCallback(
    async (name: string, parentId: string | null = null) => {
      if (invalidatedMessage) return;
      await ipc.createFolder(name, parentId);
      await loadFolders();
    },
    [invalidatedMessage, loadFolders]
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      if (invalidatedMessage) return;
      await ipc.updateFolder(id, { name });
      await loadFolders();
    },
    [invalidatedMessage, loadFolders]
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      if (invalidatedMessage) return;
      const confirmed = await showConfirm('删除文件夹？（其中的对话将移到"未分类"）');
      if (!confirmed) return;
      await ipc.deleteFolder(id);
      if (activeFolderId === id) {
        selectAllFolders();
      }
      await loadFolders();
      await refreshConversations();
    },
    [activeFolderId, invalidatedMessage, loadFolders, refreshConversations, selectAllFolders]
  );

  const moveToFolder = useCallback(
    async (conversationIds: string[], folderId: string | null) => {
      if (invalidatedMessage) return;
      await ipc.moveConversations(conversationIds, folderId);
      clearSelection();
      await refreshConversations();
    },
    [invalidatedMessage, clearSelection, refreshConversations]
  );

  return (
    <div className="flex flex-col h-screen px-3 py-3">
      <ListHeader
        isDetailView={view === 'detail'}
        detailTitle={selectedConv?.title ?? ''}
        canExportDetail={selectedId !== null}
        onBack={closeDetail}
        onExportDetail={() => {
          if (selectedId) void exportConversation(selectedId);
        }}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        isSelectMode={isSelectMode}
        selectedCount={selectedIds.size}
        onEnterSelectMode={enterSelectMode}
        onRefresh={() => void refreshAll()}
        disabled={Boolean(invalidatedMessage)}
      />

      {invalidatedMessage && (
        <div className="mb-3 rounded-[20px] border border-[rgba(245,158,11,.24)] bg-[rgba(245,158,11,.08)] px-4 py-3 text-[13px] leading-6 text-[var(--c-text-2)]">
          {invalidatedMessage}
        </div>
      )}

      {view === 'list' && !invalidatedMessage && isSelectMode && (
        <BatchActionBar
          selectedCount={selectedIds.size}
          currentListCount={currentConversations.length}
          onSelectAll={() => selectAll(currentConversations.map((c) => c.id))}
          onExportZip={(flatten) => void exportSelectedZip(flatten)}
          onBatchDelete={() => void batchDelete()}
          onExit={exitSelectMode}
        />
      )}

      {view === 'list' && !invalidatedMessage && (
        <FolderTree
          folders={folders}
          activeFolderId={activeFolderId}
          showAllConvs={showAllConvs}
          conversations={conversations}
          onSelectFolder={selectFolder}
          onSelectAll={selectAllFolders}
          onCreateFolder={createFolder}
          onRenameFolder={renameFolder}
          onDeleteFolder={deleteFolder}
        />
      )}

      {view === 'list' && !invalidatedMessage && isSelectMode && selectedIds.size > 0 && (
        <MoveToFolderBar
          folders={folders}
          onMove={(folderId) => void moveToFolder([...selectedIds], folderId)}
        />
      )}

      <main
        className={`min-h-0 flex-1 rounded-[24px] border border-[var(--c-border)] bg-[var(--c-panel)] shadow-[var(--c-shadow)] backdrop-blur-md ${view === 'list' ? 'overflow-hidden' : 'overflow-y-auto'}`}
      >
        {isLoading && (
          <div className="flex h-24 items-center justify-center gap-3 text-sm text-[var(--c-text-3)]">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-[var(--c-brand)] shadow-[var(--c-shadow-soft)]">
              <RefreshIcon size={15} className="animate-spin-slow" />
            </span>
            <span>加载中...</span>
          </div>
        )}
        {!isLoading && !invalidatedMessage && view === 'list' && (
          <ConversationList
            key={conversationListKey}
            listKey={conversationListKey}
            conversations={currentConversations}
            folders={folders}
            isSelectMode={isSelectMode}
            selectedIds={selectedIds}
            isSearchMode={isSearchMode}
            searchTotal={searchTotal}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onToggleSelect={toggleSelect}
            onOpen={openConversation}
            onDelete={deleteConversation}
            onExport={exportConversation}
            onMoveToFolder={moveToFolder}
            onLoadMore={loadMoreSearchResults}
          />
        )}
        {!isLoading && !invalidatedMessage && view === 'detail' && selectedConv && (
          <ConversationDetail conversation={selectedConv} onDeleteMessage={deleteMessage} />
        )}
        {!isLoading && invalidatedMessage && (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="max-w-[380px] rounded-[24px] border border-[rgba(245,158,11,.24)] bg-[rgba(245,158,11,.08)] px-5 py-5 text-[14px] leading-7 text-[var(--c-text-2)]">
              {invalidatedMessage}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
