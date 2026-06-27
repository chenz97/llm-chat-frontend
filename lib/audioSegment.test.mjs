import test from 'node:test';
import assert from 'node:assert/strict';
import {
  float32PcmToWavBuffer,
  shouldSubmitVadSegment,
  calculatePcmDurationMs,
  VAD_REDEMPTION_MS,
} from './audioSegment.ts';

test('float32PcmToWavBuffer writes a valid mono 16-bit WAV header and clamps samples', () => {
  const samples = new Float32Array([-2, -1, 0, 0.5, 2]);
  const wav = float32PcmToWavBuffer(samples, 16000);
  const view = new DataView(wav);

  assert.equal(new TextDecoder().decode(new Uint8Array(wav, 0, 4)), 'RIFF');
  assert.equal(new TextDecoder().decode(new Uint8Array(wav, 8, 4)), 'WAVE');
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), samples.length * 2);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(46, true), -32768);
  assert.equal(view.getInt16(48, true), 0);
  assert.equal(view.getInt16(50, true), 16383);
  assert.equal(view.getInt16(52, true), 32767);
});

test('calculatePcmDurationMs derives duration from frame count and sample rate', () => {
  assert.equal(calculatePcmDurationMs(new Float32Array(8000), 16000), 500);
});

test('shouldSubmitVadSegment rejects empty and too-short VAD segments', () => {
  assert.equal(shouldSubmitVadSegment(new Float32Array(0), 16000), false);
  assert.equal(shouldSubmitVadSegment(new Float32Array(1599), 16000), false);
  assert.equal(shouldSubmitVadSegment(new Float32Array(1600), 16000), true);
});

test('VAD redemption window allows natural mid-sentence pauses', () => {
  assert.equal(VAD_REDEMPTION_MS, 3000);
});
