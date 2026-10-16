import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as ipc from '@/browser/ipc';
import { ActionType } from '@/shared/protocol';

describe('typed browser IPC wire compatibility', () => {
  const sendMessage = vi.fn();
  beforeEach(() => {
    sendMessage.mockReset();
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the request envelope and returns the action-specific response data', async () => {
    const result = { saved: true, messageCount: 1 };
    sendMessage.mockResolvedValue({ status: 'ok', data: result });
    const payload = {
      conversationId: 'conversation',
      platform: 'chatgpt',
      title: '标题',
      url: 'https://chatgpt.com/c/conversation',
      currentMessages: [{ sender: 'user' as const, content: 'Hello', hashId: '', position: 0 }],
    };
    expect(await ipc.syncMessages(payload)).toEqual(result);
    expect(sendMessage).toHaveBeenCalledWith({
      type: ActionType.CS_REQ_SYNC_MESSAGES,
      payload,
      timestamp: expect.any(Number),
    });
  });

  it('keeps absent payload and absent success data for parameterless and mutation requests', async () => {
    sendMessage.mockResolvedValueOnce({ status: 'ok', data: [] });
    expect(await ipc.listFolders()).toEqual([]);
    expect(sendMessage).toHaveBeenLastCalledWith({
      type: ActionType.SB_REQ_LIST_FOLDERS,
      payload: undefined,
      timestamp: expect.any(Number),
    });
    sendMessage.mockResolvedValueOnce({ status: 'ok' });
    expect(await ipc.deleteFolder('folder')).toBeUndefined();
    expect(sendMessage).toHaveBeenLastCalledWith({
      type: ActionType.SB_REQ_DELETE_FOLDER,
      payload: { id: 'folder' },
      timestamp: expect.any(Number),
    });
  });

  it('preserves nullable query results and default export options', async () => {
    sendMessage.mockResolvedValueOnce({ status: 'ok', data: null });
    expect(await ipc.queryConversation('missing')).toBeNull();
    sendMessage.mockResolvedValueOnce({
      status: 'ok',
      data: { filename: 'export.zip', base64: '' },
    });
    expect(await ipc.exportConversationsZip(['conversation'])).toEqual({
      filename: 'export.zip',
      base64: '',
    });
    expect(sendMessage).toHaveBeenLastCalledWith({
      type: ActionType.SB_REQ_EXPORT_CONVERSATIONS_ZIP,
      payload: { conversationIds: ['conversation'], flatten: false },
      timestamp: expect.any(Number),
    });
  });

  it('keeps backend and transport failures visible to callers', async () => {
    sendMessage.mockResolvedValueOnce({ status: 'error', error: '数据库不可用' });
    await expect(ipc.getConversation('id')).rejects.toThrow('数据库不可用');
    sendMessage.mockRejectedValueOnce(new Error('Extension context invalidated'));
    await expect(ipc.listConversations()).rejects.toThrow('Extension context invalidated');
  });
});
