import assert from 'node:assert/strict';
import test from 'node:test';

import { withOpenAIWebSearch } from './webSearch.ts';

const options = {
  baseUrl: 'https://api.openai.com/v1',
  requestApi: 'responses',
  enabled: true,
};

test('web search is available on official OpenAI Responses URLs', () => {
  const request = { model: 'test-model', input: [] };
  for (const baseUrl of [
    'https://api.openai.com/v1',
    'https://api.openai.com/v1/',
    'https://api.openai.com/v1/responses',
    'https://api.openai.com/v1/responses/',
  ]) {
    assert.deepEqual(withOpenAIWebSearch(request, { ...options, baseUrl }), {
      ...request,
      tools: [{ type: 'web_search' }],
    });
  }
  assert.equal('tools' in request, false);
});

test('web search silently leaves requests unchanged when disabled or using Chat Completions', () => {
  const request = { model: 'test-model', messages: [], tools: [{ type: 'function' }] };
  for (const override of [
    { enabled: false },
    { enabled: undefined },
    { requestApi: 'chat_completions' },
    { requestApi: undefined },
  ]) {
    assert.equal(withOpenAIWebSearch(request, { ...options, ...override }), request);
  }
});

test('web search silently skips third-party, malformed, and non-Responses URLs', () => {
  const request = { model: 'test-model', input: [] };
  for (const baseUrl of [
    '',
    'not a URL',
    '/v1',
    'https://openrouter.ai/api/v1',
    'https://api.openai.com.example.com/v1',
    'https://api.openai.com@proxy.example/v1',
    'http://api.openai.com/v1',
    'https://api.openai.com:8443/v1',
    'https://api.openai.com/v1/chat/completions',
    'https://api.openai.com/custom',
    'https://api.openai.com/v1?redirect=other',
    'https://api.openai.com/v1#other',
  ]) {
    assert.equal(withOpenAIWebSearch(request, { ...options, baseUrl }), request, baseUrl);
  }
});

test('web search preserves custom tools and existing search configuration without duplicates', () => {
  const functionTool = { type: 'function', name: 'lookup', parameters: {} };
  const request = { tools: [functionTool] };
  assert.deepEqual(withOpenAIWebSearch(request, options).tools, [functionTool, { type: 'web_search' }]);
  assert.deepEqual(request.tools, [functionTool]);

  for (const type of ['web_search', 'web_search_preview', 'web_search_preview_2025_03_11']) {
    const configured = { tools: [functionTool, { type, search_context_size: 'high' }] };
    assert.equal(withOpenAIWebSearch(configured, options), configured);
  }
});
