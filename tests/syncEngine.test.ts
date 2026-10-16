import { describe, expect, it } from 'vitest';
import { SyncEngine } from '@/background/syncEngine';
import type { Message, RawMessage } from '@/types';

// 旧算法单测需要访问私有方法；仅在此测试边界声明实际调用的两个签名。
interface EngineAlgorithms {
  findAnchor(
    current: RawMessage[],
    stored: Message[]
  ): {
    found: boolean;
    storedPosition: number;
    matchSize: number;
  };
  diffMessages(
    current: RawMessage[],
    stored: Message[],
    conversationId: string
  ): {
    toUpsert: Message[];
    toDeleteIds: string[];
  };
}
function inspectAlgorithms(): EngineAlgorithms {
  return new SyncEngine() as unknown as EngineAlgorithms;
}

function makeRaw(sender: 'user' | 'assistant', content: string, position: number): RawMessage {
  return {
    hashId: `${sender}_${position}`,
    sender,
    content,
    position,
  };
}

function makeMessage(
  sender: 'user' | 'assistant',
  content: string,
  position: number,
  conversationId = 'conv_1'
): Message {
  const now = new Date().toISOString();
  return {
    id: `msg_${conversationId}_${sender}_position_${position}`,
    conversationId,
    sender,
    content,
    createdAt: now,
    updatedAt: now,
    metadata: {
      position,
      wordCount: content.length,
    },
  };
}

describe('SyncEngine.findAnchor', () => {
  it('finds anchor with largest possible window and correct stored position', () => {
    const engine = inspectAlgorithms();

    const currentRaw: RawMessage[] = [
      makeRaw('user', 'A', 0),
      makeRaw('assistant', 'B', 1),
      makeRaw('user', 'C', 2),
      makeRaw('assistant', 'D', 3),
      makeRaw('user', 'E', 4),
      makeRaw('assistant', 'F', 5),
    ];

    const storedMessages: Message[] = [
      makeMessage('user', 'X', 0),
      makeMessage('assistant', 'Y', 1),
      makeMessage('user', 'A', 2),
      makeMessage('assistant', 'B', 3),
      makeMessage('user', 'C', 4),
      makeMessage('assistant', 'D', 5),
    ];

    const result = engine.findAnchor(currentRaw, storedMessages);

    expect(result).toEqual({
      found: true,
      storedPosition: 2,
      matchSize: 4,
    });
  });

  it('returns not found when no fingerprints match', () => {
    const engine = inspectAlgorithms();

    const currentRaw: RawMessage[] = [makeRaw('user', 'Q1', 0), makeRaw('assistant', 'A1', 1)];

    const storedMessages: Message[] = [
      makeMessage('user', 'X1', 0),
      makeMessage('assistant', 'Y1', 1),
    ];

    const result = engine.findAnchor(currentRaw, storedMessages);

    expect(result).toEqual({
      found: false,
      storedPosition: 0,
      matchSize: 0,
    });
  });
});

describe('SyncEngine.diffMessages', () => {
  it('creates upserts for new and changed messages, and marks removed ones for delete', () => {
    const engine = inspectAlgorithms();

    const operationZone: Message[] = [
      makeMessage('user', 'old user 0', 0),
      makeMessage('assistant', 'old assistant 1', 1),
      makeMessage('user', 'will be deleted', 2),
    ];

    const correctedRaw: RawMessage[] = [
      makeRaw('user', 'old user 0', 0),
      makeRaw('assistant', 'new assistant 1', 1),
      makeRaw('assistant', 'brand new 3', 3),
    ];

    const result = engine.diffMessages(correctedRaw, operationZone, 'conv_1');

    expect(result.toUpsert).toHaveLength(2);
    expect(
      result.toUpsert.some(
        (m: Message) => m.metadata.position === 1 && m.content === 'new assistant 1'
      )
    ).toBe(true);
    expect(
      result.toUpsert.some((m: Message) => m.metadata.position === 3 && m.content === 'brand new 3')
    ).toBe(true);

    expect(result.toDeleteIds).toEqual([operationZone[2].id]);
  });
});
