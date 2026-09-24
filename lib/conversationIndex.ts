import type { Conversation, ConversationSummary } from '../types/index.ts';

export interface ConversationIndexEntry extends ConversationSummary {
  searchText: string;
}

export function summarizeConversation(conversation: ConversationSummary): ConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    apiConfigId: conversation.apiConfigId,
    assistantPresetId: conversation.assistantPresetId,
    modelIdOverride: conversation.modelIdOverride,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

export function indexConversation(conversation: Conversation): ConversationIndexEntry {
  return {
    ...summarizeConversation(conversation),
    searchText: [conversation.title, ...conversation.messages.map(message => message.content)]
      .join(' ').trim().toLowerCase(),
  };
}

export function matchesConversationIndex(entry: ConversationIndexEntry, query: string): boolean {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    .every(keyword => entry.searchText.includes(keyword));
}
