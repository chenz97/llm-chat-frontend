import assert from 'node:assert/strict';
import test from 'node:test';
import { createRawResponseCapture, RAW_RESPONSE_MAX_CHARS, RAW_RESPONSE_TRUNCATION_NOTICE } from './rawResponse.ts';
import { readAudioChatCompletionStream } from './audioChat.ts';

test('raw diagnostics preserve short events and stop retaining oversized streams', () => {
  const capture = createRawResponseCapture(10);
  assert.equal(capture.value(), undefined);
  capture.append('first');
  capture.append('second');
  for (let i = 0; i < 1000; i++) capture.append('discarded'.repeat(1000));
  assert.equal(capture.value(), 'first\nseco' + RAW_RESPONSE_TRUNCATION_NOTICE);
});

test('audio response retains complete audio and text while bounding diagnostics', async () => {
  const audioData = 'AAAA'.repeat(30000);
  const transcript = 'spoken '.repeat(12000);
  const event = JSON.stringify({ choices: [{ delta: { audio: { data: audioData, transcript } } }] });
  const response = await readAudioChatCompletionStream(new Response(`data: ${event}\n\ndata: [DONE]\n\n`));
  assert.equal(response.audio.data, audioData);
  assert.equal(response.content, transcript);
  assert.ok(response.rawResponse.length <= RAW_RESPONSE_MAX_CHARS + RAW_RESPONSE_TRUNCATION_NOTICE.length);
  assert.ok(!response.rawResponse.includes(audioData));
  assert.match(response.rawResponse, /音频数据已省略/);
});
