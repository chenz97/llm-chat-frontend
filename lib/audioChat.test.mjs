import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAudioChatCompletionRequest,
  buildTextAudioChatCompletionRequest,
  extractAudioChatCompletionResponse,
  readAudioChatCompletionStream,
} from './audioChat.ts';

const userAudio = {
  id: 'audio-user-1',
  role: 'user',
  mimeType: 'audio/wav',
  format: 'wav',
  data: 'dXNlci1hdWRpbw==',
  durationMs: 1200,
  createdAt: 1710000000000,
};

const assistantAudio = {
  id: 'audio-assistant-1',
  role: 'assistant',
  mimeType: 'audio/wav',
  format: 'wav',
  data: 'YXNzaXN0YW50LWF1ZGlv',
  providerAudioId: 'audio-openai-123',
  durationMs: 1800,
  createdAt: 1710000001000,
};

const wavHeaderBase64 = 'UklGRgAAAABXQVZFZm10IA==';

test('buildAudioChatCompletionRequest sends system prompt, user audio history, current audio, and audio parameter overrides', () => {
  const request = buildAudioChatCompletionRequest({
    model: 'gpt-audio-mini',
    messages: [
      {
        id: 'text-user',
        role: 'user',
        content: 'hello before audio',
        timestamp: 1710000000000,
      },
      {
        id: 'audio-user',
        role: 'user',
        content: '',
        audioRecords: [userAudio],
        timestamp: 1710000000001,
      },
      {
        id: 'audio-assistant',
        role: 'assistant',
        content: 'assistant reply',
        audioRecords: [assistantAudio],
        timestamp: 1710000000002,
      },
    ],
    currentUserAudio: {
      ...userAudio,
      id: 'audio-current',
      data: 'Y3VycmVudC1hdWRpbw==',
    },
    systemPrompt: 'Stay concise.',
    parameters: {
      temperature: 0.4,
      audio: {
        voice: 'verse',
        format: 'mp3',
      },
    },
  });

  assert.equal(request.model, 'gpt-audio-mini');
  assert.deepEqual(request.modalities, ['text', 'audio']);
  assert.deepEqual(request.audio, { voice: 'verse', format: 'mp3' });
  assert.equal(request.temperature, 0.4);
  assert.equal(request.messages[0].role, 'system');
  assert.equal(request.messages[0].content, 'Stay concise.');

  const userAudioMessages = request.messages.filter((message) => message.role === 'user');
  assert.equal(userAudioMessages.length, 3);
  assert.deepEqual(userAudioMessages[1].content, [
    {
      type: 'input_audio',
      input_audio: {
        data: 'dXNlci1hdWRpbw==',
        format: 'wav',
      },
    },
  ]);
  assert.deepEqual(userAudioMessages[2].content, [
    {
      type: 'input_audio',
      input_audio: {
        data: 'Y3VycmVudC1hdWRpbw==',
        format: 'wav',
      },
    },
  ]);

  const assistantMessage = request.messages.find((message) => message.role === 'assistant');
  assert.equal(assistantMessage.audio, undefined);
  assert.equal(assistantMessage.content, 'assistant reply');
});

test('buildAudioChatCompletionRequest prefixes Qwen Omni base64 audio data as a data URL', () => {
  const request = buildAudioChatCompletionRequest({
    model: 'qwen3.5-omni-flash',
    messages: [
      {
        id: 'audio-user',
        role: 'user',
        content: 'transcribed user turn',
        audioRecords: [userAudio],
        timestamp: 1710000000001,
      },
    ],
    currentUserAudio: {
      ...userAudio,
      id: 'audio-current',
      data: 'Y3VycmVudC1hdWRpbw==',
    },
  });

  const userMessages = request.messages.filter((message) => message.role === 'user');
  assert.deepEqual(userMessages[0].content, [
    { type: 'text', text: 'transcribed user turn' },
    {
      type: 'input_audio',
      input_audio: {
        data: 'data:;base64,dXNlci1hdWRpbw==',
        format: 'wav',
      },
    },
  ]);
  assert.deepEqual(userMessages[1].content, [
    {
      type: 'input_audio',
      input_audio: {
        data: 'data:;base64,Y3VycmVudC1hdWRpbw==',
        format: 'wav',
      },
    },
  ]);
});

test('buildAudioChatCompletionRequest keeps non-Qwen audio input data unchanged', () => {
  const request = buildAudioChatCompletionRequest({
    model: 'gpt-audio-mini',
    messages: [],
    currentUserAudio: userAudio,
  });

  assert.deepEqual(request.messages[0].content, [
    {
      type: 'input_audio',
      input_audio: {
        data: 'dXNlci1hdWRpbw==',
        format: 'wav',
      },
    },
  ]);
});

