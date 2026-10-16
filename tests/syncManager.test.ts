import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseAdapter, type SelectorConfig } from '@/content/adapters/base';
import {
  extractAndSync,
  getActivationKey,
  handleManualSave,
  hydrateActivatedConversations,
  isActivated,
  shouldAutoSync,
} from '@/content/syncManager';
import type { RawMessage } from '@/types';
import { getRouteRevision } from '@/content/routerInterceptor';

const syncMessagesMock = vi.fn();
const queryConversationMock = vi.fn();
const storageGetMock = vi.fn();
const storageSetMock = vi.fn();

vi.mock('@/browser/ipc', () => ({
  syncMessages: (...args: unknown[]) => syncMessagesMock(...args),
  queryConversation: (...args: unknown[]) => queryConversationMock(...args),
}));

class FakeAdapter extends BaseAdapter {
  readonly platform = 'gemini';
  readonly platformLabel = 'Gemini';

  constructor(
    private readonly conversationId: string | null,
    private readonly messages: RawMessage[],
    private readonly title: string | null = '测试对话'
  ) {
    super();
  }

  verifyUrl(): boolean {
    return true;
  }

  extractConversationId(): string | null {
    return this.conversationId;
  }

  extractMessages(): RawMessage[] {
    return this.messages;
  }

  getSelectors(): SelectorConfig {
    return {
      messageContainer: ['#chat-history'],
      userContent: ['user-query .query-text'],
      assistantContent: ['model-response .model-response-text'],
      title: 'title',
    };
  }

  extractTitle(): string | null {
    return this.title;
  }
}

class SlowFakeAdapter extends FakeAdapter {
  prepareCalls = 0;

  async prepareForExtraction(): Promise<void> {
    this.prepareCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function makeMessages(): RawMessage[] {
  return [
    {
      hashId: 'u_1',
      sender: 'user',
      content: '请帮我整理一下会议纪要',
      position: 0,
    },
    {
      hashId: 'a_1',
      sender: 'assistant',
      content: '这里是整理后的纪要',
      position: 1,
    },
  ];
}

beforeEach(async () => {
  history.replaceState({}, '', '/initial');
  syncMessagesMock.mockReset();
  queryConversationMock.mockReset();
  storageGetMock.mockReset();
  storageSetMock.mockReset();

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: {
        lastError: null,
      },
      storage: {
        local: {
          get: storageGetMock,
          set: storageSetMock,
        },
      },
    },
  });

  storageGetMock.mockImplementation(
    (_keys: string[], callback: (result: Record<string, unknown>) => void) => {
      callback({});
    }
  );
  storageSetMock.mockImplementation((_value: Record<string, unknown>, callback?: () => void) => {
    callback?.();
  });

  await hydrateActivatedConversations();
});

