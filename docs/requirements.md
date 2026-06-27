# Requirements: Chat Completions Audio Call Mode

## Problem Context

The application currently supports local-first text and image conversations through OpenAI-compatible Chat Completions and Responses requests. The new feature adds a phone-like voice mode for Chat Completions audio models such as `gpt-audio-mini`, while preserving the existing text workflow, assistant presets, system prompts, model parameters, and conversation persistence.

## Functional Requirements

- The chat composer must expose a voice-call entry button next to the existing send controls.
- Entering call mode must request microphone access and show a prominent status strip in the chat UI.
- The status strip must clearly distinguish at least these states:
  - listening for user speech,
  - recording user speech,
  - waiting for model reply while not listening,
  - playing model reply while not listening,
  - error,
  - idle/not in call mode.
- While listening, the browser must continuously inspect microphone volume and start a user turn when speech-like volume crosses the configured threshold.
- After speech starts, the app must automatically end the user turn and submit it when volume remains below the threshold for 3 seconds.
- The v1 call flow must be serial: listen, record, wait for model, play model audio, then listen again. Playback interruption and barge-in are out of scope.
- Each user audio turn must be saved in the conversation history and rendered with a replay control.
- Each assistant audio reply returned by the model must be saved in the conversation history and rendered with a replay control.
- Every voice-mode request must use the current conversation's selected API configuration, model override, assistant preset, system prompt, and Model Parameters.
- Model Parameters must be able to provide provider-specific audio settings such as `audio.voice` and `audio.format`.
- Voice mode must not inject provider-specific default `audio.voice` or `audio.format` values. If a provider requires these settings, the user must configure them in the assistant preset Model Parameters.
- Text input to audio models must request audio output as well as text output so providers that reject pure text-only calls remain usable.
- The app must attempt the current model/preset directly; unsupported model or provider errors must be shown in call state instead of silently changing models.
- Voice mode must send enough conversation history for continuity:
  - prior user audio is sent as `input_audio` content parts,
  - prior assistant replies are sent as text when returned text/transcript is available,
  - saved text content is sent alongside audio where present.
- Existing text chat, image upload, editing, regeneration, streaming, raw-response display, and storage behavior must keep working.

## Non-Goals

- Do not introduce the Realtime API.
- Do not add a separate transcription or TTS endpoint.
- Do not add a dedicated voice settings page in v1.
- Do not implement playback barge-in or speech interruption in v1.
- Do not silently truncate user audio history in v1.

## Success Criteria

- A user can enter call mode, speak, pause for 3 seconds, receive and hear a model audio reply, and continue into the next turn without touching the text submit button.
- The UI accurately reports listening, recording, waiting, playing, and error states.
- Saved user and assistant audio records remain visible and replayable after the turn completes.
- The generated Chat Completions request includes the selected system prompt, current Model Parameters, prior user audio history, assistant text history, and current user audio.
- Normal text streaming remains operational after the feature is added.

## Follow-Up Requirements: Browser VAD Speech Segment Extraction

### Problem Context

The initial voice-call implementation detects speech by measuring microphone RMS volume against a fixed threshold. This is simple and local, but it confuses loud non-speech noise with user speech, depends heavily on microphone gain and room noise, and can clip speech boundaries because the recording segment starts only after the threshold has already been crossed.

The follow-up must replace the speech-segment extraction path with a real browser-side voice activity detector (VAD). The selected direction is the more complete integration model: the VAD/audio pipeline directly produces the final user speech segment as PCM audio, and the app encodes that segment to WAV before saving and sending it. This avoids relying on `MediaRecorder` containers for user-turn extraction.

### Functional Requirements

- Voice-call mode must continue to run fully in the browser without adding a backend transcription, realtime, or TTS service.
- The app must use a real VAD model/library to classify microphone PCM frames as speech or non-speech instead of using fixed RMS volume as the primary turn detector.
- The VAD path must directly produce the user speech segment audio data used for upload.
- The final user audio record must remain a WAV `AudioRecord` compatible with the existing Chat Completions `input_audio` request builder.
- The user-visible call flow must remain serial: listen, detect/record user speech, wait for the model, play model audio, then listen again.
- The UI states must continue to distinguish listening, recording, waiting for model, playing model audio, error, and idle.
- Speech-start handling must preserve the beginning of the utterance by including an appropriate pre-speech padding window from buffered PCM frames.
- Speech-end handling must avoid cutting off trailing syllables by including an appropriate post-speech padding window.
- The VAD implementation must avoid submitting empty or near-empty audio segments.
- VAD model or WASM asset loading failures must not silently break call mode. The app must either show a clear call-state error or fall back to the existing RMS/MediaRecorder path if a safe fallback is implemented.
- Exiting call mode must stop microphone tracks, audio processing nodes, timers, VAD work, playback, and any in-flight audio request.
- Existing text chat, image upload, text-to-audio-model behavior, saved audio replay, request parameter merging, proxy support, and audio request parsing must keep working.

### Non-Goals

- Do not implement speaker recognition or verify that speech belongs to a specific person.
- Do not add server-side VAD, transcription, or preprocessing.
- Do not add barge-in or interrupt model playback in this change.
- Do not add a full voice settings page in this change.
- Do not change the upstream audio request contract from WAV `input_audio`.

### Success Criteria

- In a browser call session, user speech starts and ends through VAD-driven detection, not fixed RMS threshold detection.
- The persisted user `AudioRecord` contains the VAD-produced speech segment encoded as WAV and remains replayable in message history.
- The speech segment includes speech onset and trailing speech padding so normal short utterances are not visibly clipped.
- A complete voice turn still sends the current user audio to the existing Chat Completions audio request path and can save/play the assistant audio reply.
- VAD initialization failure produces an explicit recoverable behavior: either a visible call error or a documented fallback to the previous RMS/MediaRecorder path.
- `npm test`, `npm run build`, and the strongest practical browser/manual workflow validation for microphone-dependent behavior have been run and recorded.