test('buildTextAudioChatCompletionRequest does not inject default audio settings', () => {
  const request = buildTextAudioChatCompletionRequest({
    model: 'gpt-audio-mini',
    systemPrompt: 'Speak naturally.',
    messages: [
      {
        id: 'text-user',
        role: 'user',
        content: 'hello in text',
        timestamp: 1710000000000,
      },
    ],
    parameters: {
      temperature: 0.2,
    },
  });

  assert.equal(request.model, 'gpt-audio-mini');
  assert.deepEqual(request.modalities, ['text', 'audio']);
  assert.equal(request.audio, undefined);
  assert.equal(request.temperature, 0.2);
  assert.deepEqual(request.messages, [
    { role: 'system', content: 'Speak naturally.' },
    { role: 'user', content: 'hello in text' },
  ]);
});

test('extractAudioChatCompletionResponse reads assistant text, audio data, id, usage, and raw response', () => {
  const extracted = extractAudioChatCompletionResponse({
    choices: [
      {
        message: {
          content: 'spoken answer',
          audio: {
            id: 'audio-openai-456',
            data: 'cmVwbHktYXVkaW8=',
            transcript: 'spoken answer transcript',
          },
        },
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
    },
  });

  assert.equal(extracted.content, 'spoken answer');
  assert.equal(extracted.audio?.providerAudioId, 'audio-openai-456');
  assert.equal(extracted.audio?.data, 'cmVwbHktYXVkaW8=');
  assert.equal(extracted.audio?.format, 'pcm16');
  assert.deepEqual(extracted.usage, {
    prompt_tokens: 10,
    completion_tokens: 20,
    cached_tokens: undefined,
    cache_creation_input_tokens: undefined,
    cache_read_input_tokens: undefined,
    reasoning_tokens: undefined,
  });
  assert.match(extracted.rawResponse ?? '', /spoken answer/);
});

test('extractAudioChatCompletionResponse treats wav output without a RIFF header as pcm16 audio data', () => {
  const extracted = extractAudioChatCompletionResponse({
    choices: [
      {
        message: {
          content: 'qwen audio',
          audio: {
            data: 'AAAAAAAA',
          },
        },
      },
    ],
  }, 'wav');

  assert.equal(extracted.audio?.format, 'pcm16');
  assert.equal(extracted.audio?.mimeType, 'audio/pcm');
});

test('extractAudioChatCompletionResponse preserves wav output when data has a RIFF/WAVE header', () => {
  const extracted = extractAudioChatCompletionResponse({
    choices: [
      {
        message: {
          content: 'wav audio',
          audio: {
            data: wavHeaderBase64,
          },
        },
      },
    ],
  }, 'wav');

  assert.equal(extracted.audio?.format, 'wav');
  assert.equal(extracted.audio?.mimeType, 'audio/wav');
});

test('readAudioChatCompletionStream collects streamed text, audio transcript, data, and provider audio id', async () => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(': OPENROUTER PROCESSING\n\n'));
      controller.enqueue(encoder.encode('data: {"provider":"OpenAI","choices":[{"delta":{"audio":{"id":"audio-stream-1","transcript":"Hel","data":"AAA="}}}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"audio":{"transcript":"lo","data":"BBB="}}}]}\n\n'));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  const response = new Response(stream);
  const extracted = await readAudioChatCompletionStream(response, 'pcm16');

  assert.equal(extracted.content, 'Hello');
  assert.equal(extracted.provider, 'OpenAI');
  assert.equal(extracted.audio?.providerAudioId, 'audio-stream-1');
  assert.equal(extracted.audio?.data, 'AAA=BBB=');
  assert.equal(extracted.audio?.format, 'pcm16');
  assert.match(extracted.rawResponse ?? '', /audio-stream-1/);
});

test('readAudioChatCompletionStream treats streamed wav output without a RIFF header as pcm16 audio data', async () => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"audio":{"data":"AAAA"}}}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"audio":{"data":"AAAA"}}}]}\n\n'));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  const extracted = await readAudioChatCompletionStream(new Response(stream), 'wav');

  assert.equal(extracted.audio?.data, 'AAAAAAAA');
  assert.equal(extracted.audio?.format, 'pcm16');
  assert.equal(extracted.audio?.mimeType, 'audio/pcm');
});

test('readAudioChatCompletionStream preserves streamed wav output when data has a RIFF/WAVE header', async () => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`data: {"choices":[{"delta":{"audio":{"data":"${wavHeaderBase64}"}}}]}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  const extracted = await readAudioChatCompletionStream(new Response(stream), 'wav');

  assert.equal(extracted.audio?.format, 'wav');
  assert.equal(extracted.audio?.mimeType, 'audio/wav');
});