describe('extractAndSync', () => {
  it('resamples once when the final DOM update arrives while the previous snapshot IPC is pending', async () => {
    const adapter = new FakeAdapter('dirty-while-ipc', makeMessages());
    let release!: (value: { saved: boolean; messageCount: number }) => void;
    syncMessagesMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    syncMessagesMock.mockResolvedValue({ saved: true, messageCount: 4 });
    const first = extractAndSync(adapter);
    await vi.waitFor(() => expect(syncMessagesMock).toHaveBeenCalledTimes(1));
    const latestMessages = [
      ...makeMessages(),
      { hashId: 'last', sender: 'user' as const, content: 'last DOM update', position: 2 },
    ];
    vi.spyOn(adapter, 'extractMessages').mockReturnValue(latestMessages);
    const joined = extractAndSync(adapter);
    // Multiple triggers for the same pending snapshot are coalesced into one resample.
    const joinedAgain = extractAndSync(adapter);
    release({ saved: true, messageCount: 2 });
    await Promise.all([first, joined, joinedAgain]);
    expect(syncMessagesMock).toHaveBeenCalledTimes(2);
    expect(syncMessagesMock.mock.calls[1][0].currentMessages).toEqual(latestMessages);
  });

  it('does not reuse an old in-flight A snapshot after navigating A to B to A', async () => {
    const adapter = new FakeAdapter('back-to-A', makeMessages());
    let release!: (value: { saved: boolean; messageCount: number }) => void;
    syncMessagesMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    syncMessagesMock.mockResolvedValue({ saved: true, messageCount: 2 });
    const old = extractAndSync(adapter);
    await vi.waitFor(() => expect(syncMessagesMock).toHaveBeenCalledTimes(1));
    history.replaceState({}, '', '/B');
    getRouteRevision();
    history.replaceState({}, '', '/initial');
    const current = extractAndSync(adapter);
    await expect(current).resolves.toMatchObject({ status: 'success' });
    expect(syncMessagesMock).toHaveBeenCalledTimes(2);
    release({ saved: true, messageCount: 2 });
    await expect(old).resolves.toEqual({ status: 'skipped_route_changed' });
  });
  it('never submits the next route DOM under the old conversation after async preparation', async () => {
    const adapter = new FakeAdapter('old-conversation', makeMessages());
    let release!: () => void;
    vi.spyOn(adapter, 'prepareForExtraction').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const extractSpy = vi.spyOn(adapter, 'extractMessages');
    const task = extractAndSync(adapter);
    history.replaceState({}, '', '/next-conversation');
    release();
    expect(await task).toEqual({ status: 'skipped_route_changed' });
    expect(extractSpy).not.toHaveBeenCalled();
    expect(syncMessagesMock).not.toHaveBeenCalled();
  });

  it('returns adapter preparation errors as a result and clears the in-flight task', async () => {
    const adapter = new FakeAdapter('preparation-error', makeMessages());
    vi.spyOn(adapter, 'prepareForExtraction').mockRejectedValueOnce(new Error('DOM unavailable'));
    expect(await extractAndSync(adapter)).toMatchObject({ status: 'error' });
    syncMessagesMock.mockResolvedValue({ saved: true, messageCount: 2 });
    expect(await extractAndSync(adapter)).toMatchObject({ status: 'success' });
    expect(syncMessagesMock).toHaveBeenCalledWith(expect.objectContaining({ snapshot: 'partial' }));
  });
  it('returns skipped_no_messages when there is nothing to save', async () => {
    const adapter = new FakeAdapter('conv_empty', []);

    const result = await extractAndSync(adapter);

    expect(result).toEqual({ status: 'skipped_no_messages' });
    expect(syncMessagesMock).not.toHaveBeenCalled();
  });

  it('reuses the in-flight extraction for the same conversation', async () => {
    syncMessagesMock.mockResolvedValue({ saved: true, messageCount: 2 });
    const adapter = new SlowFakeAdapter('conv_concurrent', makeMessages());

    const [first, second] = await Promise.all([extractAndSync(adapter), extractAndSync(adapter)]);

    expect(first).toEqual(second);
    expect(adapter.prepareCalls).toBe(1);
    expect(syncMessagesMock).toHaveBeenCalledTimes(1);
  });
});

