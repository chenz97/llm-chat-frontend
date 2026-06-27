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

## Follow-Up: Qwen Omni Local Audio Input Compatibility

### Status

Completed on 2026-06-27.

### Verification Contract

End-to-end goal: when a conversation uses a Qwen Omni audio-capable model such as `qwen3.5-omni-flash`, voice-call mode must submit the recorded user audio in the provider-accepted local Base64 format, while normal text-to-audio output for the same model and non-Qwen audio models keep their existing behavior.

Correctness oracle:

- Qwen Omni voice-call requests must encode browser-captured audio `input_audio.data` as a local Base64 data URL (`data:;base64,...`) so DashScope does not interpret the value as a public URL.
- Already-normalized `data:` values and public `http(s)` URLs must not be modified.
- Non-Qwen audio models such as `gpt-audio-mini` must continue to receive the existing bare Base64 `input_audio.data` shape.
- Text-only audio-output requests must remain unchanged because they do not include `input_audio` content parts.

Likely failure modes ruled out:

- Provider rejects bare Base64 audio input with `InternalError.Algo.InvalidParameter: The provided URL does not appear to be valid`.
- Compatibility normalization accidentally changes request shape for OpenAI/OpenRouter audio models.
- Historical user audio replay in Qwen Omni conversations keeps sending the old bare Base64 shape.
- Build or lint regressions in the shared audio request helper.

### Root Cause

Voice-call mode differs from non-voice text mode because it sends microphone audio as `input_audio` content parts. The existing request builder stored and replayed local browser audio as bare Base64 for all providers. Official DashScope Qwen-Omni documentation shows public URL input examples with `input_audio.data` set to an HTTPS URL, but its local audio Base64 example uses `input_audio.data: "data:;base64,<payload>"`. With bare Base64, Qwen Omni appears to validate the field as a URL and returns the reported invalid URL error.

### Implementation Notes

- `lib/audioChat.ts` now detects Qwen Omni model ids and normalizes local bare Base64 audio input into `data:;base64,...`.
- Existing `data:`, `http://`, and `https://` audio input values are preserved as-is.
- The normalization is applied to both the current voice turn and stored user audio history when Qwen Omni requests are built.
- Non-Qwen models keep the old bare Base64 request shape to avoid changing behavior for providers that already work.

### Validation Log

- RED check: `npm test -- lib/audioChat.test.mjs` failed after adding the Qwen Omni compatibility test because request `input_audio.data` was still bare Base64.
- GREEN check: `npm test -- lib/audioChat.test.mjs` passed after the normalization change; 6 test files passed under the existing script.
- `npm test`: passed; 6 test files, 6 passed.
- `npm run build`: passed; Next.js compiled, type-checked, generated 5 static pages, and preserved `/api/chat/completions` as dynamic.
- `npm run lint`: passed with 0 errors and the pre-existing `components/ImageLightbox.tsx` `<img>` warning.
- Manual browser verification with a real DashScope API key and microphone remains recommended: select `qwen3.5-omni-flash`, enter voice-call mode, speak one short utterance, and confirm the provider no longer returns the invalid URL error.

## Follow-Up: Explicit Audio Output Parameters

### Status

Completed on 2026-06-27.

### Verification Contract

End-to-end goal: voice-call and text-to-audio requests must no longer inject OpenAI-specific audio defaults that can be invalid for other OpenAI-compatible providers such as DashScope Qwen-Omni. Users must be able to provide provider-specific output settings through assistant preset Model Parameters.

Correctness oracle:

- When no preset `audio` parameter is configured, audio Chat Completions requests still include `modalities: ["text", "audio"]` but omit the top-level `audio` field.
- When preset `audio` is configured, the request includes that object unchanged after existing JSON-like string parsing.
- Qwen Omni local audio input compatibility from the previous follow-up still applies.
- Response playback still uses the local parser's fallback output format when the request omits `audio.format`.

Likely failure modes ruled out:

- Qwen rejects the request with `Voice 'cedar' is not supported`.
- OpenAI-compatible providers receive an unintended provider-specific voice or format.
- Explicitly configured `audio.voice` / `audio.format` values stop being passed through.

### Root Cause

`lib/audioChat.ts` previously filled missing audio output settings with `audio.voice = "cedar"` and `audio.format = "pcm16"`. That worked only for providers accepting those exact values. DashScope Qwen-Omni expects its own `voice` names and reports an invalid-voice error when `cedar` is sent.

### Implementation Notes

- `resolveAudioRequestConfig` now returns an audio config only when `parameters.audio` is an object.
- `buildAudioChatCompletionRequest` and `buildTextAudioChatCompletionRequest` omit the `audio` field when it is not explicitly configured.
- Existing `normalizeModelParameters` in `ChatInterface` still parses JSON-like custom parameter strings before request construction, so a custom parameter named `audio` with a JSON object value remains the settings path for provider-specific voice and format.
- `docs/requirements.md` and `docs/design.md` were updated to remove the old default-voice requirement and document explicit provider-specific audio parameters.

### Validation Log

- RED check: `npm test -- lib/audioChat.test.mjs` failed after changing the test to require no implicit `audio` field when no audio parameters are configured.
- GREEN check: `npm test -- lib/audioChat.test.mjs` passed after removing default `audio` injection; 6 test files passed under the existing script.

## Follow-Up: Qwen Omni Output Audio Playback

### Status

Completed on 2026-06-27.

### Verification Contract

End-to-end goal: Qwen Omni audio responses that are returned successfully through the streaming Chat Completions path must be saved in a locally playable form, and voice-call request errors must stop microphone/listening resources instead of leaving call mode active.

