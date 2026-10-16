import { describe, expect, it, vi } from 'vitest';
import { MessageRouter } from '@/background/router';
import { ActionType } from '@/shared/protocol';
import type { IPCResponse } from '@/shared/protocol';
import { db } from '@/background/database';

type RouterAccess = {
  handlers: Record<ActionType, (payload: unknown) => unknown>;
  dispatch: (
    input: unknown,
    tabId: number | undefined,
    reply: (response: IPCResponse) => void
  ) => void;
};

function dispatch(router: RouterAccess, message: unknown): Promise<IPCResponse> {
  return new Promise((resolve) => router.dispatch(message, undefined, resolve));
}

const syncPayload = {
  conversationId: 'conv_1',
  platform: 'chatgpt',
  url: '',
  title: '',
  currentMessages: [{ hashId: '', sender: 'user', content: 'Hello', position: 0 }],
};
const requests: [ActionType, unknown][] = [
  [ActionType.CS_REQ_SYNC_MESSAGES, syncPayload],
  [ActionType.CS_REQ_QUERY_CONVERSATION, { conversationId: 'conv_1' }],
  [ActionType.SB_REQ_LIST_CONVERSATIONS, undefined],
  [ActionType.SB_REQ_GET_CONVERSATION, { conversationId: 'conv_1' }],
  [ActionType.SB_REQ_DELETE_CONVERSATION, { conversationId: 'conv_1' }],
  [ActionType.SB_REQ_DELETE_MESSAGE, { conversationId: 'conv_1', messageId: 'msg_1' }],
  [ActionType.SB_REQ_BATCH_DELETE_CONVERSATIONS, { conversationIds: ['conv_1'] }],
  [
    ActionType.SB_REQ_SEARCH_CONVERSATIONS,
    { keyword: 'hi', offset: 0, limit: 20, folderId: null, showAll: true },
  ],
  [ActionType.SB_REQ_EXPORT_DATA, { conversationId: 'conv_1' }],
  [ActionType.SB_REQ_EXPORT_CONVERSATIONS_ZIP, { conversationIds: ['conv_1'], flatten: false }],
  [ActionType.SB_REQ_MOVE_CONVERSATIONS, { conversationIds: ['conv_1'], folderId: null }],
  [ActionType.SB_REQ_LIST_FOLDERS, undefined],
  [ActionType.SB_REQ_CREATE_FOLDER, { name: '工作', parentId: null }],
  [ActionType.SB_REQ_UPDATE_FOLDER, { id: 'folder_1', name: '新名称', order: 0, parentId: null }],
  [ActionType.SB_REQ_DELETE_FOLDER, { id: 'folder_1' }],
];

describe('MessageRouter validation boundary', () => {
  it.each(requests)('allows valid %s payloads to reach the handler', async (type, payload) => {
    const router = new MessageRouter() as unknown as RouterAccess;
    const handler = vi.fn(async () => ({ status: 'ok' }));
    router.handlers[type] = handler;
    expect(await dispatch(router, { type, payload, timestamp: 0 })).toEqual({ status: 'ok' });
    expect(handler).toHaveBeenCalledWith(payload, undefined);
  });

  it.each(requests)('rejects malformed %s payloads before invoking the handler', async (type) => {
    const router = new MessageRouter() as unknown as RouterAccess;
    const handler = vi.fn();
    router.handlers[type] = handler;
    expect(await dispatch(router, { type, payload: null, timestamp: 0 })).toEqual({
      status: 'error',
      error: `无效的请求参数: ${type}`,
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    null,
    undefined,
    [],
    1,
    'request',
    {},
    { type: 1, timestamp: 0 },
    { type: ActionType.SB_REQ_LIST_FOLDERS },
    { type: ActionType.SB_REQ_LIST_FOLDERS, timestamp: NaN },
    { type: ActionType.SB_REQ_LIST_FOLDERS, timestamp: Infinity },
    { type: ActionType.SB_REQ_LIST_FOLDERS, timestamp: -1 },
  ])('returns a stable error for an invalid envelope %j', async (message) => {
    const router = new MessageRouter() as unknown as RouterAccess;
    expect(await dispatch(router, message)).toEqual({ status: 'error', error: '无效的 IPC 消息' });
  });

  it.each([
    'unknown',
    '__proto__',
    'toString',
    ActionType.BG_CMD_TOGGLE_SIDEBAR,
    ActionType.BG_CMD_UPDATE_BADGE_STATE,
  ])('rejects unsupported action %s', async (type) => {
    const router = new MessageRouter() as unknown as RouterAccess;
    expect(await dispatch(router, { type, timestamp: 0 })).toEqual({
      status: 'error',
      error: `未知动作: ${type}`,
    });
  });

  it('never calls the database for a malformed destructive request', async () => {
    const remove = vi.spyOn(db, 'deleteConversations');
    const router = new MessageRouter() as unknown as RouterAccess;
    try {
      expect(
        await dispatch(router, {
          type: ActionType.SB_REQ_BATCH_DELETE_CONVERSATIONS,
          payload: { conversationIds: ['valid', ''] },
          timestamp: 0,
        })
      ).toMatchObject({ status: 'error' });
      expect(remove).not.toHaveBeenCalled();
    } finally {
      remove.mockRestore();
    }
  });

  it('converts an asynchronous failure from a real database handler to an IPC error', async () => {
    const query = vi
      .spyOn(db, 'getConversation')
      .mockRejectedValue(new Error('database unavailable'));
    try {
      const router = new MessageRouter() as unknown as RouterAccess;
      expect(
        await dispatch(router, {
          type: ActionType.CS_REQ_QUERY_CONVERSATION,
          payload: { conversationId: 'conv_1' },
          timestamp: 0,
        })
      ).toEqual({ status: 'error', error: 'database unavailable' });
      expect(query).toHaveBeenCalledWith('conv_1');
    } finally {
      query.mockRestore();
    }
  });
});

describe('MessageRouter', () => {
  it('does not keep the deprecated sidepanel open action', () => {
    expect(ActionType).not.toHaveProperty('CS_REQ_OPEN_SIDEPANEL');
  });

  it('returns an error response when a handler throws synchronously', async () => {
    const router = new MessageRouter() as unknown as {
      handlers: Record<ActionType, () => Promise<unknown> | unknown>;
      dispatch: (
        message: { type: ActionType; timestamp: number; payload?: unknown },
        senderTabId: number | undefined,
        sendResponse: (response: unknown) => void
      ) => void;
    };

    router.handlers[ActionType.SB_REQ_GET_CONVERSATION] = () => {
      throw new Error('boom');
    };

    const sendResponse = vi.fn();

    router.dispatch(
      {
        type: ActionType.SB_REQ_GET_CONVERSATION,
        payload: { conversationId: 'conv_1' },
        timestamp: Date.now(),
      },
      undefined,
      sendResponse
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendResponse).toHaveBeenCalledWith({
      status: 'error',
      error: 'boom',
    });
  });
});