describe('handleManualSave', () => {
  it('restarts observation after a successful manual save of an already activated conversation', async () => {
    const adapter = new FakeAdapter('already-active', makeMessages());
    syncMessagesMock.mockResolvedValue({ saved: true, messageCount: 2 });
    const onActivated = vi.fn();
    await handleManualSave(adapter, onActivated);
    expect(isActivated('gemini', 'already-active')).toBe(true);
    await handleManualSave(adapter, onActivated);
    expect(onActivated).toHaveBeenCalledTimes(2);
    expect(storageSetMock).toHaveBeenCalledTimes(1);
  });
  it('does not activate or start observing the new route when the old IPC response arrives', async () => {
    let release!: (value: { saved: boolean; messageCount: number }) => void;
    syncMessagesMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const onActivated = vi.fn();
    const task = handleManualSave(new FakeAdapter('old-ipc', makeMessages()), onActivated);
    await vi.waitFor(() => expect(syncMessagesMock).toHaveBeenCalledTimes(1));
    history.replaceState({}, '', '/next-conversation');
    release({ saved: true, messageCount: 2 });
    expect(await task).toEqual({ status: 'skipped_route_changed' });
    expect(onActivated).not.toHaveBeenCalled();
    expect(isActivated('gemini', 'old-ipc')).toBe(false);
  });
  it('activates only after a successful first manual save', async () => {
    syncMessagesMock.mockResolvedValue({ saved: true, messageCount: 2 });
    const onActivated = vi.fn();

    const result = await handleManualSave(
      new FakeAdapter('conv_success', makeMessages()),
      onActivated
    );

    expect(result.status).toBe('success');
    expect(onActivated).toHaveBeenCalledTimes(1);
    expect(isActivated('gemini', 'conv_success')).toBe(true);
    expect(storageSetMock).toHaveBeenCalledWith(
      { 'mychatmemo:activatedConversations:v1': ['gemini:conv_success'] },
      expect.any(Function)
    );
  });

  it('does not activate when the first manual save fails', async () => {
    syncMessagesMock.mockRejectedValue(new Error('sync failed'));
    const onActivated = vi.fn();

    const result = await handleManualSave(
      new FakeAdapter('conv_error', makeMessages()),
      onActivated
    );

    expect(result.status).toBe('error');
    expect(onActivated).not.toHaveBeenCalled();
    expect(isActivated('gemini', 'conv_error')).toBe(false);
  });

  it('does not activate when the first manual save has no messages', async () => {
    const onActivated = vi.fn();

    const result = await handleManualSave(new FakeAdapter('conv_no_messages', []), onActivated);

    expect(result.status).toBe('skipped_no_messages');
    expect(onActivated).not.toHaveBeenCalled();
    expect(isActivated('gemini', 'conv_no_messages')).toBe(false);
  });

  it('still activates when sync succeeds with saved=false', async () => {
    syncMessagesMock.mockResolvedValue({ saved: false, messageCount: 2 });
    const onActivated = vi.fn();

    const result = await handleManualSave(
      new FakeAdapter('conv_saved_false', makeMessages()),
      onActivated
    );

    expect(result).toMatchObject({
      status: 'success',
      saved: false,
      messageCount: 2,
    });
    expect(onActivated).toHaveBeenCalledTimes(1);
    expect(isActivated('gemini', 'conv_saved_false')).toBe(true);
  });
});

describe('hydrateActivatedConversations', () => {
  it('filters out stale activated keys that do not exist in storage', async () => {
    storageGetMock.mockImplementationOnce(
      (_keys: string[], callback: (result: Record<string, unknown>) => void) => {
        callback({
          'mychatmemo:activatedConversations:v1': [
            'gemini:conv_valid',
            'gemini:conv_missing',
            'invalid-key',
          ],
        });
      }
    );
    queryConversationMock.mockImplementation(async (conversationId: string) => {
      if (conversationId === 'conv_valid') {
        return {
          id: 'conv_valid',
          platform: 'gemini',
          title: '有效对话',
          url: 'https://gemini.google.com/app/conv_valid',
          messages: [],
          folderId: null,
          stats: {
            messageCount: 2,
            lastSyncedAt: Date.now(),
          },
          createdAt: '2026-03-26T08:00:00.000Z',
          updatedAt: '2026-03-26T08:00:00.000Z',
          isArchived: false,
        };
      }
      return null;
    });

    await hydrateActivatedConversations();

    expect(isActivated('gemini', 'conv_valid')).toBe(true);
    expect(isActivated('gemini', 'conv_missing')).toBe(false);
    expect(storageSetMock).toHaveBeenCalledWith(
      { 'mychatmemo:activatedConversations:v1': ['gemini:conv_valid'] },
      expect.any(Function)
    );
  });
});

describe('auto sync guard', () => {
  it('does not auto sync when the current route no longer matches the observer binding', async () => {
    syncMessagesMock.mockResolvedValue({ saved: true, messageCount: 2 });
    const activatedAdapter = new FakeAdapter('conv_saved', makeMessages());

    await handleManualSave(activatedAdapter, vi.fn());
    expect(isActivated('gemini', 'conv_saved')).toBe(true);

    const nextConversationAdapter = new FakeAdapter('conv_new', makeMessages());
    const shouldSync = shouldAutoSync(
      nextConversationAdapter,
      getActivationKey('gemini', 'conv_saved')
    );

    expect(shouldSync).toBe(false);
  });

  it('only allows auto sync for the observer-bound activated conversation', async () => {
    syncMessagesMock.mockResolvedValue({ saved: true, messageCount: 2 });
    const adapter = new FakeAdapter('conv_bound', makeMessages());

    await handleManualSave(adapter, vi.fn());

    const shouldSync = shouldAutoSync(adapter, getActivationKey('gemini', 'conv_bound'));

    expect(shouldSync).toBe(true);
  });
});
