import React from 'react';
import { CheckIcon, XIcon } from '@/ui/icons';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  placeholder?: string;
}

const FolderNameField: React.FC<Props & { rename?: boolean }> = ({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  rename = false,
}) => (
  <input
    type="text"
    value={value}
    onChange={(event) => onChange(event.target.value)}
    onKeyDown={(event) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'Enter') onSubmit();
        else onCancel();
      }
    }}
    onBlur={rename ? onSubmit : undefined}
    aria-label={rename ? '重命名文件夹' : placeholder}
    placeholder={placeholder}
    className={
      rename
        ? 'flex-1 rounded-xl border border-[var(--c-brand-light)] bg-white px-2 py-1 text-sm focus:outline-none'
        : 'flex-1 rounded-xl border border-[var(--c-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--c-brand-light)]'
    }
    autoFocus
    onClick={(event) => event.stopPropagation()}
  />
);

export const RenameFolderInput: React.FC<Props> = (props) => <FolderNameField {...props} rename />;

export const InlineFolderInput: React.FC<Props> = (props) => (
  <div className="mt-3 flex items-center gap-2 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2">
    <FolderNameField {...props} />
    <button
      onClick={props.onSubmit}
      onMouseDown={(event) => event.preventDefault()}
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--c-brand)] text-white transition hover:opacity-95"
      title="确认"
    >
      <CheckIcon size={15} />
    </button>
    <button
      onClick={props.onCancel}
      onMouseDown={(event) => event.preventDefault()}
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--c-border)] text-[var(--c-text-3)] transition hover:text-[var(--c-text)]"
      title="取消"
    >
      <XIcon size={15} />
    </button>
  </div>
);
