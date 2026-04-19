# Stream Interruption Hardening

This execution document is a living record and must be maintained in accordance with `/home/cz/.codex/.agent/PLANS.md`.

## Purpose / Big Picture

This task hardens the streaming chat experience so partial assistant output is still visible and saved when the network breaks mid-response. It also adds explicit handling for background or lock-screen interruption on mobile browsers so Android users do not lose the generated text they already received, even though a browser tab cannot guarantee that a streaming HTTP connection will survive after the page is backgrounded.

## Progress

- [x] (2026-04-18) Investigated the current streaming path in `components/ChatInterface.tsx`, `lib/api.ts`, `components/Message.tsx`, and storage helpers to locate where partial output is overwritten on failure.
- [x] (2026-04-18) Confirmed the current failure mode: the `onError` branch replaces assistant `content` with the error message and clears pending throttled persistence without a final save.
- [x] (2026-04-18) Implemented message-level interrupted state, final-save-on-error behavior, and background visibility flushing in the chat flow.
- [x] (2026-04-18) Exposed interrupted and stopped assistant states in the message UI without discarding already streamed content.
- [x] (2026-04-18) Updated `docs/overview.md`, `docs/architecture.md`, `docs/design.md`, and `docs/planning.md` to describe the new interruption behavior and Android limitation.
- [x] (2026-04-18) Ran `npm run lint` and recorded the existing repository-wide lint baseline that still fails outside the scope of this change.
- [x] (2026-04-18) Ran targeted lint on `components/ChatInterface.tsx`, `components/Message.tsx`, and `types/index.ts` with the pre-existing `react-hooks/set-state-in-effect` rule disabled; result was zero errors and one existing `<img>` warning in `components/ChatInterface.tsx`.
- [x] (2026-04-19) Fixed a follow-up TypeScript build regression where the stop button passed `stopStreaming(reason, streamError)` directly to `onClick`, which expects a mouse event handler.

## Surprises & Discoveries

- Observation: the app already performs throttled partial persistence during streaming, but the failure path nulls the pending queue before forcing a final write.
  Evidence: `components/ChatInterface.tsx` currently calls `persistStreamMessages(...)` in `onError`, then immediately calls `clearPersistTimer()`, which drops `pendingPersistRef.current`.

- Observation: Android lock-screen failures are not fully solvable in a pure browser streaming client because the tab can be suspended in the background and the fetch stream can be terminated by the browser or OS.
  Evidence: the current app uses browser `fetch` plus `ReadableStream` directly in `lib/api.ts` and has no server-side continuation job or resumable stream protocol.

- Observation: the repository-wide lint command currently fails for pre-existing React hook state-in-effect violations in several untouched files, so it cannot be used as a clean pass/fail signal for just this feature.
  Evidence: `npm run lint` reports existing errors in `app/page.tsx`, `components/ApiConfigManager.tsx`, `components/AssistantPresetManager.tsx`, `components/ConversationConfigSelector.tsx`, and `components/ImageLightbox.tsx`, plus the long-standing `components/ChatInterface.tsx` state-sync effect.

## Decision Log

- Decision: preserve partial assistant text and show interruption metadata instead of replacing the whole assistant message body with the transport error.
  Rationale: the user-visible defect is loss of already generated content. Preserving the partial text addresses that directly and keeps regeneration available as a follow-up action.
  Date/Author: 2026-04-18 / Codex

- Decision: treat Android lock-screen handling as a mitigation problem, not as a full “keep streaming in background” feature.
  Rationale: the existing architecture is a foreground browser client. Without a durable server-side job model or native app background execution, the connection cannot be guaranteed to survive device lock.
  Date/Author: 2026-04-18 / Codex

## Outcomes & Retrospective

The streaming flow now preserves partial assistant output for both transport failures and manual stop. Instead of replacing the assistant bubble body with the error string, the app persists the partial content plus a short interruption notice. The chat flow also flushes queued partial persistence when the page becomes hidden so Android lock-screen interruption is less likely to lose the latest streamed text.

The remaining gap is architectural rather than implementation-related: a browser tab still cannot guarantee uninterrupted background streaming after lock screen. Solving that would require a materially different design such as server-side job continuation, resumable polling, or a native wrapper with background execution privileges.

## Context and Orientation

The streaming lifecycle is owned by `components/ChatInterface.tsx`. That component creates a placeholder assistant message, updates it as chunks arrive, throttles persistence with `updateConversationMessages`, and finalizes the conversation with `saveConversation`.

