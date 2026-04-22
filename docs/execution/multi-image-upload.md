# Multi-Image Upload Per Conversation

This execution document is a living record and must be maintained in accordance with `/home/cz/.codex/.agent/PLANS.md`.

## Purpose / Big Picture

This task extends the multimodal chat flow so a single user message can include multiple uploaded images instead of only one. The change must preserve the current local-first conversation model, remain compatible with previously saved single-image messages, and continue emitting OpenAI-compatible `messages` payloads for providers that accept multiple `image_url` content items in one user turn.

## Progress

- [x] (2026-04-22) Investigated the existing image flow across `types/index.ts`, `components/ChatInterface.tsx`, `components/Message.tsx`, `lib/api.ts`, and supporting docs.
- [x] (2026-04-22) Extend persisted message types to support multiple user images while keeping old `imageUrl` reads compatible.
- [x] (2026-04-22) Update composer upload, paste, preview, and remove interactions for multi-image drafts.
- [x] (2026-04-22) Update message rendering and lightbox behavior for multi-image messages.
- [x] (2026-04-22) Run lint validation and sync stable documentation.

## Surprises & Discoveries

- Observation: the current implementation is end-to-end single-image.
  Evidence: `ChatMessage` defines only `imageUrl?: string`, the composer keeps a single `image` state value, and `convertToOpenAIMessages` inserts at most one `image_url` content item.

- Observation: IndexedDB schema migration is not required for this feature if the new multi-image field remains optional.
  Evidence: conversations are stored as plain objects in the existing `conversations` object store, and older records can still be read if code continues to honor the legacy `imageUrl` field.

## Decision Log

- Decision: add `imageUrls?: string[]` to persisted user messages but continue reading `imageUrl?: string` as a legacy fallback.
  Rationale: this allows old conversations to render unchanged while new conversations can carry multiple images without destructive migration work.
  Date/Author: 2026-04-22 / Codex

- Decision: build outgoing OpenAI-compatible user message content as one text item followed by one `image_url` item per uploaded image.
  Rationale: this matches the current text-plus-image request shape while extending it to the standard multi-image content-array form.
  Date/Author: 2026-04-22 / Codex

## Context and Orientation

The implementation spans four main surfaces:

- `types/index.ts`: persisted message type changes.
- `lib/api.ts`: conversion from stored chat messages to provider request payloads.
- `components/ChatInterface.tsx`: draft composer state, upload and paste handling, and message creation.
- `components/Message.tsx`: rendering and previewing one or more user-uploaded images inside a message bubble.

Stable docs likely affected after implementation:

- `docs/architecture.md`
- `docs/design.md`
- `docs/planning.md`

## Concrete Steps

Work from `/home/cz/projects/llm-chat-frontend`.

1. Add the new optional multi-image field to `ChatMessage` and define a shared normalization helper for legacy single-image records.
2. Update request conversion so user messages emit multiple `image_url` items when present.
3. Replace the composer single-image draft state with an array-based state that supports upload, paste, preview, and per-image removal.
4. Update the message bubble UI so multiple uploaded images render in a compact grid and open in the existing lightbox.
5. Run `npm run lint`.
6. If repository-wide lint still fails outside task scope, run targeted lint on touched files and record both results.
7. Sync the stable docs listed above.

Expected validation command:

    cd /home/cz/projects/llm-chat-frontend
    npm run lint

Targeted validation fallback if needed:

    cd /home/cz/projects/llm-chat-frontend
    npx eslint components/ChatInterface.tsx components/Message.tsx lib/api.ts types/index.ts --rule 'react-hooks/set-state-in-effect: off'

## Validation and Acceptance

Acceptance is manual plus lint-based:

- The composer must allow selecting multiple image files in one upload action.
- Pasting multiple image clipboard items should attach all valid image files found in the paste payload.
- A sent user message with multiple images must render all images after persistence and reload.
- The outgoing request builder must preserve plain text and append one `image_url` content item per uploaded image.
- Existing messages that only contain legacy `imageUrl` must still render and remain sendable in regenerated history.

## Idempotence and Recovery

These changes are additive. If work is interrupted after the data model update but before UI completion, old conversations remain readable because the legacy `imageUrl` field is preserved as a fallback read path.

## Outcomes & Retrospective

The chat composer now supports selecting multiple files in one upload action, pasting multiple clipboard images into the same draft, previewing all pending images before send, and removing any individual attachment. Persisted user messages now store multi-image turns with `imageUrls`, while old single-image records continue to render through a legacy fallback path.

The request builder now emits one OpenAI-compatible `image_url` content item per attached image, so providers that support multi-image multimodal prompts receive the full attachment set in a single user turn. Message rendering also moved to array-based image handling, allowing previously saved single-image messages and new multi-image messages to share the same preview and lightbox flow.

## Artifacts and Notes

Validation artifacts:

    npm run lint

    Result: fails because of pre-existing `react-hooks/set-state-in-effect` errors in untouched files (`app/page.tsx`, `components/ApiConfigManager.tsx`, `components/AssistantPresetManager.tsx`, `components/ChatInterface.tsx`, `components/ConversationConfigSelector.tsx`, `components/ImageLightbox.tsx`) plus one unrelated existing warning in `lib/storage.ts`.

    npx eslint components/ChatInterface.tsx components/Message.tsx lib/api.ts types/index.ts lib/imageUtils.ts --rule 'react-hooks/set-state-in-effect: off'

    Result: passes with 0 errors and 0 warnings.

    npm run build

    First result inside the sandbox: failed because `next/font` could not fetch `Geist` and `Geist Mono` from Google Fonts.

    Second result rerun outside the sandbox: passed, including TypeScript and production build generation.

## Interfaces and Dependencies

At the end of this task:

- `ChatMessage` must support optional multi-image storage for user messages.
- `lib/api.ts` must translate stored multi-image messages into OpenAI-compatible content arrays.
- `components/ChatInterface.tsx` must manage multi-image draft attachments.
- `components/Message.tsx` must render more than one user image without regressing single-image display.

Revision note: created this execution document on 2026-04-22 after reviewing the current single-image implementation and before making structural edits.

Revision note: updated this document on 2026-04-22 after implementation, lint verification, and an escalated production build check to record the completed multi-image behavior and validation results.
