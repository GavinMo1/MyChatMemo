// src/sidepanel/components/FolderTree.tsx
// 紧凑文件夹筛选条 + 折叠弹层

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Folder, ConversationMeta } from '@/types';
import { useFolderEditor } from '../hooks/useFolderEditor';
import FolderTreeItem from './FolderTreeItem';
import { InlineFolderInput } from './FolderNameInput';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileStackIcon,
  FolderIcon,
  FolderPlusIcon,
  XIcon,
} from '@/ui/icons';

interface Props {
  folders: Folder[];
  activeFolderId: string | null;
  showAllConvs: boolean;
  conversations: ConversationMeta[];
  onSelectFolder: (id: string | null) => void;
  onSelectAll: () => void;
  onCreateFolder: (name: string, parentId: string | null) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
}

const FolderTree: React.FC<Props> = ({
  folders,
  activeFolderId,
  showAllConvs,
  conversations,
  onSelectFolder,
  onSelectAll,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}) => {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const editor = useFolderEditor({ onCreateFolder, onRenameFolder });
  const cancelEdit = editor.cancel;
  const rootEdit = editor.state.kind === 'create-root' ? editor.state : null;
  const rootFolders = useMemo(
    () => folders.filter((folder) => folder.parentId === null),
    [folders]
  );

  const getChildren = (parentId: string) =>
    folders.filter((folder) => folder.parentId === parentId);

  // 预聚合各文件夹的对话数（含一级子文件夹），避免渲染时反复全量过滤
  const folderCounts = useMemo(() => {
    const direct = new Map<string, number>();
    let uncategorized = 0;
    for (const conversation of conversations) {
      if (!conversation.folderId) {
        uncategorized += 1;
        continue;
      }
      direct.set(conversation.folderId, (direct.get(conversation.folderId) ?? 0) + 1);
    }

    const counts = new Map<string | null, number>();
    counts.set(null, uncategorized);
    for (const folder of folders) {
      let total = direct.get(folder.id) ?? 0;
      for (const child of folders) {
        if (child.parentId === folder.id) {
          total += direct.get(child.id) ?? 0;
        }
      }
      counts.set(folder.id, total);
    }
    return counts;
  }, [conversations, folders]);

  const countInFolder = (folderId: string | null): number => folderCounts.get(folderId) ?? 0;

  const selectedLabel = useMemo(() => {
    if (showAllConvs) return '全部对话';
    if (activeFolderId === null) return '未分类';
    return folders.find((folder) => folder.id === activeFolderId)?.name ?? '未知文件夹';
  }, [activeFolderId, folders, showAllConvs]);

  const selectedCount = showAllConvs ? conversations.length : countInFolder(activeFolderId);

  const closePanel = useCallback(() => {
    cancelEdit();
    setIsPanelOpen(false);
  }, [cancelEdit]);

  useEffect(() => {
    if (!isPanelOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      // 输入框 Escape 取消当前草稿；面板其余位置 Escape 关闭并清理。
      if ((event.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (event.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closePanel, isPanelOpen]);
  const selectAllConversations = () => {
    onSelectAll();
    closePanel();
  };

  const selectUncategorized = () => {
    onSelectFolder(null);
    closePanel();
  };

  return (
    <div className="relative mb-3">
      {isPanelOpen && (
        <button
          onMouseDown={(event) => event.preventDefault()}
          type="button"
          aria-label="关闭文件夹面板"
          className="fixed inset-0 z-30 cursor-default"
          onClick={closePanel}
        />
      )}

      <div className="relative z-40 flex items-center justify-between gap-3 rounded-[20px] border border-[var(--c-border)] bg-[rgba(255,255,255,.78)] px-4 py-3 shadow-[var(--c-shadow-soft)] backdrop-blur-md">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-3)]">
            当前筛选
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="truncate text-[14px] font-semibold text-[var(--c-text)]">
              {selectedLabel}
            </span>
            <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] text-[var(--c-text-3)]">
              {selectedCount}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setIsPanelOpen((prev) => !prev);
              editor.cancel();
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--c-border)] bg-white px-3 py-2 text-[12px] font-medium text-[var(--c-text-2)] transition hover:border-[var(--c-brand)] hover:text-[var(--c-brand)]"
            title="切换文件夹面板"
          >
            <FolderIcon size={14} />
            文件夹
            {isPanelOpen ? <ChevronDownIcon size={13} /> : <ChevronRightIcon size={13} />}
          </button>
          <button
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setIsPanelOpen(true);
              editor.startRoot();
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--c-border)] bg-white px-3 py-2 text-[12px] font-medium text-[var(--c-brand)] transition hover:border-[var(--c-brand)] hover:bg-[var(--c-brand-soft)]"
            title="新建文件夹"
          >
            <FolderPlusIcon size={14} />
            新建
          </button>
        </div>
      </div>

      {isPanelOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-full overflow-hidden rounded-[22px] border border-[var(--c-border)] bg-[rgba(255,255,255,.98)] shadow-[var(--c-shadow)] backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-[var(--c-border)] px-4 py-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-3)]">
                文件夹
              </div>
              <div className="mt-1 text-[13px] text-[var(--c-text-2)]">
                选择筛选范围，或在这里管理文件夹。
              </div>
            </div>
            <button
              onMouseDown={(event) => event.preventDefault()}
              onClick={closePanel}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--c-border)] text-[var(--c-text-3)] transition hover:border-[var(--c-border-strong)] hover:text-[var(--c-text)]"
              title="关闭文件夹面板"
            >
              <XIcon size={14} />
            </button>
          </div>

          <div className="max-h-[28rem] overflow-y-auto px-3 py-3">
            <div className="space-y-1">
              <FilterButton
                icon={<FileStackIcon size={15} />}
                label="全部对话"
                count={conversations.length}
                active={showAllConvs}
                onClick={selectAllConversations}
              />
              <FilterButton
                icon={<FolderIcon size={15} />}
                label="未分类"
                count={countInFolder(null)}
                active={!showAllConvs && activeFolderId === null}
                onClick={selectUncategorized}
              />
            </div>

            <div className="mt-3 border-t border-[var(--c-border)] pt-3">
              {rootFolders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--c-border)] px-4 py-4 text-[13px] text-[var(--c-text-3)]">
                  还没有文件夹，可以先新建一个。
                </div>
              ) : (
                rootFolders.map((folder) => (
                  <FolderTreeItem
                    key={folder.id}
                    folder={folder}
                    childFolders={getChildren(folder.id)}
                    activeFolderId={activeFolderId}
                    showAllConvs={showAllConvs}
                    countInFolder={countInFolder}
                    editor={editor}
                    onSelect={(id) => {
                      onSelectFolder(id);
                      closePanel();
                    }}
                    onDelete={onDeleteFolder}
                  />
                ))
              )}
            </div>

            {rootEdit && (
              <InlineFolderInput
                key={rootEdit.session}
                value={rootEdit.draft}
                onChange={(value) => editor.changeDraft(rootEdit.session, value)}
                onSubmit={() => editor.submit(rootEdit.session)}
                onCancel={() => editor.cancel(rootEdit.session)}
                placeholder="文件夹名称"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface FilterButtonProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

const FilterButton: React.FC<FilterButtonProps> = ({ icon, label, count, active, onClick }) => (
  <button
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-left text-sm transition ${
      active
        ? 'border-[var(--c-brand)] bg-[linear-gradient(135deg,rgba(15,118,110,.12),rgba(255,255,255,.96))] text-[var(--c-brand)] shadow-[0_10px_20px_rgba(15,118,110,.08)]'
        : 'border-transparent text-[var(--c-text-2)] hover:border-[var(--c-border)] hover:bg-white/80'
    }`}
  >
    <span className="inline-flex items-center gap-2">
      {icon}
      {label}
    </span>
    <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] text-[var(--c-text-3)]">
      {count}
    </span>
  </button>
);

export default FolderTree;
