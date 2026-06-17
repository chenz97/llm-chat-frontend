import assert from 'node:assert/strict';
import test from 'node:test';

import { parseChatDeepLinkAction } from './chatDeepLink.ts';

test('parseChatDeepLinkAction fills prompt from search params without autosend by default', () => {
  assert.deepEqual(
    parseChatDeepLinkAction('https://chat.example.com/?prompt=hello%20world'),
    { prompt: 'hello world', autoSend: false }
  );
});

test('parseChatDeepLinkAction enables autosend only for autoSend=1', () => {
  assert.deepEqual(
    parseChatDeepLinkAction('https://chat.example.com/?prompt=hello&autoSend=1'),
    { prompt: 'hello', autoSend: true }
  );
  assert.deepEqual(
    parseChatDeepLinkAction('https://chat.example.com/?prompt=hello&autoSend=true'),
    { prompt: 'hello', autoSend: false }
  );
});

test('parseChatDeepLinkAction reads hash params when search params are absent', () => {
  assert.deepEqual(
    parseChatDeepLinkAction('https://chat.example.com/#prompt=hash%20prompt&autoSend=1'),
    { prompt: 'hash prompt', autoSend: true }
  );
});

test('parseChatDeepLinkAction prefers search params over hash params', () => {
  assert.deepEqual(
    parseChatDeepLinkAction('https://chat.example.com/?prompt=search#prompt=hash&autoSend=1'),
    { prompt: 'search', autoSend: false }
  );
});

test('parseChatDeepLinkAction ignores empty prompts and invalid urls', () => {
  assert.equal(parseChatDeepLinkAction('https://chat.example.com/?prompt=%20%20'), null);
  assert.equal(parseChatDeepLinkAction('not a url'), null);
});
