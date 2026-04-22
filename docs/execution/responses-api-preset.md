# Responses API Preset Toggle

This execution document is a living record and must be maintained in accordance with `/home/cz/.codex/.agent/PLANS.md`.

## Purpose / Big Picture

This task adds OpenAI Responses API support to the existing local-first chat client without replacing the current chat-completions flow. The user must be able to enable Responses API per assistant preset, so one preset can continue using `/chat/completions` while another uses `/responses` against the same provider configuration.

## Progress

- [x] (2026-04-22) Investigated the current preset model, request builder, proxy route, and documentation touchpoints.
- [x] (2026-04-22) Chosen the implementation direction: add a preset-level request API mode instead of changing provider configuration shape.
- [x] (2026-04-22) Added the new preset field to the shared type model and settings import/export sanitization.
- [x] (2026-04-22) Added preset UI controls and summary display for selecting `chat_completions` or `responses`.
- [x] (2026-04-22) Extended request building, streaming parsing, and the optional proxy so the frontend can send either API shape.
- [x] (2026-04-22) Ran validation and synced stable documentation.
- [x] (2026-04-22) Persist Responses `response.id` values on assistant messages.
- [x] (2026-04-22) Use `previous_response_id` plus incremental `input` when a valid Responses chain exists, with automatic fallback to full-history replay when it does not.
- [x] (2026-04-22) Re-ran validation and synced stable docs for the new conversation-state behavior.

## Surprises & Discoveries

- Observation: the current app is intentionally centered on chat-completions semantics.
  Evidence: `docs/overview.md`, `docs/architecture.md`, `docs/design.md`, `lib/api.ts`, and `app/api/chat/completions/route.ts` all describe or implement only `/chat/completions`.

- Observation: assistant presets already control transport-level behavior beyond model parameters.
  Evidence: `AssistantPreset` already stores `useVercelServerProxy`, so adding a second preset-level request toggle is consistent with the existing design.

- Observation: not every OpenAI-compatible provider that supports chat completions at `/v1/chat/completions` also exposes Responses API at `/v1/responses`.
  Evidence: the user reported a provider where the configured `baseUrl` omits `/v1`, chat completions still work through the app's existing `/v1/chat/completions` resolution, but Responses only works at `/responses`.

- Observation: some preset parameters that work as top-level chat-completions fields are nested differently in Responses API.
  Evidence: the user provider returned `unsupported parameter reasoning_effort`, which indicates the preset's top-level `reasoning_effort` needed Responses-specific remapping.

- Observation: provider-specific Responses streams may emit `response.output_item.done` for both reasoning items and ordinary assistant message items.
  Evidence: the user observed the final assistant answer being duplicated into the UI reasoning panel, which matched the parser treating every `response.output_item.done` as reasoning text.

## Decision Log

- Decision: add a preset-level `requestApi` field with `chat_completions` as the default and legacy fallback.
  Rationale: this preserves current behavior for all existing presets and import files while allowing selective opt-in to `/responses`.
  Date/Author: 2026-04-22 / Codex

- Decision: keep provider records unchanged and derive the final endpoint from the preset at send time.
  Rationale: one provider base URL may need to support both API surfaces depending on the preset, so moving the switch into `ApiConfig` would be too coarse.
  Date/Author: 2026-04-22 / Codex

- Decision: implement Responses conversation-state carryover via `previous_response_id` rather than manually replaying reasoning items.
  Rationale: this is the official low-friction continuation mechanism and avoids persisting or reconstructing hidden reasoning content client-side.
  Date/Author: 2026-04-22 / Codex

## Context and Orientation

Expected code areas:

- `types/index.ts`
- `components/AssistantPresetManager.tsx`
- `components/SettingsTransfer.tsx`
- `components/ChatInterface.tsx`
- `lib/api.ts`
- `app/api/chat/completions/route.ts`

Stable docs likely affected after implementation:

- `docs/overview.md`
- `docs/architecture.md`
- `docs/design.md`
- `docs/planning.md`

## Concrete Steps

1. Extend the preset type with a request API mode and ensure legacy presets default to chat completions.
2. Expose the new option in assistant preset create/edit UI and display the selected API mode in preset cards.
3. Build a Responses-compatible request body from the existing conversation model while preserving multimodal user input and preset system prompt behavior.
4. Teach the client streaming parser and optional proxy route to target either `/chat/completions` or `/responses`.
5. Run `npm run lint`.
6. If repository-wide lint still fails outside the task scope, run targeted lint on the touched files and record both results.
7. Sync the stable docs listed above.

Expected validation command:

    cd /home/cz/projects/llm-chat-frontend
    npm run lint

