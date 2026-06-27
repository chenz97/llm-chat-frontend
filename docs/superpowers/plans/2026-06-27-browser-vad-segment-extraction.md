# Browser VAD Segment Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fixed RMS speech segmentation in voice-call mode with browser-side VAD-driven PCM segment extraction while preserving the existing WAV `input_audio` request path.

**Architecture:** Deterministic PCM/WAV work moves into a small `lib/audioSegment.ts` module with Node tests. `components/ChatInterface.tsx` dynamically imports the browser VAD library only on the client, uses VAD callbacks for speech start/end, and falls back to the existing RMS/`MediaRecorder` path if VAD cannot initialize.

**Tech Stack:** Next.js 16, React 19, TypeScript, Web Audio API, `@ricky0123/vad-web`, Node test runner, existing Chat Completions audio helpers.

---

### Task 1: Add Testable PCM Segment Utilities

**Files:**
- Create: `lib/audioSegment.ts`
- Create: `lib/audioSegment.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `lib/audioSegment.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  float32PcmToWavBuffer,
  shouldSubmitVadSegment,
  calculatePcmDurationMs,
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
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- lib/audioSegment.test.mjs`

Expected: FAIL because `lib/audioSegment.ts` does not exist.

- [ ] **Step 3: Implement utility module**

Create `lib/audioSegment.ts` with these exports:

```typescript
const WAV_HEADER_BYTES = 44;
const PCM_BYTES_PER_SAMPLE = 2;
const MONO_CHANNEL_COUNT = 1;
const MIN_VAD_SEGMENT_MS = 100;

export function calculatePcmDurationMs(samples: Float32Array, sampleRate: number): number {
  if (sampleRate <= 0 || samples.length === 0) {
    return 0;
  }

  return Math.round((samples.length / sampleRate) * 1000);
}

export function shouldSubmitVadSegment(samples: Float32Array, sampleRate: number): boolean {
  return calculatePcmDurationMs(samples, sampleRate) >= MIN_VAD_SEGMENT_MS;
}

export function float32PcmToWavBuffer(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataSize = samples.length * PCM_BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, MONO_CHANNEL_COUNT, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * MONO_CHANNEL_COUNT * PCM_BYTES_PER_SAMPLE, true);
  view.setUint16(32, MONO_CHANNEL_COUNT * PCM_BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = WAV_HEADER_BYTES;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += PCM_BYTES_PER_SAMPLE;
  }

  return buffer;
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- lib/audioSegment.test.mjs`

Expected: PASS for the new audio segment tests.

### Task 2: Install Browser VAD Dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install dependency**

Run: `npm install @ricky0123/vad-web`

Expected: `package.json` and `package-lock.json` include `@ricky0123/vad-web`.

- [ ] **Step 2: Inspect package assets**

Run: `ls node_modules/@ricky0123/vad-web/dist`

Expected: package contains browser-distributable VAD assets and TypeScript declarations or JavaScript modules. If asset filenames differ, configure the component with the package's documented asset paths.

### Task 3: Wire VAD Into Voice Call Mode

**Files:**
- Modify: `components/ChatInterface.tsx`
- Modify: `lib/audioSegment.ts` if component needs a small additional helper

- [ ] **Step 1: Add imports and VAD refs**

In `components/ChatInterface.tsx`, import `calculatePcmDurationMs`, `float32PcmToWavBuffer`, and `shouldSubmitVadSegment` from `@/lib/audioSegment`. Add refs for the active VAD instance and a string mode indicator such as `audioInputModeRef`.

- [ ] **Step 2: Add `createUserAudioRecordFromPcm`**

Add a helper near `createUserAudioRecord`:

```typescript
const createUserAudioRecordFromPcm = (
  samples: Float32Array,
  sampleRate: number
): AudioRecord => {
  const wavBuffer = float32PcmToWavBuffer(samples, sampleRate);
  return {
    id: generateId(),
    role: 'user',
    mimeType: 'audio/wav',
    format: 'wav',
    data: arrayBufferToBase64(wavBuffer),
    durationMs: calculatePcmDurationMs(samples, sampleRate),
    createdAt: Date.now(),
  };
};
```

- [ ] **Step 3: Add dynamic VAD initialization**

In `startCallMode`, before the existing analyser setup, dynamically import `@ricky0123/vad-web`, create a `MicVAD` instance with `onSpeechStart` and `onSpeechEnd`, set call state to listening, store the instance, start it, and return. Configure pre-speech and post-speech padding using the library's supported options.

The `onSpeechEnd` callback must:

```typescript
if (!isCallModeRef.current || callStatusRef.current !== 'recording') return;
if (!shouldSubmitVadSegment(audio, SAMPLE_RATE)) {
  setCallState('listening', '正在听用户说话');
  return;
}
setCallState('waiting_for_model', '正在等待模型回复');
void Promise.resolve(createUserAudioRecordFromPcm(audio, SAMPLE_RATE))
  .then((record) => submitAudioTurn(record))
  .catch((error) => {
    console.error('Failed to create VAD user audio record:', error);
    setCallState('error', '录音保存失败');
  });
