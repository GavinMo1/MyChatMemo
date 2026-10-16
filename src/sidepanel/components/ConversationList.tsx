// src/sidepanel/components/ConversationList.tsx

import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { List, type RowComponentProps } from 'react-window';
import type { ConversationMeta, Folder } from '@/types';
import { DownloadIcon, ExternalLinkIcon, FileStackIcon, FolderIcon, TrashIcon } from '@/ui/icons';
import { useIsomorphicLayoutEffect } from '@/ui/useIsomorphicLayoutEffect';

interface Props {
  listKey: string;
  conversations: ConversationMeta[];
  folders: Folder[];
  isSelectMode: boolean;
  selectedIds: Set<string>;
  isSearchMode: boolean;
  searchTotal: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  onMoveToFolder: (conversationIds: string[], folderId: string | null) => void;
  onLoadMore: () => void;
}

interface RowData {
  conversations: ConversationMeta[];
  isSelectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  onContextMenu: (event: React.MouseEvent, convId: string) => void;
}

const ROW_HEIGHT = 88;

const ConversationRow = memo(
  ({ index, style, ariaAttributes, ...data }: RowComponentProps<RowData>) => {
    const conv = data.conversations[index];
    const isSelected = data.selectedIds.has(conv.id);

    return (
      <div style={style} {...ariaAttributes}>
        <div
          className={`mx-3 my-2 cursor-pointer rounded-[18px] border px-4 py-3 transition group ${
            isSelected
              ? 'border-[var(--c-brand)] bg-[linear-gradient(135deg,rgba(15,118,110,.14),rgba(255,255,255,.96))] shadow-[0_14px_30px_rgba(15,118,110,.12)]'
              : 'border-[var(--c-border)] bg-white/92 hover:-translate-y-[1px] hover:border-[var(--c-border-strong)] hover:shadow-[var(--c-shadow-soft)]'
          }`}
          onClick={() => (data.isSelectMode ? data.onToggleSelect(conv.id) : data.onOpen(conv.id))}
          onContextMenu={(event) => data.onContextMenu(event, conv.id)}
        >
          <div className="flex items-start justify-between gap-2">
            {data.isSelectMode && (
              <div className="flex items-center pt-0.5 mr-1">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => data.onToggleSelect(conv.id)}
                  className="h-4 w-4 rounded border-[var(--c-border-strong)] text-[var(--c-brand)] focus:ring-[var(--c-brand-light)] accent-[var(--c-brand)]"
                  onClick={(event) => event.stopPropagation()}
                />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <p className="truncate text-[14px] font-semibold leading-snug text-[var(--c-text)]">
                {conv.title || '无标题'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--c-text-3)]">
                <span className="font-medium text-[var(--c-text-2)]">
                  {`${conv.stats.messageCount} 条消息`}
                </span>
                <span className="font-mono text-[10px] tracking-[0.04em]">
                  {formatDate(conv.updatedAt)}
                </span>
              </div>
            </div>

            {!data.isSelectMode && (
              <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    data.onExport(conv.id);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-transparent text-[var(--c-text-3)] transition hover:border-[var(--c-border)] hover:bg-[var(--c-surface)] hover:text-[var(--c-brand)]"
                  title="导出 Markdown"
                >
                  <DownloadIcon size={15} />
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    data.onDelete(conv.id);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-transparent text-[var(--c-text-3)] transition hover:border-[rgba(220,38,38,.16)] hover:bg-[rgba(220,38,38,.06)] hover:text-[var(--c-danger)]"
                  title="删除"
                >
                  <TrashIcon size={15} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

ConversationRow.displayName = 'ConversationRow';
const VirtualConversationRow = ConversationRow as unknown as (
  props: RowComponentProps<RowData>
) => React.ReactElement | null;

const ConversationList: React.FC<Props> = ({
  listKey,
  conversations,
  folders,
  isSelectMode,
  selectedIds,
  isSearchMode,
  searchTotal,
  hasMore,
  isLoadingMore,
  onToggleSelect,
  onOpen,
  onDelete,
  onExport,
  onMoveToFolder,
  onLoadMore,
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; convId: string } | null>(
    null
  );
  const [listHeight, setListHeight] = useState(400);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const virtualListRef = useRef<{
    element: HTMLDivElement | null;
    scrollToRow: (config: {
      index: number;
      align?: 'auto' | 'smart' | 'center' | 'end' | 'start';
      behavior?: 'auto' | 'smooth' | 'instant';
    }) => void;
  } | null>(null);

  useEffect(() => {
    const element = listContainerRef.current;
    if (!element) return;

    const updateHeight = () => setListHeight(Math.max(160, element.clientHeight));
    updateHeight();

    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useIsomorphicLayoutEffect(() => {
    const element = listContainerRef.current;
    if (!element) return;

    const updateHeight = () => setListHeight(Math.max(160, element.clientHeight));
    updateHeight();

    const rafId = requestAnimationFrame(updateHeight);
    return () => cancelAnimationFrame(rafId);
  }, [listKey]);

  useEffect(() => {
    setContextMenu(null);
    virtualListRef.current?.scrollToRow({
      index: 0,
      align: 'start',
      behavior: 'auto',
    });
  }, [listKey]);

  const rowData = useMemo<RowData>(
    () => ({
      conversations,
      isSelectMode,
      selectedIds,
      onToggleSelect,
      onOpen,
      onDelete,
      onExport,
      onContextMenu: (event, convId) => {
        event.preventDefault();
        setContextMenu({ x: event.clientX, y: event.clientY, convId });
      },
    }),
    [conversations, isSelectMode, selectedIds, onToggleSelect, onOpen, onDelete, onExport]
  );

  const closeContextMenu = () => setContextMenu(null);

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-[var(--c-text-3)] text-sm gap-3 animate-fadeIn">
        <span className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-[var(--c-border)] bg-white/90 text-[var(--c-brand)] shadow-[var(--c-shadow-soft)]">
          <FileStackIcon size={26} />
        </span>
        <span className="font-semibold text-[var(--c-text-2)]">暂无保存的对话</span>
        <span className="text-xs tracking-[0.04em]">手动保存一次后会持续同步更新</span>
      </div>
    );
  }

  return (
    <>
      {contextMenu && <div className="fixed inset-0 z-40" onClick={closeContextMenu} />}

      <div className="h-full flex flex-col">
        <div ref={listContainerRef} className="flex-1 min-h-0">
          <List
            key={listKey}
            listRef={virtualListRef}
            rowCount={conversations.length}
            rowHeight={ROW_HEIGHT}
            rowComponent={VirtualConversationRow}
            rowProps={rowData}
            overscanCount={3} // 优化：从 6 降至 3，减少离屏渲染
            style={{ height: listHeight }}
          />
        </div>

        {isSearchMode && (
          <div className="flex items-center justify-between gap-3 border-t border-[var(--c-border)] bg-white/85 px-4 py-3">
            <span className="text-xs text-[var(--c-text-3)]">
              {`已显示 ${conversations.length} / ${searchTotal} 条搜索结果`}
            </span>
            {hasMore ? (
              <button
                onClick={onLoadMore}
                disabled={isLoadingMore}
                className="rounded-xl border border-[var(--c-border)] bg-white px-3 py-2 text-[12px] font-medium text-[var(--c-brand)] transition hover:border-[var(--c-brand)] hover:bg-[var(--c-brand-soft)] disabled:opacity-50"
              >
                {isLoadingMore ? '加载中…' : '加载更多'}
              </button>
            ) : (
              <span className="text-xs text-[var(--c-text-3)]">已加载全部结果</span>
            )}
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 min-w-[220px] overflow-hidden rounded-[20px] border border-[var(--c-border)] bg-[rgba(255,255,255,.97)] py-2 shadow-[var(--c-shadow)] backdrop-blur-md animate-fadeIn"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              onOpen(contextMenu.convId);
              closeContextMenu();
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-[var(--c-text)] transition hover:bg-[var(--c-surface)]"
          >
            <ExternalLinkIcon size={15} />
            查看对话
          </button>
          <button
            onClick={() => {
              onExport(contextMenu.convId);
              closeContextMenu();
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-[var(--c-text)] transition hover:bg-[var(--c-surface)]"
          >
            <DownloadIcon size={15} />
            导出 Markdown
          </button>
          <div className="border-t border-[var(--c-border)] my-1" />
          <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--c-text-3)]">
            移动到文件夹
          </div>
          <button
            onClick={() => {
              onMoveToFolder([contextMenu.convId], null);
              closeContextMenu();
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-[var(--c-text)] transition hover:bg-[var(--c-surface)]"
          >
            <FolderIcon size={15} />
            未分类
          </button>
          {folders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => {
                onMoveToFolder([contextMenu.convId], folder.id);
                closeContextMenu();
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-[var(--c-text)] transition hover:bg-[var(--c-surface)]"
            >
              <FolderIcon size={15} />
              {folder.name}
            </button>
          ))}
          <div className="border-t border-[var(--c-border)] my-1" />
          <button
            onClick={() => {
              onDelete(contextMenu.convId);
              closeContextMenu();
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-[var(--c-danger)] transition hover:bg-[rgba(220,38,38,.06)]"
          >
            <TrashIcon size={15} />
            删除对话
          </button>
        </div>
      )}
    </>
  );
};

function formatDate(iso: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60_000) return '刚刚';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
    return date.toLocaleDateString();
  } catch {
    return iso;
  }
}

export default ConversationList;
