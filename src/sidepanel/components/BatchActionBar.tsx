// src/sidepanel/components/BatchActionBar.tsx
// 多选模式下的批量操作工具条

import React from 'react';
import { DownloadIcon, TrashIcon, XIcon } from '@/ui/icons';

interface Props {
  selectedCount: number;
  currentListCount: number;
  onSelectAll: () => void;
  onExportZip: (flatten: boolean) => void;
  onBatchDelete: () => void;
  onExit: () => void;
}

const BatchActionBar: React.FC<Props> = ({
  selectedCount,
  currentListCount,
  onSelectAll,
  onExportZip,
  onBatchDelete,
  onExit,
}) => {
  return (
    <div className="mb-3 rounded-[20px] border border-[var(--c-border)] bg-[linear-gradient(135deg,rgba(15,118,110,.08),rgba(22,78,99,.05))] px-4 py-4 shadow-[var(--c-shadow-soft)] animate-fadeIn">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--c-brand)]">
            批量操作
          </div>
          <div className="mt-1 text-[14px] font-semibold text-[var(--c-text)]">
            {`已选 ${selectedCount} 项`}
          </div>
          <div className="mt-1 text-[12px] leading-6 text-[var(--c-text-3)]">
            {`当前列表共 ${currentListCount} 条对话，按钮会自动换行，不再挤压搜索区。`}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={onSelectAll}
            className="rounded-xl border border-[var(--c-border)] bg-white px-3 py-2 text-[12px] font-medium text-[var(--c-text-2)] transition hover:border-[var(--c-brand)] hover:text-[var(--c-brand)]"
          >
            全选当前列表
          </button>
          <button
            onClick={() => onExportZip(false)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[linear-gradient(135deg,var(--c-brand),var(--c-brand-dark))] px-3 py-2 text-[12px] font-medium text-white shadow-[0_12px_24px_rgba(15,118,110,.24)] transition hover:opacity-95 disabled:opacity-50"
            disabled={selectedCount === 0}
          >
            <DownloadIcon size={14} />
            分目录导出
          </button>
          <button
            onClick={() => onExportZip(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--c-border)] bg-white px-3 py-2 text-[12px] font-medium text-[var(--c-brand)] transition hover:border-[var(--c-brand)] hover:bg-[var(--c-brand-soft)] disabled:opacity-50"
            disabled={selectedCount === 0}
          >
            <DownloadIcon size={14} />
            平铺导出
          </button>
          <button
            onClick={onBatchDelete}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--c-danger)] px-3 py-2 text-[12px] font-medium text-white transition hover:opacity-95 disabled:opacity-50"
            disabled={selectedCount === 0}
          >
            <TrashIcon size={14} />
            删除
          </button>
          <button
            onClick={onExit}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--c-border)] bg-white px-3 py-2 text-[12px] font-medium text-[var(--c-text-2)] transition hover:border-[var(--c-border-strong)] hover:text-[var(--c-text)]"
          >
            <XIcon size={14} />
            退出多选
          </button>
        </div>
      </div>
    </div>
  );
};

export default BatchActionBar;
