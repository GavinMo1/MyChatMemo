import { afterEach, describe, expect, it, vi } from 'vitest';
import Dexie, { type Table, type Transaction, type TransactionMode } from 'dexie';
import { ChatMemoryDB } from '@/background/database';
import { SyncEngine } from '@/background/syncEngine';
import { findAnchorFast } from '@/background/anchorMatcher';
import { ChatGPTAdapter } from '@/content/adapters/chatgpt';
import type { RawMessage, SyncMessagesPayload } from '@/types';

const databases: ChatMemoryDB[] = [];
let databaseCounter = 0;

async function fixture() {
  const database = new ChatMemoryDB(`sync_integration_${Date.now()}_${databaseCounter++}`);
  databases.push(database);
  await database.open();
  return { database, engine: new SyncEngine(database) };
}

function messages(...contents: string[]): RawMessage[] {
  return contents.map((content, position) => ({
    sender: position % 2 ? 'assistant' : 'user',
    content,
    position,
    hashId: '',
  }));
}

function payload(
  currentMessages: RawMessage[],
  snapshot?: 'partial' | 'complete'
): SyncMessagesPayload {
  return {
    conversationId: 'conversation',
    platform: 'chatgpt',
    title: '原始标题',
    url: 'https://chatgpt.com/c/conversation',
    currentMessages,
    snapshot,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  const pending = databases.splice(0);
  pending.forEach((database) => database.close());
  await Promise.all(
    [...new Set(pending.map((database) => database.name))].map((name) => ChatMemoryDB.delete(name))
  );
});