```

- [ ] **Step 4: Keep existing RMS path as fallback**

If dynamic import or VAD startup throws, log the error and execute the existing `getUserMedia` + analyser + interval path. Set a call-state message that identifies fallback mode for debugging without adding a visible settings surface.

- [ ] **Step 5: Stop VAD during teardown**

Update `releaseCallResources` so it pauses/destroys the active VAD instance before clearing refs. Keep existing recorder, interval, playback, audio context, microphone, and abort cleanup.

### Task 4: Documentation Updates

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/design.md`
- Modify: `docs/planning.md`
- Modify: `docs/execution/audio-call-mode.md`

- [ ] **Step 1: Update architecture voice flow**

Change the voice-call flow to state that browser VAD is the primary speech segmentation path and RMS/`MediaRecorder` is fallback only.

- [ ] **Step 2: Update design notes**

Record that VAD-produced PCM is encoded to mono 16-bit WAV before being stored/sent, and VAD assets are loaded client-side.

- [ ] **Step 3: Update planning**

Mark voice-call mode as VAD-backed with fallback limitations and note the new dependency/asset risk.

- [ ] **Step 4: Update execution notes**

Record implementation decisions, validation commands, failures, and manual microphone checks.

### Task 5: Full Verification

**Files:**
- No code changes expected unless verification finds defects.

- [ ] **Step 1: Run focused tests**

Run: `npm test -- lib/audioSegment.test.mjs`

Expected: new audio segment tests pass.

- [ ] **Step 2: Run full tests**

Run: `npm test`

Expected: all configured Node tests pass.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: Next.js production build completes. If the VAD package needs browser-only asset handling changes, fix them and rerun.

- [ ] **Step 4: Run lint**

Run: `npm run lint`

Expected: no new lint errors. Existing unrelated warnings must be recorded rather than hidden.

- [ ] **Step 5: Browser workflow validation**

Run: `npm run dev`, open the app, create/select a conversation with an audio-capable Chat Completions model, start call mode, speak a short utterance, pause, confirm a user audio message is saved and replayable, confirm the request reaches the model, confirm assistant audio playback returns the UI to listening, then stop call mode and confirm microphone capture stops.

Expected: VAD path is used when assets load; fallback behavior is visible if VAD initialization fails.

---

## Self-Review

- Spec coverage: VAD primary detection, direct PCM-to-WAV segment generation, padding, empty segment rejection, fallback/error behavior, cleanup, existing request path preservation, and verification are each covered by tasks.
- Placeholder scan: no `TBD`, `TODO`, or unspecified test steps remain.
- Type consistency: shared utility names are introduced in Task 1 and reused consistently in Task 3.
