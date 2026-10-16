import { useCallback, useRef, useState } from 'react';
import type { Folder } from '@/types';

type FolderEdit =
  | { kind: 'idle' }
  | { kind: 'create-root'; session: number; draft: string }
  | { kind: 'create-child' | 'rename'; session: number; draft: string; folderId: string };

interface Options {
  onCreateFolder: (name: string, parentId: string | null) => void;
  onRenameFolder: (id: string, name: string) => void;
}

/** 一个编辑会话对应一个草稿；同步清理 ref 防止 Enter 后的 blur 再次提交。 */
export function useFolderEditor({ onCreateFolder, onRenameFolder }: Options) {
  const [state, setState] = useState<FolderEdit>({ kind: 'idle' });
  const current = useRef<FolderEdit>(state);
  const nextSession = useRef(0);

  const replace = useCallback((next: FolderEdit) => {
    current.current = next;
    setState(next);
  }, []);
  const cancel = useCallback(
    (session?: number) => {
      if (
        session !== undefined &&
        (current.current.kind === 'idle' || current.current.session !== session)
      )
        return;
      replace({ kind: 'idle' });
    },
    [replace]
  );
  const changeDraft = (session: number, draft: string) => {
    const editing = current.current;
    if (editing.kind !== 'idle' && editing.session === session) replace({ ...editing, draft });
  };
  const submit = (session: number) => {
    const editing = current.current;
    if (editing.kind === 'idle' || editing.session !== session) return;
    const name = editing.draft.trim();
    if (!name) {
      if (editing.kind === 'rename') cancel(session);
      return;
    }
    // 必须在调用外部回调之前关闭当前会话，后续 blur 只能看到已失效的 session。
    cancel(session);
    if (editing.kind === 'rename') onRenameFolder(editing.folderId, name);
    else onCreateFolder(name, editing.kind === 'create-child' ? editing.folderId : null);
  };

  return {
    state,
    cancel,
    submit,
    changeDraft,
    startRoot: () => replace({ kind: 'create-root', session: ++nextSession.current, draft: '' }),
    startChild: (folderId: string) =>
      replace({ kind: 'create-child', session: ++nextSession.current, draft: '', folderId }),
    startRename: (folder: Folder) =>
      replace({
        kind: 'rename',
        session: ++nextSession.current,
        draft: folder.name,
        folderId: folder.id,
      }),
  };
}

export type FolderEditor = ReturnType<typeof useFolderEditor>;
