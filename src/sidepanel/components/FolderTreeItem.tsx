import React, { useState } from 'react';
import type { Folder } from '@/types';
import type { FolderEditor } from '../hooks/useFolderEditor';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  EditIcon,
  FolderIcon,
  FolderPlusIcon,
  TrashIcon,
} from '@/ui/icons';
import { InlineFolderInput, RenameFolderInput } from './FolderNameInput';

interface Props {
  folder: Folder;
  childFolders: Folder[];
  activeFolderId: string | null;
  showAllConvs: boolean;
  countInFolder: (id: string | null) => number;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  editor: FolderEditor;
}

const FolderTreeItem: React.FC<Props> = ({
  folder,
  childFolders,
  activeFolderId,
  showAllConvs,
  countInFolder,
  onSelect,
  onDelete,
  editor,
}) => {
  const [expanded, setExpanded] = useState(false);
  const isActive = !showAllConvs && activeFolderId === folder.id;
  const editing =
    editor.state.kind === 'rename' && editor.state.folderId === folder.id ? editor.state : null;
  const childEdit =
    editor.state.kind === 'create-child' && editor.state.folderId === folder.id
      ? editor.state
      : null;
  const hasChildren = childFolders.length > 0;

  return (
    <div className="mt-1">
      <div
        className={`group flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2.5 text-sm transition ${
          isActive
            ? 'border-[var(--c-brand)] bg-[linear-gradient(135deg,rgba(15,118,110,.12),rgba(255,255,255,.96))] text-[var(--c-brand)] shadow-[0_10px_20px_rgba(15,118,110,.08)]'
            : 'border-transparent text-[var(--c-text-2)] hover:border-[var(--c-border)] hover:bg-white/80'
        }`}
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).tagName !== 'INPUT') event.preventDefault();
        }}
        onClick={() => onSelect(folder.id)}
      >
        {hasChildren ? (
          <button
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((prev) => !prev);
            }}
            aria-label={`${expanded ? '收起' : '展开'}${folder.name}`}
            className="text-[var(--c-text-3)] transition hover:text-[var(--c-text-2)]"
          >
            {expanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
          </button>
        ) : (
          <span className="w-[14px]" />
        )}

        <span className="text-[var(--c-brand)]">
          <FolderIcon size={15} />
        </span>

        {editing ? (
          <RenameFolderInput
            key={editing.session}
            value={editing.draft}
            onChange={(value) => editor.changeDraft(editing.session, value)}
            onSubmit={() => editor.submit(editing.session)}
            onCancel={() => editor.cancel(editing.session)}
          />
        ) : (
          <span className="flex-1 truncate">{folder.name}</span>
        )}

        <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] text-[var(--c-text-3)]">
          {countInFolder(folder.id)}
        </span>

        <div className="ml-1 flex gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation();
              editor.startRename(folder);
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-xl text-[var(--c-text-3)] transition hover:bg-white hover:text-[var(--c-brand)]"
            title="重命名"
          >
            <EditIcon size={13} />
          </button>
          <button
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation();
              editor.startChild(folder.id);
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-xl text-[var(--c-text-3)] transition hover:bg-white hover:text-[var(--c-brand)]"
            title="添加子文件夹"
          >
            <FolderPlusIcon size={13} />
          </button>
          <button
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation();
              editor.cancel();
              onDelete(folder.id);
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-xl text-[var(--c-text-3)] transition hover:bg-[rgba(220,38,38,.06)] hover:text-[var(--c-danger)]"
            title="删除文件夹"
          >
            <TrashIcon size={13} />
          </button>
        </div>
      </div>

      {childEdit && (
        <div className="ml-7">
          <InlineFolderInput
            key={childEdit.session}
            value={childEdit.draft}
            onChange={(value) => editor.changeDraft(childEdit.session, value)}
            onSubmit={() => editor.submit(childEdit.session)}
            onCancel={() => editor.cancel(childEdit.session)}
            placeholder="子文件夹名称"
          />
        </div>
      )}

      {expanded && hasChildren && (
        <div className="ml-7 mt-1 space-y-1 border-l border-dashed border-[var(--c-border)] pl-3">
          {childFolders.map((child) => (
            <button
              onMouseDown={(event) => event.preventDefault()}
              key={child.id}
              onClick={() => onSelect(child.id)}
              className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left text-sm transition ${
                !showAllConvs && activeFolderId === child.id
                  ? 'border-[var(--c-brand)] bg-[linear-gradient(135deg,rgba(15,118,110,.12),rgba(255,255,255,.96))] text-[var(--c-brand)]'
                  : 'border-transparent text-[var(--c-text-3)] hover:border-[var(--c-border)] hover:bg-white/80'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <FolderIcon size={14} />
                {child.name}
              </span>
              <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] text-[var(--c-text-3)]">
                {countInFolder(child.id)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default FolderTreeItem;