Targeted validation fallback if needed:

    cd /home/cz/projects/llm-chat-frontend
    npx eslint components/AssistantPresetManager.tsx components/ChatInterface.tsx components/SettingsTransfer.tsx lib/api.ts app/api/chat/completions/route.ts types/index.ts --rule 'react-hooks/set-state-in-effect: off'

## Validation and Acceptance

Acceptance is manual plus lint-based:

- Existing presets must continue to send requests through chat completions without requiring migration.
- A preset edited to use Responses API must persist that choice and show it in the preset summary.
- Sending a chat with a Responses-enabled preset must target `/responses` directly or through the proxy, depending on the existing proxy toggle.
- Multimodal user turns and preset system prompts must still be included in the outgoing request.
- Streaming assistant text must continue to render incrementally, and final token usage should still be captured when the provider returns it.

## Idempotence and Recovery

The change is additive. If work stops after the type/import changes but before the UI is finished, legacy presets still resolve to `chat_completions` by default and existing settings data remains readable.

## Interfaces and Dependencies

At the end of this task:

- `AssistantPreset` must include a stable request API selector.
- `lib/api.ts` must be able to build and stream either chat-completions or responses requests from the existing conversation model.
- The optional proxy route must forward either API surface without changing the user-facing proxy toggle.

Revision note: created this execution document on 2026-04-22 after investigating the existing preset/request flow and before making structural edits.

Revision note: updated this document on 2026-04-22 after implementing the preset toggle, request branching, and validation.

Revision note: updated this document on 2026-04-22 after fixing Responses endpoint resolution to stop forcing `/v1` when the configured provider base URL does not include it.
Revision note: updated this document on 2026-04-22 after tightening Responses reasoning extraction so only `reasoning` output items populate the reasoning UI.
Revision note: updated this document on 2026-04-22 after adding persisted Responses `response.id` storage and `previous_response_id` continuation with incremental `input`.

## Outcomes & Retrospective

Assistant presets can now persist a `requestApi` mode. Existing presets and imported backups default to `chat_completions`, while new or edited presets can opt into `responses` without changing provider records.

The chat send path now builds either a chat-completions payload or a Responses payload from the same stored conversation state. For Responses requests, preset `systemPrompt` is mapped to `instructions`, user images are emitted as `input_image` content items, and legacy preset `max_tokens` values are translated to `max_output_tokens` when a dedicated Responses value was not already provided.

The Responses compatibility layer also remaps legacy top-level `reasoning_effort` preset parameters into `reasoning.effort`, which keeps existing assistant presets usable when switching from chat completions to responses.

It keeps the guaranteed-safe compatibility remaps (`max_tokens` and `reasoning_effort`) but otherwise continues passing preset parameters through to the provider, because third-party OpenAI-compatible Responses implementations may accept fields that are not documented in OpenAI's own Responses reference.

Responses assistant messages now also persist the upstream `response.id`. When the next Responses request is created and the latest assistant message in the request slice has that saved id, the client sends only the incremental messages after that assistant and includes `previous_response_id`. If a conversation was created before this change, mixes APIs, or otherwise lacks a valid saved Responses id at the latest assistant boundary, the client falls back to replaying the full request slice as `input`.

This makes OpenAI-style Responses conversation-state carryover available without persisting hidden chain-of-thought content in browser storage. The continuation state lives in the upstream provider through `previous_response_id`, while the local app keeps only the assistant-visible output plus the upstream response identifier.

The streaming layer now resolves either `/chat/completions` or `/responses` for both direct browser requests and proxy-forwarded requests. Responses streaming support handles text deltas, best-effort reasoning deltas, final usage extraction, and error terminal events while preserving the existing UI update flow.

## Artifacts and Notes

Validation artifacts:

    npm run lint

    Result: fails because of pre-existing `react-hooks/set-state-in-effect` errors in untouched or previously existing files (`app/page.tsx`, `components/ApiConfigManager.tsx`, `components/AssistantPresetManager.tsx`, `components/ChatInterface.tsx`, `components/ConversationConfigSelector.tsx`, `components/ImageLightbox.tsx`) plus one unrelated existing warning in `lib/storage.ts`.

    npx eslint components/AssistantPresetManager.tsx components/ChatInterface.tsx components/SettingsTransfer.tsx lib/api.ts app/api/chat/completions/route.ts types/index.ts --rule 'react-hooks/set-state-in-effect: off'

    Result: passes with 0 errors and 0 warnings.

    npx tsc --noEmit

    Result: passes.

    npx eslint components/ChatInterface.tsx lib/api.ts types/index.ts --rule 'react-hooks/set-state-in-effect: off'

    Result: passes with 0 errors and 0 warnings.
