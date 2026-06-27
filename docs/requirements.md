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
- Model Parameters must be able to override audio settings such as `audio.voice` and `audio.format`.
- The default audio output settings are `audio.voice = "cedar"` and `audio.format = "pcm16"` when no preset parameter overrides them.
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