describe('SyncEngine public snapshot contract with IndexedDB', () => {
  it('defaults to partial and retains history absent from a DOM snapshot', async () => {
    const { database, engine } = await fixture();
    await engine.handleSync(payload(messages('A', 'B', 'C', 'D')));
    expect(await engine.handleSync(payload(messages('A', 'B')))).toEqual({
      saved: false,
      messageCount: 4,
    });
    expect((await database.getMessages('conversation')).map((message) => message.content)).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
    expect((await database.getSearchIndexRecord('conversation'))?.text).toContain('d');
  });

  it('rejects unknown partial content without changing messages, metadata or search', async () => {
    const { database, engine } = await fixture();
    await engine.handleSync(payload(messages('A', 'B')));
    const before = await Promise.all([
      database.getConversation('conversation'),
      database.getMessages('conversation'),
      database.getSearchIndexRecord('conversation'),
    ]);
    await expect(engine.handleSync(payload(messages('unrelated', 'reply')))).rejects.toThrow(
      '无法唯一定位'
    );
    expect(
      await Promise.all([
        database.getConversation('conversation'),
        database.getMessages('conversation'),
        database.getSearchIndexRecord('conversation'),
      ])
    ).toEqual(before);
  });

  it('merges a unique tail, supports streaming and appends without truncating earlier messages', async () => {
    const { database, engine } = await fixture();
    await engine.handleSync(payload(messages('A', 'B', 'C', 'partial reply')));
    await engine.handleSync(payload(messages('C', 'partial reply completed', 'E', 'F')));
    expect((await database.getMessages('conversation')).map((message) => message.content)).toEqual([
      'A',
      'B',
      'C',
      'partial reply completed',
      'E',
      'F',
    ]);
    expect((await database.getConversation('conversation'))?.stats.messageCount).toBe(6);
    expect((await database.getSearchIndexRecord('conversation'))?.text).toContain(
      'partial reply completed'
    );
  });

  it('uses real metadata positions after deletions and preserves folder and createdAt', async () => {
    const { database, engine } = await fixture();
    await engine.handleSync(payload(messages('A', 'B', 'C', 'D')));
    await database.conversations.update('conversation', {
      folderId: 'saved-folder',
      createdAt: '2020-01-01',
    });
    const stored = await database.getMessages('conversation');
    await database.deleteMessage('conversation', stored[1].id);
    await engine.handleSync(payload(messages('C', 'D', 'E')));
    expect(
      (await database.getMessages('conversation')).map((message) => [
        message.metadata.position,
        message.content,
      ])
    ).toEqual([
      [0, 'A'],
      [2, 'C'],
      [3, 'D'],
      [4, 'E'],
    ]);
    expect(await database.getConversation('conversation')).toMatchObject({
      folderId: 'saved-folder',
      createdAt: '2020-01-01',
    });
  });

  it('rejects partial snapshots whose alignment would collapse a saved position gap', async () => {
    const { database, engine } = await fixture();
    await engine.handleSync(payload(messages('A', 'B', 'C', 'D')));
    await database.deleteMessage(
      'conversation',
      (await database.getMessages('conversation'))[1].id
    );
    const before = await database.getMessages('conversation');
    await expect(engine.handleSync(payload(messages('A', 'C', 'D')))).rejects.toThrow(
      '历史位置不一致'
    );
    expect(await database.getMessages('conversation')).toEqual(before);
  });

  it('rejects repeated anchors rather than choosing the first identical conversation turn', async () => {
    const { database, engine } = await fixture();
    await engine.handleSync(payload(messages('repeat', 'reply', 'repeat', 'reply')));
    await expect(
      engine.handleSync(payload(messages('repeat', 'reply', 'new question')))
    ).rejects.toThrow('无法唯一定位');
    expect(await database.countMessages('conversation')).toBe(4);
  });

  it('does not match two messages merely because their first 100 characters agree', async () => {
    const { database, engine } = await fixture();
    const prefix = 'x'.repeat(100);
    await engine.handleSync(payload(messages(`${prefix} original`, 'answer')));
    await expect(
      engine.handleSync(payload(messages(`${prefix} different`, 'different answer')))
    ).rejects.toThrow('无法唯一定位');
    expect((await database.getMessages('conversation'))[0].content).toBe(`${prefix} original`);
  });

  it('rejects a conflicting partial edit in the middle of stored history', async () => {
    const { database, engine } = await fixture();
    await engine.handleSync(payload(messages('A', 'B', 'C', 'D')));
    await expect(engine.handleSync(payload(messages('A', 'changed B')))).rejects.toThrow(
      '历史位置不一致'
    );
    expect((await database.getMessages('conversation'))[1].content).toBe('B');
  });

  it('allows an explicit complete snapshot to replace history and removes stale roles and search text', async () => {
    const { database, engine } = await fixture();
    await engine.handleSync(payload(messages('old question', 'old answer', 'obsolete tail')));
    await database.conversations.update('conversation', {
      folderId: 'folder',
      createdAt: '2020-01-01',
    });
    const replacement = messages('replacement');
    replacement[0].sender = 'assistant';
    await engine.handleSync(payload(replacement, 'complete'));
    expect(
      (await database.getMessages('conversation')).map((message) => [
        message.sender,
        message.content,
      ])
    ).toEqual([['assistant', 'replacement']]);
    expect(await database.getConversation('conversation')).toMatchObject({
      folderId: 'folder',
      createdAt: '2020-01-01',
      stats: { messageCount: 1 },
    });
    expect((await database.getSearchIndexRecord('conversation'))?.text).not.toContain('obsolete');
  });

  it('preserves existing metadata when a conversation has no messages left', async () => {
    const { database, engine } = await fixture();
    await engine.handleSync(payload(messages('original')));
    await database.conversations.update('conversation', {
      folderId: 'folder',
      createdAt: '2020-01-01',
    });
    await database.deleteMessage(
      'conversation',
      (await database.getMessages('conversation'))[0].id
    );
    await engine.handleSync(payload(messages('new content')));
    expect(await database.getConversation('conversation')).toMatchObject({
      folderId: 'folder',
      createdAt: '2020-01-01',
    });
  });

  it('rolls back initial creation completely if indexing fails and allows the next queued sync', async () => {
    const { database, engine } = await fixture();
    vi.spyOn(database.searchIndex, 'put').mockRejectedValueOnce(new Error('index failed'));
    await expect(engine.handleSync(payload(messages('A', 'B')))).rejects.toThrow('index failed');
    expect(await database.getConversation('conversation')).toBeUndefined();
    expect(await database.countMessages('conversation')).toBe(0);
    expect(await database.getSearchIndexRecord('conversation')).toBeUndefined();
    await expect(engine.handleSync(payload(messages('A', 'B')))).resolves.toEqual({
      saved: true,
      messageCount: 2,
    });
  });

  it('rolls back message updates and metadata if the final search write fails', async () => {
    const { database, engine } = await fixture();
    await engine.handleSync(payload(messages('A', 'B')));
    const before = await Promise.all([
      database.getConversation('conversation'),
      database.getMessages('conversation'),
      database.getSearchIndexRecord('conversation'),
    ]);
    vi.spyOn(database.searchIndex, 'put').mockRejectedValueOnce(new Error('index failed'));
    await expect(engine.handleSync(payload(messages('A', 'B extended', 'C')))).rejects.toThrow(
      'index failed'
    );
    expect(
      await Promise.all([
        database.getConversation('conversation'),
        database.getMessages('conversation'),
        database.getSearchIndexRecord('conversation'),
      ])
    ).toEqual(before);
  });

  it('serializes the same conversation across engine instances and database connections', async () => {
    const { database, engine } = await fixture();
    const secondDatabase = new ChatMemoryDB(database.name);
    databases.push(secondDatabase);
    await secondDatabase.open();
    const secondEngine = new SyncEngine(secondDatabase);
    const secondTransaction = vi.spyOn(secondDatabase, 'transaction');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const originalTransaction = database.transaction.bind(database);
    const delayTransaction = <T>(
      mode: TransactionMode,
      tables: Table[],
      scope: (transaction: Transaction) => PromiseLike<T> | T
    ) => {
      signalStarted();
      return Dexie.Promise.resolve(gate).then(() => originalTransaction(mode, tables, scope));
    };
    // 同步引擎只调用上述三参数 tables[] 重载；此测试边界断言适配 Dexie 的完整重载集。
    // 延迟发生在真实事务开始前，避免依赖 IndexedDB 对挂起事务的保活行为。
    vi.spyOn(database, 'transaction').mockImplementationOnce(
      delayTransaction as typeof database.transaction
    );
    const first = engine.handleSync(payload(messages('A', 'B')));
    await started;
    const second = secondEngine.handleSync(payload(messages('A', 'B', 'C', 'D')));
    await Promise.resolve();
    expect(secondTransaction).not.toHaveBeenCalled();
    release();
    await Promise.all([first, second]);
    expect((await database.getMessages('conversation')).map((message) => message.content)).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
  });

  it('treats an empty snapshot as a no-op, including when marked complete', async () => {
    const { database, engine } = await fixture();
    await engine.handleSync(payload(messages('A', 'B')));
    expect(await engine.handleSync(payload([], 'complete'))).toEqual({
      saved: false,
      messageCount: 2,
    });
    expect(await database.countMessages('conversation')).toBe(2);
  });

  it('does not truncate a newer streaming reply when an older partial snapshot arrives later', async () => {
    const { database, engine } = await fixture();
    await engine.handleSync(payload(messages('question', 'reply')));
    await engine.handleSync(payload(messages('question', 'reply continued')));
    await expect(
      new SyncEngine(database).handleSync(payload(messages('question', 'reply')))
    ).resolves.toEqual({ saved: false, messageCount: 2 });
    expect((await database.getMessages('conversation'))[1].content).toBe('reply continued');
  });

  it('rejects a different branch at the tail instead of treating it as streaming continuation', async () => {
    const { database, engine } = await fixture();
    await engine.handleSync(payload(messages('question', 'original reply')));
    await expect(
      engine.handleSync(payload(messages('question', 'different reply')))
    ).rejects.toThrow('历史位置不一致');
    expect((await database.getMessages('conversation'))[1].content).toBe('original reply');
  });

  it('syncs growing ChatGPT code DOM despite the Markdown converter closing the code fence', async () => {
    const { database, engine } = await fixture();
    document.body.innerHTML = `<main>
      <article><div data-message-author-role="user"><div class="whitespace-pre-wrap">write code</div></div></article>
      <article><div data-message-author-role="assistant"><div class="markdown prose"><pre><code class="language-python">a</code></pre></div></div></article>
    </main>`;
    const adapter = new ChatGPTAdapter();
    const older = adapter.extractMessages();
    expect(older[1].content).toBe('```python\na\n```');
    await engine.handleSync(payload(older));
    document.querySelector('code')!.textContent = 'ab\nprint(1)';
    const newer = adapter.extractMessages();
    expect(newer[1].content.startsWith(older[1].content)).toBe(false);
    await expect(engine.handleSync(payload(newer))).resolves.toEqual({
      saved: true,
      messageCount: 2,
    });
    await expect(engine.handleSync(payload(older))).resolves.toEqual({
      saved: false,
      messageCount: 2,
    });
    expect((await database.getMessages('conversation'))[1].content).toBe(newer[1].content);
    document.querySelector('code')!.textContent = 'different branch';
    await expect(engine.handleSync(payload(adapter.extractMessages()))).rejects.toThrow(
      '历史位置不一致'
    );
    expect((await database.getMessages('conversation'))[1].content).toBe(newer[1].content);
    document.body.innerHTML = '';
  });

  it.each([
    ['strong', 'a', 'ab'],
    ['em', 'a', 'ab'],
    ['del', 'a', 'ab'],
    ['code', 'a', 'ab'],
    ['code', 'a`b', 'a`bc'],
  ])(
    'syncs a growing <%s> DOM while rejecting a different body and stale formatted snapshots',
    async (tag, before, after) => {
      const { database, engine } = await fixture();
      document.body.innerHTML = `<main>
      <article><div data-message-author-role="user"><div class="whitespace-pre-wrap">format text</div></div></article>
      <article><div data-message-author-role="assistant"><div class="markdown prose"><${tag}>${before}</${tag}></div></div></article>
    </main>`;
      const adapter = new ChatGPTAdapter();
      const older = adapter.extractMessages();
      await engine.handleSync(payload(older));
      document.querySelector(tag)!.textContent = after;
      const newer = adapter.extractMessages();
      expect(newer[1].content.startsWith(older[1].content)).toBe(false);
      await expect(engine.handleSync(payload(newer))).resolves.toMatchObject({ saved: true });
      await expect(engine.handleSync(payload(older))).resolves.toMatchObject({ saved: false });
      expect((await database.getMessages('conversation'))[1].content).toBe(newer[1].content);
      document.querySelector(tag)!.textContent = 'different';
      await expect(engine.handleSync(payload(adapter.extractMessages()))).rejects.toThrow(
        '历史位置不一致'
      );
      expect((await database.getMessages('conversation'))[1].content).toBe(newer[1].content);
      document.body.innerHTML = '';
    }
  );
});

describe('message-boundary anchor matching', () => {
  it('rejects substring matches and returns real positions', () => {
    expect(
      findAnchorFast(['needle'], [{ content: 'prefix needle suffix', position: 5 }])
    ).toBeNull();
    expect(findAnchorFast(['needle'], [{ content: 'needle', position: 5 }])).toEqual({
      storedPosition: 5,
      anchorSize: 1,
    });
  });
});
