import assert from 'node:assert/strict';
import test from 'node:test';

import { streamChatCompletion } from './api.ts';
import { buildResponsesRequest } from './responsesRequest.ts';

const firstUser = {
  id: 'user-1', role: 'user', content: 'Remember the name Maple.', timestamp: 1,
  imageUrls: ['data:image/png;base64,AA==', 'data:image/png;base64,AQ=='],
};
const assistant = {
  id: 'assistant-1', role: 'assistant', content: 'I will remember Maple.', timestamp: 2,
  responseId: 'gen-123',
};
const followUp = {
  id: 'user-2', role: 'user', content: 'What name did I give you?', timestamp: 3,
};
const failed = {
  id: 'failed', role: 'assistant', content: '', timestamp: 4, streamState: 'error',
};
const retry = {
  id: 'user-3', role: 'user', content: 'Please try again.', timestamp: 5,
};
const firstInput = {
  role: 'user',
  content: [
    { type: 'input_text', text: firstUser.content },
    ...firstUser.imageUrls.map(image_url => ({ type: 'input_image', image_url })),
  ],
};
const assistantOutput = {
  type: 'message', role: 'assistant', id: 'msg_assistant-1', status: 'completed',
  content: [{ type: 'output_text', text: assistant.content, annotations: [] }],
};
const assistantInput = { role: 'assistant', content: assistant.content };
const followUpInput = { role: 'user', content: followUp.content };
const retryInput = { role: 'user', content: retry.content };
const options = {
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-sonnet-4',
  systemPrompt: 'Answer briefly.',
  parameters: { temperature: 0.5 },
};

test('OpenRouter Responses replay earlier messages and images even when a response ID was saved', () => {
  for (const baseUrl of [options.baseUrl, ' https://openrouter.ai/api/v1/responses/ ']) {
    assert.deepEqual(buildResponsesRequest({ ...options, baseUrl, messages: [firstUser] }), {
      model: options.model,
      instructions: options.systemPrompt,
      temperature: 0.5,
      input: [firstInput],
    });

    const parameters = {
      ...options.parameters,
      input: 'Preset input',
      previous_response_id: 'configured-id',
      store: true,
    };
    assert.deepEqual(buildResponsesRequest({
      ...options, baseUrl, parameters, messages: [firstUser, assistant, followUp],
    }), {
      model: options.model,
      instructions: options.systemPrompt,
      temperature: 0.5,
      input: [firstInput, assistantOutput, followUpInput],
    });
    assert.equal(parameters.previous_response_id, 'configured-id');
  }
});

test('OpenRouter resumes saved conversations with empty assistant errors', () => {
  assert.deepEqual(buildResponsesRequest({
    ...options, messages: [firstUser, assistant, followUp, failed, retry],
  }).input, [firstInput, assistantOutput, followUpInput, retryInput]);
});

test('OpenAI and other Responses endpoints continue from the latest assistant response ID', () => {
  for (const baseUrl of ['https://api.openai.com/v1', 'https://provider.example/v1']) {
    const request = buildResponsesRequest({
      ...options, baseUrl, messages: [firstUser, assistant, followUp],
    });
    assert.equal(request.previous_response_id, assistant.responseId);
    assert.deepEqual(request.input, [followUpInput]);
  }
});

test('Responses history is replayed when the latest assistant turn has no response ID', () => {
  const legacyReply = { ...assistant, id: 'assistant-2', responseId: undefined };
  const request = buildResponsesRequest({
    ...options,
    baseUrl: 'https://api.openai.com/v1',
    messages: [firstUser, assistant, followUp, legacyReply, retry],
  });

  assert.equal('previous_response_id' in request, false);
  assert.deepEqual(request.input, [firstInput, assistantInput, followUpInput, assistantInput, retryInput]);
});

test('A proxy can replay history from a conversation ending in a saved empty response', () => {
  const request = buildResponsesRequest({
    ...options,
    baseUrl: 'https://gateway.example/v1',
    messages: [firstUser, assistant, followUp, failed, retry],
  });

  assert.equal('previous_response_id' in request, false);
  assert.deepEqual(request.input, [firstInput, assistantInput, followUpInput, retryInput]);
});

for (const useVercelServerProxy of [false, true]) {
  const transport = useVercelServerProxy ? 'server proxy' : 'direct request';
  test(`Responses replays history after a proxy rejects the previous response ID via ${transport}`, async (t) => {
    const requestOptions = {
      ...options, baseUrl: 'https://gateway.example/v1', messages: [firstUser, assistant, followUp],
    };
    const sent = [];
    const endpoint = useVercelServerProxy
      ? '/api/chat/completions'
      : `${requestOptions.baseUrl}/responses`;

    t.mock.method(globalThis, 'fetch', async (url, init) => {
      assert.equal(url, endpoint);
      const body = JSON.parse(init.body);
      const request = useVercelServerProxy ? body.request : body;
      sent.push(request);
      if (request.previous_response_id) {
        const message = useVercelServerProxy
          ? "Parameter 'previous_response_id' is not supported."
          : 'previous_response_id is not supported on this proxy.';
        return new Response(JSON.stringify({
          error: { code: 'invalid_prompt', message },
        }), { status: 400 });
      }
      return new Response('data: {"type":"response.output_text.delta","delta":"Maple"}\n\ndata: [DONE]\n\n');
    });

    const chunks = [];
    let completed = false;
    await streamChatCompletion(requestOptions.baseUrl, 'test-key', buildResponsesRequest(requestOptions), {
      onMessage: (chunk) => chunks.push(chunk),
      onError: (error) => { throw error; },
      onComplete: () => { completed = true; },
    }, {
      requestApi: 'responses',
      useVercelServerProxy,
      buildStatelessResponsesRequest: () => buildResponsesRequest({ ...requestOptions, replayHistory: true }),
    });

    assert.equal(sent.length, 2);
    assert.equal(sent[0].previous_response_id, assistant.responseId);
    assert.equal('previous_response_id' in sent[1], false);
    assert.deepEqual(sent[1].input, [firstInput, assistantOutput, followUpInput]);
    assert.equal(sent[1].stream, true);
    assert.deepEqual(chunks, ['Maple']);
    assert.equal(completed, true);
  });
}

test('Responses reports other HTTP 400 errors without retrying', async (t) => {
  const baseUrl = 'https://provider.example/v1';
  const request = buildResponsesRequest({ ...options, baseUrl, messages: [firstUser, assistant, followUp] });
  const send = t.mock.method(globalThis, 'fetch', async () => new Response('Invalid max_output_tokens', { status: 400 }));
  const onError = t.mock.fn();
  const buildStatelessResponsesRequest = t.mock.fn();

  await streamChatCompletion(baseUrl, 'test-key', request, {
    onMessage: () => {},
    onError,
    onComplete: () => assert.fail('Expected an HTTP error'),
  }, { requestApi: 'responses', buildStatelessResponsesRequest });

  assert.equal(send.mock.callCount(), 1);
  assert.equal(buildStatelessResponsesRequest.mock.callCount(), 0);
  assert.equal(onError.mock.callCount(), 1);
  assert.match(onError.mock.calls[0].arguments[0].message, /400 Invalid max_output_tokens/);
});