`lib/api.ts` is a provider-agnostic streaming client. It sends the request with `fetch`, reads the response body as server-sent event style `data:` lines, and invokes callbacks for content, reasoning, usage, metadata, completion, and error.

`components/Message.tsx` renders assistant messages and currently has no notion of a partially failed assistant response. `types/index.ts` defines the persisted `ChatMessage` shape, so any new message state must be added there first.

The storage layer in `lib/storage.ts` writes conversations to IndexedDB. Conversations are already saved incrementally during streaming, which means this task can build on the existing storage strategy rather than adding a new persistence mechanism.

## Plan of Work

Add a lightweight interruption state to `ChatMessage` in `types/index.ts`, keeping normal completed messages backward compatible by making the new fields optional.

In `components/ChatInterface.tsx`, refactor the stream finalization path so completion, manual stop, and transport failure all produce a final assistant message that preserves any accumulated content, reasoning, usage, raw event lines, and provider metadata. The error path must save the final conversation immediately instead of only scheduling a throttled message update. Background lifecycle hooks must flush pending persistence when the page becomes hidden and must record when the active stream was backgrounded so the eventual error message can explain that the stream was interrupted after the page entered the background.

In `components/Message.tsx`, render assistant interruption notices separately from assistant markdown content. If partial content exists, keep rendering it and show a concise status notice below it. If no assistant content exists, render the notice as the primary visible message so the user still understands what happened.

After the code lands, update `docs/design.md`, `docs/architecture.md`, and `docs/planning.md` so the documented streaming guarantees match the implementation.

## Concrete Steps

Work from `/home/cz/projects/llm-chat-frontend`.

1. Edit `types/index.ts` to add optional assistant interruption fields.
2. Edit `components/ChatInterface.tsx` to preserve partial output across `onError`, flush pending writes on backgrounding, and save interrupted conversations explicitly.
3. Edit `components/Message.tsx` to display stopped/interrupted notices without replacing the message body.
4. Run `npm run lint`.
5. If repository-wide lint is already failing outside the task scope, run targeted lint on the touched files and record both results.
6. Update the stable docs named above and record the validation result in this file.

Expected validation command:

    cd /home/cz/projects/llm-chat-frontend
    npm run lint

Targeted validation used for this task:

    cd /home/cz/projects/llm-chat-frontend
    npx eslint components/ChatInterface.tsx components/Message.tsx types/index.ts --rule 'react-hooks/set-state-in-effect: off'

## Validation and Acceptance

Acceptance is manual plus lint-based:

- Start the app with `npm run dev`, send a prompt to any streaming-capable provider, then force a mid-stream failure by disconnecting the network or stopping the request path. The assistant bubble must retain the text already received instead of replacing it with a raw network error string.
- While a response is streaming, lock an Android device or otherwise background the page. If the connection is interrupted, the conversation must still contain the partial response after reopening the app, and the assistant bubble must state that streaming was interrupted after the page entered the background.
- Manual stop must preserve partial content and mark the response as intentionally stopped rather than complete.
- `npm run lint` should pass once the repository-wide pre-existing hook-rule failures are cleaned up. For this task, targeted lint on the touched files must not report new errors.

## Idempotence and Recovery

These changes are additive and safe to repeat. If implementation is interrupted midway, rerun `npm run lint` after completing the remaining edits. There is no schema migration because the new message fields are optional and older stored conversations remain readable.

## Artifacts and Notes

Validation artifacts:

    npm run lint

    Result: fails because of pre-existing `react-hooks/set-state-in-effect` errors in untouched files and one existing `@next/next/no-img-element` warning.

    npx eslint components/ChatInterface.tsx components/Message.tsx types/index.ts --rule 'react-hooks/set-state-in-effect: off'

    Result: 0 errors, 1 warning (`@next/next/no-img-element` on the existing composer preview `<img>` in `components/ChatInterface.tsx`).

## Interfaces and Dependencies

At the end of this task:

- `types/index.ts` must define optional persisted interruption fields on `ChatMessage`.
- `components/ChatInterface.tsx` must have a single code path that can finalize an assistant message for completion, manual stop, and failure while preserving already accumulated content.
- `components/Message.tsx` must render interruption notices from the persisted message data rather than inferring failure from transient component state.

Revision note: created this execution document on 2026-04-18 after investigating the current streaming failure behavior so the implementation and documentation work can be tracked together.

Revision note: updated this document on 2026-04-18 after implementation to record the final stream-interruption behavior, the Android backgrounding limitation, and the validation results.

Revision note: updated this document on 2026-04-19 after a follow-up compile fix so the stop button now wraps `stopStreaming()` in an event-safe click handler instead of exposing the business-function signature directly to React.
