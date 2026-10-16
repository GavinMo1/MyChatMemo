import type { ConversationMeta } from '@/types';

export function filterConversationsByScope(
  conversations: ConversationMeta[],
  showAllConvs: boolean,
  activeFolderId: string | null
): ConversationMeta[] {
  if (showAllConvs) {
    return conversations;
  }

  if (activeFolderId === null) {
    return conversations.filter(
      (conversation) => conversation.folderId === null || conversation.folderId === undefined
    );
  }

  return conversations.filter((conversation) => conversation.folderId === activeFolderId);
}

export function buildConversationListKey(params: {
  isSearchMode: boolean;
  searchQuery: string;
  showAllConvs: boolean;
  activeFolderId: string | null;
}): string {
  const scope = params.showAllConvs ? 'all' : (params.activeFolderId ?? 'uncategorized');
  if (params.isSearchMode) {
    return `search:${params.searchQuery.trim()}:${scope}`;
  }
  return `folder:${scope}`;
}
