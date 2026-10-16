// src/sidepanel/components/MoveToFolderBar.tsx
// 多选模式下的"移动到文件夹"快捷条

import React from 'react';
import type { Folder } from '@/types';

interface Props {
  folders: Folder[];
  onMove: (folderId: string | null) => void;
}

const MoveToFolderBar: React.FC<Props> = ({ folders, onMove }) => {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[20px] border border-[var(--c-border)] bg-[linear-gradient(135deg,rgba(15,118,110,.12),rgba(22,78,99,.06))] px-4 py-3 shadow-[var(--c-shadow-soft)] animate-fadeIn">
      <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--c-brand)] font-semibold">
        移动到
      </span>
      <button
        onClick={() => onMove(null)}
        className="rounded-full border border-[var(--c-border)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--c-text-2)] transition hover:border-[var(--c-brand)] hover:text-[var(--c-brand)]"
      >
        未分类
      </button>
      {folders.map((folder) => (
        <button
          key={folder.id}
          onClick={() => onMove(folder.id)}
          className="rounded-full border border-[var(--c-border)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--c-brand)] transition hover:border-[var(--c-brand)] hover:bg-[var(--c-brand-soft)]"
        >
          {folder.name}
        </button>
      ))}
    </div>
  );
};

export default MoveToFolderBar;
