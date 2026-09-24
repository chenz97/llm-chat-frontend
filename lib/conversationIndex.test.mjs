import assert from 'node:assert/strict';
import test from 'node:test';
import { indexConversation, matchesConversationIndex, summarizeConversation } from './conversationIndex.ts';

test('conversation index preserves full text search without copying media or diagnostics', () => {
  const conversation = {
    id: 'one', title: 'Project ALPHA', apiConfigId: 'provider', createdAt: 1, updatedAt: 2,
    messages: [{ id: 'm', role: 'assistant', timestamp: 1, content: '你好 world',
      rawResponse: 'diagnostic-only', imageUrls: ['image-only'], audioRecords: [{ data: 'audio-only' }] }],
  };
  const entry = indexConversation(conversation);
  assert.equal(matchesConversationIndex(entry, '  alpha WORLD 你好 '), true);
  assert.equal(matchesConversationIndex(entry, 'missing'), false);
  assert.equal(matchesConversationIndex(entry, 'audio-only'), false);
  assert.equal(matchesConversationIndex(entry, 'diagnostic-only'), false);
  assert.equal(matchesConversationIndex(entry, ''), true);
  const summary = summarizeConversation(entry);
  assert.equal(summary.id, 'one');
  assert.equal('searchText' in summary, false);
  assert.equal('messages' in summary, false);
  assert.equal(JSON.stringify(entry).includes('audio-only'), false);
});
