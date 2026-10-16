import { describe, expect, it } from 'vitest';
import { ActionType } from '@/shared/protocol';
import { validateBackgroundRequest } from '@/shared/protocolValidation';

const check = (type: ActionType, payload: unknown) =>
  validateBackgroundRequest({ type, payload, timestamp: 0 }).valid;
const sync = {
  conversationId: 'conv_1',
  platform: 'chatgpt',
  url: '',
  title: '',
  currentMessages: [{ hashId: '', sender: 'user', content: '', position: 0 }],
};
const search = { keyword: '', offset: 0, limit: 20, folderId: null, showAll: false };

describe('background payload validation', () => {
  it.each([undefined, 'partial', 'complete'])(
    'accepts snapshot %s, including the legacy partial default',
    (snapshot) => {
      expect(check(ActionType.CS_REQ_SYNC_MESSAGES, { ...sync, snapshot })).toBe(true);
    }
  );
  it.each(['kimi', 'chatgpt', 'claude', 'doubao', 'gemini'])(
    'accepts supported platform %s without imposing URL shapes',
    (platform) => {
      expect(
        check(ActionType.CS_REQ_SYNC_MESSAGES, {
          ...sync,
          platform,
          url: 'https://example.com/new-layout',
        })
      ).toBe(true);
    }
  );
  it('accepts an empty snapshot and ordered messages with noncontiguous positions', () => {
    expect(check(ActionType.CS_REQ_SYNC_MESSAGES, { ...sync, currentMessages: [] })).toBe(true);
    expect(
      check(ActionType.CS_REQ_SYNC_MESSAGES, {
        ...sync,
        currentMessages: [
          { ...sync.currentMessages[0], position: 3, thinking: 'analysis' },
          { ...sync.currentMessages[0], position: 5, sender: 'assistant' },
        ],
      })
    ).toBe(true);
  });
  it.each([
    { conversationId: '' },
    { conversationId: ' ' },
    { platform: 'unknown' },
    { url: 1 },
    { title: null },
    { snapshot: 'full' },
    { currentMessages: {} },
    { currentMessages: [null] },
    { platform: Object.create(null) },
    { currentMessages: Array(1) },
    { currentMessages: [{ ...sync.currentMessages[0], hashId: 1 }] },
    { currentMessages: [{ ...sync.currentMessages[0], sender: 'system' }] },
    { currentMessages: [{ ...sync.currentMessages[0], content: {} }] },
    { currentMessages: [{ ...sync.currentMessages[0], thinking: null }] },
    ...[-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map((position) => ({
      currentMessages: [{ ...sync.currentMessages[0], position }],
    })),
    { currentMessages: [sync.currentMessages[0], sync.currentMessages[0]] },
    { currentMessages: [{ ...sync.currentMessages[0], position: 2 }, sync.currentMessages[0]] },
  ])('rejects malformed sync fields %j', (changes) => {
    expect(check(ActionType.CS_REQ_SYNC_MESSAGES, { ...sync, ...changes })).toBe(false);
  });
  it.each([undefined, [], [null], [''], [' '], [123], Array(1)])(
    'rejects malformed bulk IDs %j',
    (conversationIds) => {
      expect(check(ActionType.SB_REQ_BATCH_DELETE_CONVERSATIONS, { conversationIds })).toBe(false);
      expect(check(ActionType.SB_REQ_EXPORT_CONVERSATIONS_ZIP, { conversationIds })).toBe(false);
      expect(check(ActionType.SB_REQ_MOVE_CONVERSATIONS, { conversationIds, folderId: null })).toBe(
        false
      );
    }
  );
  it.each([
    { keyword: null },
    { offset: -1 },
    { offset: 0.5 },
    { offset: NaN },
    { offset: Infinity },
    { limit: 0 },
    { limit: -1 },
    { limit: 1.5 },
    { limit: Infinity },
    { limit: Number.MAX_SAFE_INTEGER + 1 },
    { folderId: '' },
    { folderId: false },
    { showAll: 1 },
  ])('rejects invalid search fields %j', (changes) => {
    expect(check(ActionType.SB_REQ_SEARCH_CONVERSATIONS, { ...search, ...changes })).toBe(false);
  });
  it.each([
    {},
    { id: '' },
    { id: 'folder_1' },
    { id: 'folder_1', name: '' },
    { id: 'folder_1', parentId: 'folder_1' },
    { id: 'folder_1', parentId: 1 },
    { id: 'folder_1', order: -1 },
    { id: 'folder_1', order: NaN },
    { id: 'folder_1', order: 0.5 },
    { id: 'folder_1', name: 'ok', unexpectedField: 'bad' },
  ])('rejects invalid folder updates %j', (payload) => {
    expect(check(ActionType.SB_REQ_UPDATE_FOLDER, payload)).toBe(false);
  });
  it('accepts each supported folder change on its own', () => {
    for (const change of [
      { name: '新名称' },
      { order: 0 },
      { parentId: null },
      { parentId: 'parent' },
    ]) {
      expect(check(ActionType.SB_REQ_UPDATE_FOLDER, { id: 'folder_1', ...change })).toBe(true);
    }
  });
  it('checks remaining action-specific fields', () => {
    expect(check(ActionType.SB_REQ_DELETE_MESSAGE, { conversationId: 'conv', messageId: '' })).toBe(
      false
    );
    expect(
      check(ActionType.SB_REQ_EXPORT_CONVERSATIONS_ZIP, {
        conversationIds: ['conv'],
        flatten: 'yes',
      })
    ).toBe(false);
    expect(
      check(ActionType.SB_REQ_MOVE_CONVERSATIONS, { conversationIds: ['conv'], folderId: 1 })
    ).toBe(false);
    expect(check(ActionType.SB_REQ_CREATE_FOLDER, { name: '', parentId: null })).toBe(false);
    expect(check(ActionType.SB_REQ_CREATE_FOLDER, { name: 'ok', parentId: '' })).toBe(false);
    expect(check(ActionType.SB_REQ_DELETE_FOLDER, { id: ' ' })).toBe(false);
    expect(check(ActionType.SB_REQ_GET_CONVERSATION, { conversationId: [] })).toBe(false);
    expect(check(ActionType.SB_REQ_LIST_FOLDERS, {})).toBe(true);
    expect(check(ActionType.SB_REQ_LIST_CONVERSATIONS, { extra: true })).toBe(false);
  });
});
