import assert from 'node:assert/strict';
import test from 'node:test';

import { finishWebSearchCalls, updateWebSearchCalls } from './webSearchActivity.ts';

test('search progress and output items merge into one saved call', () => {
  const started = updateWebSearchCalls([], {
    type: 'response.web_search_call.in_progress', item_id: 'ws-1', output_index: 0,
  });
  const searching = updateWebSearchCalls(started, {
    type: 'response.web_search_call.searching', item_id: 'ws-1', output_index: 0,
  });
  assert.equal(started[0].status, 'in_progress');
  assert.equal(searching[0].status, 'searching');
  const completed = updateWebSearchCalls(searching, {
    type: 'response.output_item.done',
    item: { id: 'ws-1', type: 'web_search_call', status: 'completed', action: {
      type: 'search', query: ' latest news ', queries: ['latest news', 'today', null],
    } },
  });
  assert.deepEqual(completed, [{
    id: 'ws-1', status: 'completed', action: 'search', queries: ['latest news', 'today'],
  }]);
  assert.equal(updateWebSearchCalls(completed, {
    type: 'response.web_search_call.completed', item_id: 'ws-1',
  }), completed);
  assert.equal(updateWebSearchCalls(completed, {
    type: 'response.web_search_call.searching', item_id: 'ws-1',
  }), completed);
});

test('final response output restores search, page reading, and find actions', () => {
  const calls = updateWebSearchCalls([], { type: 'response.completed', response: { output: [
    { id: 'ws-1', type: 'web_search_call', status: 'completed', action: { type: 'search', queries: ['query'] } },
    { id: 'ws-2', type: 'web_search_call', status: 'completed', action: { type: 'open_page', url: 'https://example.com' } },
    { id: 'ws-3', type: 'web_search_call', status: 'failed', action: { type: 'find_in_page', url: 'https://example.com', pattern: 'launch' } },
    { id: 'reasoning-1', type: 'reasoning' },
  ] } });
  assert.deepEqual(calls.map((call) => [call.id, call.status, call.action]), [
    ['ws-1', 'completed', 'search'], ['ws-2', 'completed', 'open_page'], ['ws-3', 'failed', 'find_in_page'],
  ]);
  assert.equal(calls[1].url, 'https://example.com');
  assert.equal(calls[2].pattern, 'launch');
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), calls);
});

test('stopped, failed, and incomplete responses settle active searches without changing completed calls', () => {
  const calls = [{ id: 'ws-1', status: 'searching' }, { id: 'ws-2', status: 'completed' }];
  for (const status of ['stopped', 'failed', 'incomplete']) {
    assert.deepEqual(finishWebSearchCalls(calls, status).map((call) => call.status), [status, 'completed']);
  }
  assert.equal(calls[0].status, 'searching');
  for (const type of ['response.completed', 'response.incomplete', 'response.failed']) {
    const updated = updateWebSearchCalls(calls, { type, response: {} });
    assert.equal(updated[0].status, type === 'response.failed' ? 'failed' : 'incomplete');
    assert.equal(updated[1].status, 'completed');
  }
});

test('ordinary answers, malformed events, and other tool calls do not create search activity', () => {
  const calls = [];
  for (const event of [
    null,
    { type: 'response.output_text.delta', delta: 'I will search the web.' },
    { type: 'response.web_search_call.searching' },
    { type: 'response.web_search_call.searching', item_id: '' },
    { type: 'response.output_item.added', item: { id: 'file-1', type: 'file_search_call' } },
    { type: 'response.completed', response: { output: [{ type: 'message', content: [] }] } },
  ]) assert.equal(updateWebSearchCalls(calls, event), calls);
});