Correctness oracle:

- If a provider declares/requested `audio.format = "wav"` but the returned `audio.data` does not contain a RIFF/WAVE header, the app must treat the payload as raw PCM16 and use the existing PCM-to-WAV playback wrapper.
- If returned `audio.data` already contains a RIFF/WAVE header, the app must preserve it as `wav`.
- `mp3` and explicit `pcm16` response handling must keep their previous behavior.
- On voice-mode API, microphone, VAD-resume, or audio-record creation errors, the app must release call resources and clear `isCallMode`, while preserving the error state/message for user feedback.

Likely failure modes ruled out:

- Browser receives raw PCM bytes as `audio/wav` and fails to decode/play them.
- True WAV outputs are mistakenly double-wrapped as PCM.
- Voice mode remains listening or holding microphone resources after an error.

### Root Cause

Live verification with `.env.qwen` showed Qwen Omni returns valid SSE chunks with `audio.data`, but the decoded bytes do not start with the WAV `RIFF...WAVE` header even when the request uses `audio.format = "wav"`. The previous parser trusted the requested output format and stored the payload as `format: "wav"` / `mimeType: "audio/wav"`, so browser playback tried to decode raw PCM bytes as a WAV container.

### Implementation Notes

- `lib/audioChat.ts` now inspects the first decoded bytes of returned `audio.data` when the requested output format is `wav`.
- Headerless `wav` output is normalized to `format: "pcm16"` / `mimeType: "audio/pcm"` so existing playback code wraps it in a WAV container.
- RIFF/WAVE payloads remain `format: "wav"` / `mimeType: "audio/wav"`.
- `components/ChatInterface.tsx` adds a voice-error shutdown path that releases VAD, recorder, microphone tracks, playback, and in-flight request state, then clears call mode while retaining the error status strip.

### Validation Log

- Live Qwen probe using `.env.qwen`: status 200, SSE response contained text and audio; decoded audio header was all zero bytes rather than `RIFF...WAVE`, confirming raw PCM payload.
- RED check: `npm test -- lib/audioChat.test.mjs` failed after adding tests requiring headerless `wav` output to become `pcm16`.
- GREEN check: `npm test -- lib/audioChat.test.mjs` passed after adding response payload header detection.
- Live Qwen parser verification using `.env.qwen`: status 200; `readAudioChatCompletionStream(response, "wav")` produced `audioFormat pcm16`, `mimeType audio/pcm`, and non-empty audio data.
- `npm test`: passed; 6 test files, 6 passed.
- `npm run build`: passed; Next.js compiled, type-checked, generated 5 static pages, and preserved `/api/chat/completions` as dynamic.
- `npm run lint`: passed with 0 errors and the pre-existing `components/ImageLightbox.tsx` `<img>` warning.

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
- `ChatInterface` now attempts VAD first, using `preSpeechPadMs = 800`, `redemptionMs = 3000`, and `minSpeechMs = 250`. It creates the VAD instance with `startOnLoad = false`, stores the instance, then explicitly starts it so startup failures can destroy the partial instance before falling back. The VAD callback pauses listening before submitting the user turn, and assistant playback resumes VAD listening afterward.
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

## Follow-Up: VAD Pause Tolerance

### Status

Implemented on 2026-06-27.

### Verification Contract

End-to-end goal: in voice-call mode, the browser VAD path must tolerate a natural mid-sentence pause of roughly 3 seconds before treating the user turn as complete, reducing premature auto-submit while preserving the existing serial listen-record-submit flow.

Correctness oracle:

- `MicVAD.new` must receive `redemptionMs = 3000` through the shared VAD configuration constant.
- The existing fallback RMS/MediaRecorder path must remain unchanged at 3 seconds of silence.
- VAD segment validation and WAV encoding must keep passing existing tests.
- Build and lint must continue to pass.

Likely failure modes to rule out:

- The old 1200 ms VAD end window remains in `ChatInterface`.
- The VAD constant is changed in one place but the component uses a stale local value.
- Audio utility exports break Node test execution or the Next.js production build.

### Root Cause

Voice-call mode now uses `@ricky0123/vad-web` as the primary speech segmentation path. The previous `redemptionMs = 1200` value meant that about 1.2 seconds of VAD-classified non-speech could trigger `onSpeechEnd`, pause VAD listening, and submit the current audio segment. That was too aggressive for normal thinking pauses or phrase boundaries.

### Implementation Notes

- `lib/audioSegment.ts` now exports `VAD_REDEMPTION_MS = 3000`.
- `components/ChatInterface.tsx` imports that shared value and passes it to `MicVAD.new`.
- Keeping the value in the audio utility module gives the behavior a direct regression test instead of leaving it as an untested component-local constant.

### Validation Log

- RED check: `npm test -- lib/audioSegment.test.mjs` failed because `VAD_REDEMPTION_MS` was not exported, proving the new regression test caught the missing shared configuration.
- GREEN check: `npm test -- lib/audioSegment.test.mjs` passed; all 6 existing lib test files ran and passed.
- `npm test`: passed; 6 test files, 6 passed.
- `npm run build`: passed; Next.js production build compiled, type-checked, generated 5 static pages, and preserved `/api/chat/completions` as dynamic.
- `npm run lint`: passed with 0 errors and the pre-existing `components/ImageLightbox.tsx` `<img>` warning.
- Manual microphone workflow validation remains recommended: start voice mode in a browser, pause mid-sentence for about 2 seconds, and confirm the turn is not submitted until the pause reaches roughly 3 seconds.
