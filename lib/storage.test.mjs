import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { indexConversation } from './conversationIndex.ts';

let storage;
let sequence = 0;

const original = {
  id: 'history',
  title: 'Original title',
  apiConfigId: 'provider',
  assistantPresetId: 'preset',
  modelIdOverride: 'model',
  messages: [{
    id: 'message', role: 'user', content: 'Searchable message', timestamp: 10,
    imageUrls: ['data:image/png;base64,image'],
    audioRecords: [{ id: 'audio', role: 'user', data: 'audio', createdAt: 10 }],
    rawResponse: 'raw response',
  }],
  createdAt: 10,
  updatedAt: 20,
};

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.window = { setTimeout, clearTimeout };
  storage = await import(`./storage.ts?test=${++sequence}`);
});

afterEach(() => {
  delete globalThis.window;
  delete globalThis.indexedDB;
});

async function seedDatabase(version, withIndex = version === 4) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('llm_chat_db', version);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('conversations', { keyPath: 'id' });
      if (withIndex) {
        request.result.createObjectStore('conversation_index', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction([...db.objectStoreNames], 'readwrite');
    tx.objectStore('conversations').put(original);
    if (withIndex) {
      tx.objectStore('conversation_index').put(indexConversation(original));
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

for (const version of [1, 2, 3, 4]) {
  test(`renames a v${version} conversation without losing history or metadata`, async () => {
    await seedDatabase(version);
    assert.equal((await storage.getConversation(original.id)).isTitleEdited, undefined);
    assert.equal(await storage.renameConversation(original.id, '  项目讨论  '), true);
    assert.deepEqual(await storage.getConversation(original.id), {
      ...original, title: '项目讨论', isTitleEdited: true,
    });
    const summaries = await storage.getConversationSummaries('项目讨论 searchable');
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].title, '项目讨论');
    assert.equal(summaries[0].isTitleEdited, true);
    assert.equal('messages' in summaries[0], false);
    assert.equal((await storage.getConversationSummaries('original title')).length, 0);
    assert.equal((await storage.getConversationSummary(original.id)).title, '项目讨论');
  });
}

test('a response saved from a stale snapshot preserves the most recent edited title', async () => {
  await seedDatabase(4);
  await storage.renameConversation(original.id, 'First name');
  const snapshot = await storage.getConversation(original.id);
  await storage.renameConversation(original.id, 'Latest name');
  const messages = [...original.messages, {
    id: 'reply', role: 'assistant', content: 'Completed response', timestamp: 30,
  }];
  assert.equal(await storage.saveConversation({ ...snapshot, messages }), true);
  const saved = await storage.getConversation(original.id);
  assert.equal(saved.title, 'Latest name');
  assert.equal(saved.isTitleEdited, true);
  assert.deepEqual(saved.messages, messages);
  assert.equal((await storage.getConversationSummaries('latest completed')).length, 1);

  assert.equal(await storage.saveConversation({ ...original, messages }), true);
  assert.equal((await storage.getConversation(original.id)).title, 'Latest name');
});

test('an explicitly chosen default name survives later automatic title generation', async () => {
  await seedDatabase(4);
  await storage.renameConversation(original.id, 'New Conversation');
  await storage.saveConversation({ ...original, title: 'Generated name' });
  assert.equal((await storage.getConversation(original.id)).title, 'New Conversation');
});

test('renaming and streaming message updates preserve each other', async () => {
  await seedDatabase(4);
  const messages = [{ id: 'stream', role: 'assistant', content: 'Streaming reply', timestamp: 30 }];
  const results = await Promise.all([
    storage.renameConversation(original.id, 'Renamed'),
    storage.updateConversationMessages(original.id, messages),
  ]);
  assert.deepEqual(results, [true, true]);
  assert.deepEqual(await storage.getConversation(original.id), {
    ...original, title: 'Renamed', isTitleEdited: true, messages,
  });
  assert.equal((await storage.getConversationSummaries('renamed streaming')).length, 1);
});

test('blank names and missing conversations do not change stored history', async () => {
  await seedDatabase(4);
  assert.equal(await storage.renameConversation(original.id, ' \t\n '), false);
  assert.equal(await storage.renameConversation('missing', 'Name'), false);
  assert.deepEqual(await storage.getConversations(), [original]);
  assert.equal((await storage.getConversationSummary(original.id)).title, original.title);
});

test('renaming also works with a database opened without a summary store', async () => {
  await seedDatabase(5, false);
  assert.equal(await storage.renameConversation(original.id, 'Without index'), true);
  assert.equal((await storage.getConversationSummaries('without searchable')).length, 1);
  await storage.saveConversation(original);
  assert.equal((await storage.getConversation(original.id)).title, 'Without index');
});

test('conversations without an edited title keep automatic title updates', async () => {
  await seedDatabase(4);
  assert.equal(await storage.saveConversation({ ...original, title: 'Generated title' }), true);
  assert.equal((await storage.getConversation(original.id)).title, 'Generated title');
  assert.equal((await storage.getConversationSummary(original.id)).isTitleEdited, undefined);
});

test('renaming reports failure when browser storage is unavailable', async () => {
  delete globalThis.indexedDB;
  assert.equal(await storage.renameConversation(original.id, 'Name'), false);
});
