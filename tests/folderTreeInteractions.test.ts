import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FolderTree from '@/sidepanel/components/FolderTree';
import type { ConversationMeta, Folder } from '@/types';

const folder = (id: string, name: string, parentId: string | null = null): Folder => ({
  id,
  name,
  parentId,
  order: 0,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
});
const folders = [
  folder('work', '工作'),
  folder('child', '阶段一', 'work'),
  folder('other', '个人'),
];
const conversations = ['work', 'child', null].map(
  (folderId, i): ConversationMeta => ({
    id: `conv${i}`,
    title: `对话${i}`,
    platform: 'chatgpt',
    url: '',
    folderId,
    stats: { messageCount: 1, lastSyncedAt: 0 },
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    isArchived: false,
  })
);

describe('FolderTree DOM interactions', () => {
  let root: Root;
  let container: HTMLDivElement;
  const callbacks = {
    onSelectFolder: vi.fn(),
    onSelectAll: vi.fn(),
    onCreateFolder: vi.fn(),
    onRenameFolder: vi.fn(),
    onDeleteFolder: vi.fn(),
  };

  const button = (title: string, index = 0) =>
    container.querySelectorAll<HTMLButtonElement>(`button[title="${title}"]`)[index];
  const input = () => container.querySelector<HTMLInputElement>('input')!;
  const byText = (text: string) =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (element) => element.textContent === text
    )!;
  async function click(element: HTMLElement) {
    await act(async () => {
      const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      element.dispatchEvent(down);
      // JSDOM does not perform the browser's default focus/blur action.
      if (!down.defaultPrevented) element.focus();
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      element.click();
    });
  }
  async function type(value: string) {
    await act(async () => {
      const target = input();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        target,
        value
      );
      target.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  async function keyAndBlur(key: string) {
    await act(async () => {
      const target = input();
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      target.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
  }

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () =>
      root.render(
        React.createElement(FolderTree, {
          folders,
          conversations,
          activeFolderId: null,
          showAllConvs: true,
          ...callbacks,
        })
      )
    );
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
  });

  it('creates trimmed root and one-level child folders through the unchanged callbacks', async () => {
    await click(button('新建文件夹'));
    await type('  新项目  ');
    await keyAndBlur('Enter');
    expect(callbacks.onCreateFolder).toHaveBeenCalledExactlyOnceWith('新项目', null);
    await click(button('添加子文件夹'));
    await type('  下一阶段  ');
    await click(button('确认'));
    expect(callbacks.onCreateFolder).toHaveBeenLastCalledWith('下一阶段', 'work');
    expect(container.querySelectorAll('input')).toHaveLength(0);
  });

  it('submits rename only once when Enter is immediately followed by blur', async () => {
    await click(button('切换文件夹面板'));
    await click(button('重命名'));
    await type('  改名  ');
    await keyAndBlur('Enter');
    expect(callbacks.onRenameFolder).toHaveBeenCalledExactlyOnceWith('work', '改名');
  });

  it('keeps blur-to-submit rename behavior and cancels an empty rename', async () => {
    await click(button('切换文件夹面板'));
    await click(button('重命名'));
    await type('离开输入框');
    await act(async () => input().dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(callbacks.onRenameFolder).toHaveBeenCalledExactlyOnceWith('work', '离开输入框');
    await click(button('重命名'));
    await type('   ');
    await keyAndBlur('Enter');
    expect(callbacks.onRenameFolder).toHaveBeenCalledTimes(1);
    expect(container.querySelector('input')).toBeNull();
  });

  it('Escape cancels rename without submitting from the following blur or closing the panel', async () => {
    await click(button('切换文件夹面板'));
    await click(button('重命名'));
    await type('不要提交');
    await keyAndBlur('Escape');
    expect(callbacks.onRenameFolder).not.toHaveBeenCalled();
    expect(container.querySelector('input')).toBeNull();
    expect(button('关闭文件夹面板')).toBeDefined();
  });

  it('keeps create-root, create-child and rename mutually exclusive and clears replaced drafts', async () => {
    await click(button('新建文件夹'));
    await type('废弃根草稿');
    await click(button('添加子文件夹'));
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(input().placeholder).toBe('子文件夹名称');
    expect(input().value).toBe('');
    await type('废弃子草稿');
    await click(button('重命名'));
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(input().value).toBe('工作');
    await type('废弃重命名');
    const staleRename = input();
    await act(async () => {
      button('新建文件夹').click();
      // An old blur in the same React batch must not submit the replacement editor.
      staleRename.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(input().placeholder).toBe('文件夹名称');
    expect(input().value).toBe('');
    expect(callbacks.onRenameFolder).not.toHaveBeenCalled();
    expect(callbacks.onCreateFolder).not.toHaveBeenCalled();
  });

  it.each(['toggle', 'close', 'overlay', 'Escape'])(
    'clears drafts when closing via %s, with no ghost editor on reopen',
    async (method) => {
      await click(button('新建文件夹'));
      await type('不保留的草稿');
      if (method === 'toggle') await click(button('切换文件夹面板'));
      else if (method === 'close') await click(button('关闭文件夹面板'));
      else if (method === 'overlay')
        await click(container.querySelector('[aria-label="关闭文件夹面板"]')!);
      else
        await act(async () =>
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        );
      await click(button('切换文件夹面板'));
      expect(container.querySelector('input')).toBeNull();
      await click(button('新建文件夹'));
      expect(input().value).toBe('');
      expect(callbacks.onCreateFolder).not.toHaveBeenCalled();
    }
  );

  it('closing with the mouse cancels rename before browser blur can submit it', async () => {
    await click(button('切换文件夹面板'));
    await click(button('重命名'));
    await type('不保存');
    expect(document.activeElement).toBe(input());
    await click(button('关闭文件夹面板'));
    expect(callbacks.onRenameFolder).not.toHaveBeenCalled();
    await click(button('切换文件夹面板'));
    expect(container.querySelector('input')).toBeNull();
  });

  it('preserves root-plus-child counts, child expansion and distinct all/uncategorized selection', async () => {
    await click(button('切换文件夹面板'));
    expect(byText('全部对话3')).toBeDefined();
    expect(byText('未分类1')).toBeDefined();
    const workLabel = Array.from(container.querySelectorAll('span')).find(
      (element) => element.textContent === '工作'
    )!;
    expect(workLabel.parentElement!.textContent).toContain('工作2');
    await click(container.querySelector('[aria-label="展开工作"]')!);
    expect(byText('阶段一1')).toBeDefined();
    await click(byText('阶段一1'));
    expect(callbacks.onSelectFolder).toHaveBeenLastCalledWith('child');
    expect(button('关闭文件夹面板')).toBeUndefined();
    await click(button('切换文件夹面板'));
    await click(byText('未分类1'));
    expect(callbacks.onSelectFolder).toHaveBeenLastCalledWith(null);
    await click(button('切换文件夹面板'));
    await click(byText('全部对话3'));
    expect(callbacks.onSelectAll).toHaveBeenCalledTimes(1);
  });

  it('deleting a folder preserves the callback and cancels its draft', async () => {
    await click(button('切换文件夹面板'));
    await click(button('重命名'));
    await type('删除前草稿');
    await click(button('删除文件夹'));
    expect(callbacks.onDeleteFolder).toHaveBeenCalledExactlyOnceWith('work');
    expect(callbacks.onRenameFolder).not.toHaveBeenCalled();
    expect(container.querySelector('input')).toBeNull();
  });
});
