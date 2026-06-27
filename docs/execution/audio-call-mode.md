# Execution: Chat Completions Audio Call Mode

## Status

Implementation in progress; code path added and static verification partially completed.

## Scope

Implement voice-call mode in the existing chat UI using streaming Chat Completions audio requests. The implementation preserves normal text streaming and extends stored messages with audio records.

## Verification Contract

End-to-end goal: a user can start a voice call from the chat composer, speak naturally, have the app auto-submit after 3 seconds of silence, hear the model's audio reply, and continue the call while the conversation history keeps all audio records replayable.

Correctness oracle:

- UI state must match the actual call state: listening, recording, waiting for model, playing model reply, or error.
- User speech must produce a persisted user message with an audio replay control.
- The model response must produce a persisted assistant message with text when available and an audio replay control when audio is returned.
- Voice requests must include current preset system prompt, current Model Parameters including `audio` overrides, prior user audio history, assistant text history, and the current user audio.
- Exiting call mode must stop recording, playback, analyser timers, and microphone tracks.

Likely failure modes to rule out:

- Microphone permission denied or unavailable.
- Browser records an unsupported input format.
- Silence detection submits empty audio.
- The app keeps listening while waiting for or playing the model response.
- The proxy or provider rejects an incorrect audio streaming mode or output format.
- Existing text streaming regresses.
- Provider rejects unsupported model, oversized history, or invalid audio format.

## Progress Notes

- Baseline `npm test` passed before implementation: 3 files, 3 passed.
- Official API reference confirms `input_audio` accepts base64 `wav` or `mp3`, and audio output uses `modalities` plus `audio`.
- Added request/response helper tests for system prompts, full audio history, Model Parameter audio overrides, assistant audio extraction, usage extraction, and raw response capture.
- First full `npm test` after helper implementation passed: 4 files, 4 passed.
- `npm run build` initially failed on the Safari-prefixed `webkitAudioContext` type; root cause was the standard DOM `Window` type not declaring that property. The fix uses a narrow local `AudioContextWindow` type and keeps the runtime fallback.
- `npm run build` passed after the type fix.
- `npm run lint` passed with one pre-existing `ImageLightbox` `<img>` warning.
- Live OpenRouter probing showed credentials were valid via `/credits`, then revealed the real audio endpoint requirements: audio output must use `stream: true`, input audio remains `wav` or `mp3`, and streamed output format must be `pcm16`.
- A final low-cost live probe with a 120 ms silent WAV input, `stream: true`, `audio.format: "pcm16"`, and `max_tokens: 32` returned SSE chunks containing an assistant audio ID, transcript, audio `data`, and `[DONE]`.
- Follow-up fix: recorded user audio is now trimmed at the first silence timestamp before WAV encoding, so the 3-second silence window used to detect turn completion is not sent to the model.

## Follow-Up: Browser VAD Segment Extraction

### Status

Implementation planning started after the browser VAD requirements were confirmed.

### Verification Contract

End-to-end goal: a user can start voice-call mode in the browser, speak normally, have a real client-side VAD extract the speech segment as PCM audio, save/send that segment as WAV through the existing Chat Completions audio path, hear the model reply, and continue the call.

Correctness oracle:

- Speech start/end must be driven by VAD callbacks rather than the fixed RMS threshold loop when VAD initializes successfully.
- User speech must produce a WAV `AudioRecord` built from the VAD-produced PCM segment.
- The captured segment must include pre-speech and post-speech padding so normal utterance boundaries are not clipped.
- Empty or near-empty segments must not be submitted.
- VAD loading failure must be visible and recoverable through a documented fallback or call-state error.
- Exiting call mode must stop VAD processing, microphone tracks, playback, and in-flight audio requests.
- Existing text streaming and existing audio request construction must not regress.

Likely failure modes to rule out:

