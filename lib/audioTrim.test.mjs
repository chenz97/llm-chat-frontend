import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveSpeechDurationMs,
  resolveTrimmedFrameCount,
  shouldDecodeBeforeUpload,
} from './audioTrim.ts';

test('resolveSpeechDurationMs cuts recording at the first silence timestamp', () => {
  assert.equal(
    resolveSpeechDurationMs({
      recordingStartedAt: 1000,
      silenceStartedAt: 4200,
      stoppedAt: 7200,
    }),
    3200
  );
});

test('resolveSpeechDurationMs uses stop time when no silence start is available', () => {
  assert.equal(
    resolveSpeechDurationMs({
      recordingStartedAt: 1000,
      silenceStartedAt: null,
      stoppedAt: 3900,
    }),
    2900
  );
});

test('resolveTrimmedFrameCount converts duration to a bounded frame count', () => {
  assert.equal(resolveTrimmedFrameCount(48000, 24000, 500), 12000);
  assert.equal(resolveTrimmedFrameCount(48000, 24000, 5000), 48000);
});

test('shouldDecodeBeforeUpload keeps wav recordings on the trim path', () => {
  assert.equal(shouldDecodeBeforeUpload('audio/wav'), true);
  assert.equal(shouldDecodeBeforeUpload('audio/webm;codecs=opus'), true);
});
