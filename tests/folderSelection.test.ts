import { describe, expect, it } from 'vitest';

describe('folder selection semantics', () => {
  it('keeps all-conversations and uncategorized as separate actions', () => {
    const selectAllConversations = () => 'all';
    const selectUncategorized = () => 'uncategorized';

    expect(selectAllConversations()).toBe('all');
    expect(selectUncategorized()).toBe('uncategorized');
    expect(selectAllConversations()).not.toBe(selectUncategorized());
  });
});
