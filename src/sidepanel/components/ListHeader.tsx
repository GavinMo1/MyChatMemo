// src/sidepanel/components/ListHeader.tsx
// 顶栏：详情视图的返回/导出，列表视图的搜索框与操作按钮

import React from 'react';
import { ArrowLeftIcon, CheckSquareIcon, DownloadIcon, RefreshIcon, SearchIcon } from '@/ui/icons';

interface Props {
  isDetailView: boolean;
  detailTitle: string;
  canExportDetail: boolean;
  onBack: () => void;
  onExportDetail: () => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  isSelectMode: boolean;
  selectedCount: number;
  onEnterSelectMode: () => void;
  onRefresh: () => void;
  disabled: boolean;
}

const ListHeader: React.FC<Props> = ({
  isDetailView,
  detailTitle,
  canExportDetail,
  onBack,
  onExportDetail,
  searchQuery,
  onSearchQueryChange,
  isSelectMode,
  selectedCount,
  onEnterSelectMode,
  onRefresh,
  disabled,
}) => {
  return (
    <header className="mb-3 rounded-[20px] border border-[var(--c-border)] bg-[var(--c-panel)] px-3 py-3 shadow-[var(--c-shadow-soft)] backdrop-blur-md flex-shrink-0">
      {isDetailView ? (
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--c-border)] bg-white text-[var(--c-text-2)] transition hover:border-[var(--c-border-strong)] hover:text-[var(--c-text)]"
            title="返回列表"
          >
            <ArrowLeftIcon size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold tracking-[0.01em] text-[var(--c-text)]">
              {detailTitle || '对话详情'}
            </div>
          </div>
          {canExportDetail && (
            <button
              onClick={onExportDetail}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--c-border)] bg-white px-3 py-2 text-[12px] font-medium text-[var(--c-brand)] transition hover:border-[var(--c-brand)] hover:bg-[var(--c-brand-soft)]"
            >
              <DownloadIcon size={14} />
              导出
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text-3)]">
                <SearchIcon size={15} />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                placeholder="搜索对话…"
                disabled={disabled}
                className="w-full rounded-2xl border border-[var(--c-border)] bg-white/90 py-2.5 pl-10 pr-10 text-[13px] text-[var(--c-text)] outline-none transition placeholder:text-[var(--c-text-3)] focus:border-[var(--c-brand)] focus:ring-4 focus:ring-[rgba(94,234,212,.2)]"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchQueryChange('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--c-text-3)] hover:text-[var(--c-text)] rounded transition"
                  aria-label="清除搜索"
                  title="清除搜索"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
            {!isSelectMode && (
              <>
                <button
                  onClick={onEnterSelectMode}
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-[var(--c-border)] bg-white text-[var(--c-text-2)] transition hover:border-[var(--c-brand)] hover:text-[var(--c-brand)]"
                  title="多选管理"
                  disabled={disabled}
                >
                  <CheckSquareIcon size={18} />
                </button>
                <button
                  onClick={onRefresh}
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-[var(--c-border)] bg-white text-[var(--c-text-2)] transition hover:border-[var(--c-brand)] hover:text-[var(--c-brand)]"
                  title="刷新"
                  disabled={disabled}
                >
                  <RefreshIcon size={18} />
                </button>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isSelectMode && (
              <>
                <span className="inline-flex min-h-[42px] items-center rounded-xl border border-[rgba(15,118,110,.14)] bg-[rgba(15,118,110,.08)] px-3 py-2 text-[12px] font-medium text-[var(--c-brand)]">
                  多选模式
                </span>
                <span className="text-[12px] text-[var(--c-text-3)]">
                  {`已选 ${selectedCount} 项，批量操作已移到下方工具条。`}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default ListHeader;