- VAD WASM/model assets fail to load under Next.js.
- Browser-only VAD code breaks server-side build.
- VAD callback audio is encoded with the wrong sample rate or WAV header.
- Short speech segments are dropped or clipped.
- VAD keeps listening while waiting for or playing model audio.
- VAD instance continues running after call mode exits.
- Existing Node tests, production build, or lint fail after dependency and code changes.

### Planned Design

- Add a small audio utility module for PCM-to-WAV conversion and segment validation. This keeps deterministic behavior outside the large React component and makes it unit-testable.
- Dynamically import the browser VAD library inside `startCallMode` so server-side builds do not evaluate microphone-dependent code.
- Configure VAD with pre-speech and redemption padding. Use `onSpeechStart` to enter the recording UI state, and `onSpeechEnd` to convert the returned `Float32Array` audio segment to WAV and submit it through the existing `submitAudioTurn` path.
- Keep the existing RMS/`MediaRecorder` implementation as a fallback path when VAD initialization fails. This preserves call-mode availability if VAD assets fail to load, while still making VAD the primary path.
- Stop the active VAD instance during call-mode teardown before closing microphone and playback resources.

### Implementation Notes

- Added `@ricky0123/vad-web` and copied the required runtime assets into `public/vad/`: `vad.worklet.bundle.min.js`, `silero_vad_v5.onnx`, `ort-wasm-simd-threaded.mjs`, and `ort-wasm-simd-threaded.wasm`.
- Added `lib/audioSegment.ts` for deterministic PCM duration calculation, short-segment rejection, and mono 16-bit WAV encoding from VAD `Float32Array` audio.
- `ChatInterface` now attempts VAD first, using `preSpeechPadMs = 800`, `redemptionMs = 1200`, and `minSpeechMs = 250`. It creates the VAD instance with `startOnLoad = false`, stores the instance, then explicitly starts it so startup failures can destroy the partial instance before falling back. The VAD callback pauses listening before submitting the user turn, and assistant playback resumes VAD listening afterward.
- If VAD import, model loading, worklet loading, or microphone startup fails, `ChatInterface` falls back to the previous RMS/`MediaRecorder` path with browser echo cancellation, noise suppression, and auto gain constraints.
- `eslint.config.mjs` now ignores `public/vad/**` because those files are vendored/minified runtime assets, not source code.

### Validation Log

- `npm install @ricky0123/vad-web`: completed; npm reported 8 dependency audit findings (1 low, 3 moderate, 4 high). No automatic audit fix was run because that would change dependency strategy beyond this task.
- RED check: `npm test -- lib/audioSegment.test.mjs` initially failed because `lib/audioSegment.ts` did not exist.
- GREEN check: `npm test -- lib/audioSegment.test.mjs` passed after adding `lib/audioSegment.ts`; 6 test files passed because the existing script also includes `lib/*.test.mjs`.
- `npm run build` passed after VAD integration; Next.js compiled, type-checked, generated static pages, and kept `/api/chat/completions` dynamic.
- `npm run lint` initially passed with warnings from vendored VAD assets and the pre-existing `ImageLightbox` `<img>` warning. After ignoring `public/vad/**`, `npm run lint` passed with only the pre-existing `components/ImageLightbox.tsx` warning.
- Final verification on 2026-06-27:
  - `npm test -- lib/audioSegment.test.mjs`: passed; 6 test files, 6 passed.
  - `npm test`: passed; 6 test files, 6 passed.
  - `npm run build`: passed; production build compiled, type-checked, generated 5 static pages, and preserved `/api/chat/completions` as dynamic.
  - `npm run lint`: passed with 0 errors and the pre-existing `components/ImageLightbox.tsx` `<img>` warning.
  - `npm run dev`: started on `http://localhost:3000`; local HEAD requests confirmed `200 OK` for `/vad/vad.worklet.bundle.min.js`, `/vad/silero_vad_v5.onnx`, `/vad/ort-wasm-simd-threaded.wasm`, and `/vad/ort-wasm-simd-threaded.mjs`.
- Manual microphone workflow validation remains required in a real browser session with an audio-capable model because automated tests in this repository cannot grant microphone permission or exercise provider audio playback.
