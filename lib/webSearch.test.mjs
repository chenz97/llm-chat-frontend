import assert from 'node:assert/strict';
import test from 'node:test';

import { withWebSearch } from './webSearch.ts';

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
    assert.deepEqual(withWebSearch(request, { ...options, baseUrl }), {
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
    assert.equal(withWebSearch(request, { ...options, ...override }), request);
  }
});

test('web search silently skips third-party, malformed, and non-Responses URLs', () => {
  const request = { model: 'test-model', input: [] };
  for (const baseUrl of [
    '',
    'not a URL',
    '/v1',
    'https://api.openai.com.example.com/v1',
    'https://api.openai.com@proxy.example/v1',
    'http://api.openai.com/v1',
    'https://api.openai.com:8443/v1',
    'https://api.openai.com/v1/chat/completions',
    'https://api.openai.com/custom',
    'https://api.openai.com/v1?redirect=other',
    'https://api.openai.com/v1#other',
    'https://openrouter.ai/api/v1/chat/completions',
    'https://openrouter.ai/v1',
    'http://openrouter.ai/api/v1',
    'https://openrouter.ai:8443/api/v1',
    'https://openrouter.ai.example.com/api/v1',
    'https://openrouter.ai@proxy.example/api/v1',
    'https://user:password@openrouter.ai/api/v1',
    'https://openrouter.ai/api/v1?redirect=other',
    'https://openrouter.ai/api/v1#other',
  ]) {
    assert.equal(withWebSearch(request, { ...options, baseUrl }), request, baseUrl);
  }
});

test('web search preserves custom tools and existing search configuration without duplicates', () => {
  const functionTool = { type: 'function', name: 'lookup', parameters: {} };
  const request = { tools: [functionTool] };
  assert.deepEqual(withWebSearch(request, options).tools, [functionTool, { type: 'web_search' }]);
  assert.deepEqual(request.tools, [functionTool]);

  for (const type of ['web_search', 'web_search_preview', 'web_search_preview_2025_03_11']) {
    const configured = { tools: [functionTool, { type, search_context_size: 'high' }] };
    assert.equal(withWebSearch(configured, options), configured);
  }
});

test('web search uses the OpenRouter server tool on official Responses URLs', () => {
  const request = { model: 'openai/gpt-5.2', input: [] };
  for (const baseUrl of [
    'https://openrouter.ai/api/v1',
    'https://openrouter.ai/api/v1/',
    'https://openrouter.ai/api/v1/responses',
    'https://openrouter.ai/api/v1/responses/',
  ]) {
    assert.deepEqual(withWebSearch(request, { ...options, baseUrl }), {
      ...request,
      tools: [{ type: 'openrouter:web_search' }],
    });
  }
  assert.equal('tools' in request, false);
});

test('OpenRouter search follows the same preset and Responses API gates as OpenAI', () => {
  const request = { model: 'openai/gpt-5.2', input: [] };
  for (const override of [
    { enabled: false },
    { enabled: undefined },
    { enabled: 'true' },
    { requestApi: 'chat_completions' },
    { requestApi: undefined },
  ]) {
    assert.equal(withWebSearch(request, {
      ...options, baseUrl: 'https://openrouter.ai/api/v1', ...override,
    }), request);
  }
});

test('OpenRouter preserves configured search parameters and other tools without duplicates', () => {
  const openRouterOptions = { ...options, baseUrl: 'https://openrouter.ai/api/v1' };
  const otherTool = { type: 'openrouter:datetime' };
  const request = { tools: [otherTool], max_tool_calls: 5 };
  const prepared = withWebSearch(request, openRouterOptions);
  assert.deepEqual(prepared, {
    ...request, tools: [otherTool, { type: 'openrouter:web_search' }],
  });
  assert.deepEqual(request.tools, [otherTool]);
  assert.equal(withWebSearch(prepared, openRouterOptions), prepared);

  const configured = {
    ...request,
    tools: [otherTool, {
      type: 'openrouter:web_search',
      parameters: {
        engine: 'exa', max_results: 3, max_total_results: 10,
        search_context_size: 'medium', allowed_domains: ['example.com'],
      },
    }],
  };
  assert.equal(withWebSearch(configured, openRouterOptions), configured);
});
