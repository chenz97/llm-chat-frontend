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
