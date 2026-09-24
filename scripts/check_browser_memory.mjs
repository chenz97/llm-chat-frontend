// Run against an isolated Chrome profile only: this clears the target origin's database.
// Start Chrome with --headless --remote-debugging-port=9333 --user-data-dir=/tmp/llm-memory-check
// Start a production server on port 3000, then run:
// MEMORY_CHECK_ALLOW_RESET=1 node scripts/check_browser_memory.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

assert.equal(process.env.MEMORY_CHECK_ALLOW_RESET, '1', 'Set MEMORY_CHECK_ALLOW_RESET=1 only for a disposable Chrome profile');

const origin = process.env.MEMORY_CHECK_ORIGIN || 'http://localhost:3000';
const debuggingOrigin = process.env.MEMORY_CHECK_CHROME || 'http://localhost:9333';
const tabs = await (await fetch(`${debuggingOrigin}/json/list`)).json();
const tab = tabs.find(tab => tab.type === 'page');
assert.ok(tab, 'Start Chrome with an isolated temporary profile and remote debugging enabled');
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let nextId = 0;
const pending = new Map();
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (!message.id) return;
  const callback = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) callback.reject(new Error(JSON.stringify(message.error)));
  else callback.resolve(message.result);
});
function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${expression}`);
}
async function heap() {
  await send('HeapProfiler.collectGarbage');
  return (await send('Runtime.getHeapUsage')).usedSize;
}

try {
  await send('Page.enable');
  await send('Page.navigate', { url: `${origin}/favicon.ico` });
  await until(`location.origin === ${JSON.stringify(origin)} && document.readyState === 'complete'`);
  await evaluate(`(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase('llm_chat_db');
      request.onsuccess = resolve; request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Use an isolated browser profile with one tab'));
    });
    localStorage.clear();
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('llm_chat_db', 3);
      request.onupgradeneeded = () => {
        for (const name of ['conversations', 'api_configs', 'assistant_presets']) {
          request.result.createObjectStore(name, { keyPath: 'id' });
        }
        request.result.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    for (let i = 0; i < 32; i++) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('conversations', 'readwrite');
        const payload = String.fromCharCode(65 + i % 26).repeat(2 * 1024 * 1024);
        tx.objectStore('conversations').put({ id: 'history-' + i, title: 'History ' + i,
          apiConfigId: 'test-provider', createdAt: i, updatedAt: i,
          messages: [{ id: 'm-' + i, role: 'assistant', content: 'needle-' + i,
            rawResponse: payload, timestamp: i,
            audioRecords: [{ id: 'audio-' + i, role: 'assistant', format: 'pcm16', mimeType: 'audio/pcm', data: payload, createdAt: i }] }] });
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['api_configs', 'meta', 'conversations'], 'readwrite');
      tx.objectStore('api_configs').put({ id: 'test-provider', name: 'Test Provider', baseUrl: 'http://invalid.test', apiKey: 'synthetic', models: ['test'], createdAt: 1 });
      tx.objectStore('meta').put({ key: 'current_conversation_id', value: 'history-31' });
      tx.objectStore('conversations').put({ id: 'long', title: 'Long conversation', apiConfigId: 'test-provider', createdAt: 100, updatedAt: 100,
        messages: Array.from({ length: 100 }, (_, i) => ({ id: 'long-' + i, role: i % 2 ? 'assistant' : 'user', content: 'Message ' + i, timestamp: i })) });
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  })()`);

  // Execute the actual storage implementation in Chrome, including its schema upgrade.
  let source = '';
  for (const file of ['lib/conversationIndex.ts', 'lib/storage.ts']) {
    source += ts.transpileModule(await readFile(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText.replace(/^import .*?;\s*$/gm, '').replace(/^export /gm, '') + '\n';
  }
  await evaluate(`window.storageCheck = (() => { ${source}\n return { getConversationSummaries, getConversation, getConversations, saveConversation, updateConversationMessages, deleteConversation }; })(); true`);
  const summaries = await evaluate('storageCheck.getConversationSummaries()');
  assert.equal(summaries.length, 33);
  assert.ok(summaries.every(summary => !('messages' in summary) && !('searchText' in summary)));
  assert.equal((await evaluate("storageCheck.getConversationSummaries('HISTORY NEEDLE-31')")).length, 1);
  assert.equal(await evaluate("(async () => (await storageCheck.getConversation('history-31')).messages[0].audioRecords[0].data.length)()"), 2 * 1024 * 1024);

  const baseline = await heap();
  await evaluate('storageCheck.getConversations().then(value => { window.retainedHistory = value; })');
  const fullHistory = await heap();
  await evaluate('window.retainedHistory = null');
  await heap();
  await evaluate('storageCheck.getConversationSummaries().then(value => { window.retainedSummaries = value; })');
  const indexedHistory = await heap();

  const writes = await evaluate(`(async () => {
    const conversation = { id: 'write-check', title: 'Original', apiConfigId: 'test-provider', messages: [], createdAt: 1, updatedAt: 1 };
    if (!await storageCheck.saveConversation(conversation)) return false;
    await storageCheck.updateConversationMessages(conversation.id, [{ id: 'm', role: 'user', content: 'Updated searchable text', timestamp: 1 }]);
    if ((await storageCheck.getConversationSummaries('updated searchable')).length !== 1) return false;
    await storageCheck.deleteConversation(conversation.id);
    return (await storageCheck.getConversationSummaries('updated searchable')).length === 0;
  })()`);
  assert.equal(writes, true);

  await send('Page.navigate', { url: origin });
  await until("document.querySelector('input[aria-label=\"Search conversations\"]') && document.body.innerText.includes('Long conversation')");
  assert.equal(await evaluate("performance.getEntriesByType('resource').some(entry => entry.name.includes('/vad/'))"), false);
  const startupHeap = await heap();
  await evaluate("[...document.querySelectorAll('div.truncate')].find(element => element.textContent === 'Long conversation').click()");
  await until("document.querySelectorAll('.message-row').length === 40");
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent.includes('查看更早')).click()");
  await until("document.querySelectorAll('.message-row').length === 80");
  await evaluate(`(() => {
    const input = document.querySelector('input[aria-label="Search conversations"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'needle-31');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await until("[...document.querySelectorAll('div.truncate')].filter(element => /^History [0-9]+$/.test(element.textContent)).length === 1");
  // Exercise component cleanup without an audio device or actual sound output.
  await evaluate(`(() => {
    window.playbackUrls = new Set();
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); playbackUrls.add(url); return url; };
    URL.revokeObjectURL = url => { playbackUrls.delete(url); revoke(url); };
    const NativeAudio = window.Audio;
    window.Audio = function(src) {
      const audio = new NativeAudio(src);
      window.lastPlaybackAudio = audio;
      audio.play = () => Promise.resolve();
      return audio;
    };
    [...document.querySelectorAll('div.truncate')].find(element => element.textContent === 'History 31').click();
  })()`);
  await until("!!document.querySelector('button[aria-label=\"播放音频\"]')");
  await evaluate("document.querySelector('button[aria-label=\"播放音频\"]').click()");
  assert.equal(await evaluate('playbackUrls.size'), 1);
  await evaluate("lastPlaybackAudio.dispatchEvent(new Event('ended'))");
  assert.equal(await evaluate('playbackUrls.size'), 0);
  assert.equal(await evaluate("lastPlaybackAudio.hasAttribute('src')"), false);
  await until("!!document.querySelector('button[aria-label=\"播放音频\"]')");
  await evaluate("document.querySelector('button[aria-label=\"播放音频\"]').click()");
  assert.equal(await evaluate('playbackUrls.size'), 1);
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'New Chat').click()");
  await until('playbackUrls.size === 0');
  console.log(JSON.stringify({
    passed: ['v3 to v4 migration', 'original audio preserved', 'metadata only', 'title and content search', 'partial write index update', 'atomic deletion', 'startup without VAD assets', '40 then 80 rendered messages', 'sidebar search', 'playback URL and source release on end and unmount'],
    syntheticConversations: 33,
    mediaAndRawPayloadMiB: 128,
    retainedHeapMiB: {
      baseline: +(baseline / 1048576).toFixed(2),
      fullHistoryRead: +(fullHistory / 1048576).toFixed(2),
      summaryRead: +(indexedHistory / 1048576).toFixed(2),
      productionStartup: +(startupHeap / 1048576).toFixed(2),
    },
  }, null, 2));
} finally {
  socket.close();
}
