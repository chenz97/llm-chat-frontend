import assert from 'node:assert/strict';
import test from 'node:test';
import { arrayBufferToBase64, createAudioPlaybackBlob } from './audioPlayback.ts';

test('chunked audio encoding and playback preserve bytes across chunk and base64 boundaries', async () => {
  const bytes = Uint8Array.from({ length: 100003 }, (_, index) => index % 256);
  const encoded = arrayBufferToBase64(bytes.buffer);
  assert.equal(encoded, Buffer.from(bytes).toString('base64'));
  const blob = createAudioPlaybackBlob({ data: `data:audio/mpeg;base64,${encoded}`, format: 'mp3', mimeType: 'audio/mpeg' });
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
});

test('PCM playback adds a correct WAV header without re-encoding the audio', async () => {
  const pcm = Uint8Array.from([0, 0, 255, 127, 0, 128]);
  const blob = createAudioPlaybackBlob({ data: arrayBufferToBase64(pcm.buffer), format: 'pcm16', mimeType: 'audio/pcm' });
  const buffer = await blob.arrayBuffer();
  const view = new DataView(buffer);
  assert.equal(blob.type, 'audio/wav');
  assert.equal(Buffer.from(buffer, 0, 4).toString(), 'RIFF');
  assert.equal(view.getUint32(24, true), 24000);
  assert.equal(view.getUint32(40, true), pcm.length);
  assert.deepEqual(new Uint8Array(buffer, 44), pcm);
});
