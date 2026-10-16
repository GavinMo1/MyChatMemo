import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatMemoryDB } from '@/background/database';
import type { ConversationMeta, Message } from '@/types';

function makeConversation(
  id: string,
  title: string,
  updatedAt: string,
  folderId: string | null = null,
): ConversationMeta {
  return {
    id,
    platform: 'chatgpt',
    title,
    url: `https://chatgpt.com/c/${id}`,
    folderId,
    stats: {
      messageCount: 1,
      lastSyncedAt: Date.now(),
    },
    createdAt: updatedAt,
    updatedAt,
    isArchived: false,
  };
}

function makeMessage(
  id: string,
  conversationId: string,
  content: string,
  position: number,
): Message {
  return {
    id,
    conversationId,
    sender: 'user',
    content,
    createdAt: '2026-03-26T08:00:00.000Z',
    updatedAt: '2026-03-26T08:00:00.000Z',
    metadata: {
      position,
      wordCount: content.length,
    },
  };
}

const openDatabases: ChatMemoryDB[] = [];

afterEach(async () => {
  await Promise.all(openDatabases.splice(0).map(async db => {
    db.close();
    await db.delete();
  }));
});

describe('ChatMemoryDB search index migration', () => {
  it('backfills search index records during v3 migration', async () => {
    const dbName = `ChatMemoryDB_test_migration_${Date.now()}`;
    const legacyDb = new Dexie(dbName);

    legacyDb.version(2).stores({
      conversations: 'id, platform, updatedAt, isArchived, folderId',
      messages: 'id, conversationId, sender, createdAt, [conversationId+metadata.position]',
      folders: 'id, parentId, order',
    });
    await legacyDb.open();

    await legacyDb.table('conversations').put(
      makeConversation('conv_migration', 'Alpha Search', '2026-03-26T08:00:00.000Z')
    );
    await legacyDb.table('messages').put(
      makeMessage('msg_migration', 'conv_migration', 'Beta keyword', 0)
    );

    legacyDb.close();

    const db = new ChatMemoryDB(dbName);
    openDatabases.push(db);
    await db.open();

    const record = await db.getSearchIndexRecord('conv_migration');
    expect(record).toBeDefined();
    expect(record?.text).toContain('alpha search');
    expect(record?.text).toContain('beta keyword');
  });
});

describe('ChatMemoryDB paged search', () => {
  it('returns paged results without duplicates across pages', async () => {
    const db = new ChatMemoryDB(`ChatMemoryDB_test_search_${Date.now()}`);
    openDatabases.push(db);
    await db.open();

    const conversations = [
      makeConversation('conv_1', 'Shared keyword A', '2026-03-26T10:00:00.000Z'),
      makeConversation('conv_2', 'Shared keyword B', '2026-03-26T09:00:00.000Z', 'folder_a'),
      makeConversation('conv_3', 'Shared keyword C', '2026-03-26T08:00:00.000Z', 'folder_b'),
    ];

    await db.conversations.bulkPut(conversations);
    await db.messages.bulkPut([
      makeMessage('msg_1', 'conv_1', 'keyword body 1', 0),
      makeMessage('msg_2', 'conv_2', 'keyword body 2', 0),
      makeMessage('msg_3', 'conv_3', 'keyword body 3', 0),
    ]);

    await Promise.all(conversations.map(conv => db.refreshSearchIndex(conv.id)));

    const page1 = await db.searchConversationsPaged('keyword', 0, 2, null, true);
    const page2 = await db.searchConversationsPaged('keyword', 2, 2, null, true);

    expect(page1.total).toBe(3);
    expect(page1.items.map(item => item.id)).toEqual(['conv_1', 'conv_2']);
    expect(page1.hasMore).toBe(true);
    expect(page2.items.map(item => item.id)).toEqual(['conv_3']);
    expect(page2.hasMore).toBe(false);
    expect(new Set([...page1.items, ...page2.items].map(item => item.id)).size).toBe(3);
  });

  it('respects folder filtering semantics for search', async () => {
    const db = new ChatMemoryDB(`ChatMemoryDB_test_folder_search_${Date.now()}`);
    openDatabases.push(db);
    await db.open();

    const conversations = [
      makeConversation('uncategorized', 'Search in all', '2026-03-26T10:00:00.000Z', null),
      makeConversation('folder_a_conv', 'Search in folder A', '2026-03-26T09:00:00.000Z', 'folder_a'),
      makeConversation('folder_b_conv', 'Search in folder B', '2026-03-26T08:00:00.000Z', 'folder_b'),
    ];

    await db.conversations.bulkPut(conversations);
    await db.messages.bulkPut([
      makeMessage('msg_uncategorized', 'uncategorized', 'needle', 0),
      makeMessage('msg_folder_a', 'folder_a_conv', 'needle', 0),
      makeMessage('msg_folder_b', 'folder_b_conv', 'needle', 0),
    ]);
    await Promise.all(conversations.map(conv => db.refreshSearchIndex(conv.id)));

    const allResults = await db.searchConversationsPaged('needle', 0, 10, null, true);
    const uncategorized = await db.searchConversationsPaged('needle', 0, 10, null, false);
    const folderA = await db.searchConversationsPaged('needle', 0, 10, 'folder_a', false);

    expect(allResults.items.map(item => item.id)).toEqual([
      'uncategorized',
      'folder_a_conv',
      'folder_b_conv',
    ]);
    expect(uncategorized.items.map(item => item.id)).toEqual(['uncategorized']);
    expect(folderA.items.map(item => item.id)).toEqual(['folder_a_conv']);
  });
});

describe('ChatMemoryDB deleteMessage', () => {
  it('updates message count and search index after deleting a single message', async () => {
    const db = new ChatMemoryDB(`ChatMemoryDB_test_delete_message_${Date.now()}`);
    openDatabases.push(db);
    await db.open();

    const conversation = makeConversation(
      'conv_delete_message',
      'Delete message test',
      '2026-03-26T10:00:00.000Z',
    );

    await db.conversations.put(conversation);
    await db.messages.bulkPut([
      makeMessage('msg_keep', 'conv_delete_message', 'keep this content', 0),
      makeMessage('msg_remove', 'conv_delete_message', 'remove this keyword', 1),
    ]);
    await db.refreshSearchIndex(conversation.id);

    await db.deleteMessage(conversation.id, 'msg_remove');

    const remainingMessages = await db.getMessages(conversation.id);
    const updatedConversation = await db.getConversation(conversation.id);
    const searchIndex = await db.getSearchIndexRecord(conversation.id);

    expect(remainingMessages.map(message => message.id)).toEqual(['msg_keep']);
    expect(updatedConversation?.stats.messageCount).toBe(1);
    expect(searchIndex?.text).toContain('keep this content');
    expect(searchIndex?.text).not.toContain('remove this keyword');
  });
});
