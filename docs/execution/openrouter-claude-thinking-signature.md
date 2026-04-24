# Execution: OpenRouter Claude Thinking Signature Failure

## Status

- Completed

## Goal

Diagnose and fix a multi-turn chat failure that appears when using OpenRouter with Anthropic Claude models in Chat Completions mode. The observed provider error is:

`messages.7.content.0: Invalid signature in thinking block`

The fix should preserve visible assistant reasoning in the UI while preventing malformed historical reasoning metadata from being replayed in later requests.

## Scope

- Inspect chat-completions request construction.
- Inspect streaming reasoning capture and persistence.
- Preserve replay-safe assistant reasoning metadata in later turns.
- Prevent invalid or incomplete assistant reasoning metadata from being sent back to the provider.
- Validate that the change does not affect normal user/assistant text replay.

## Findings

- `components/ChatInterface.tsx` accumulates streaming `reasoningDetails` and persists them on assistant messages for display and debugging.
- `lib/api.ts` replays persisted assistant `reasoningDetails` back into outbound Chat Completions `messages` via `message.reasoning_details`.
- Anthropic thinking signatures are provider-generated integrity metadata. During streaming, the frontend receives incremental reasoning-related fragments, so a simple array concatenation does not guarantee a provider-valid replayable thinking block.
- `components/ChatInterface.tsx` previously accumulated `reasoningDetails` with a raw `.concat(details)`, which can duplicate the same reasoning block across multiple chunks instead of reconstructing a single final block with its completed signature.
- If a stream is interrupted or stopped before the final reasoning signature arrives, the persisted `reasoningDetails` are inherently incomplete and should not be replayed into a later turn.
- When malformed or incomplete reasoning details are sent back through OpenRouter on a later turn, OpenRouter/Anthropic can reject the replayed assistant message with an invalid thinking signature error.

## Decision

- Preserve assistant `reasoning_details` for Chat Completions replay only when they come from a normally completed assistant message.
- Merge streaming reasoning chunks by stable reasoning-block identity instead of raw array concatenation so the final persisted structure matches the provider's replay contract more closely.
- Normalize previously saved reasoning histories again right before outbound replay so existing duplicated chunk records can still be recovered.
- Do not replay `reasoning_details` from interrupted or failed assistant messages because their final signatures may be missing.

## Validation Plan

1. Ensure streaming `reasoningDetails` accumulation merges repeated block fragments instead of blindly appending them.
2. Run `npm run lint`.
3. Ensure outbound chat-completions conversion only replays `reasoning_details` for assistant messages that completed normally.
4. Report the user-visible root cause and note the remaining edge cases.

## Validation Results

- Confirmed in `components/ChatInterface.tsx` that streaming reasoning detail chunks now merge through `mergeReasoningDetails(...)` instead of raw `.concat(...)`.
- Confirmed in `lib/api.ts` that outbound Chat Completions conversion normalizes stored reasoning details before replay, requires signatures on `reasoning.text` blocks, and only replays assistant `reasoning_details` when the stored message did not end in `error` or `stopped`.
- Ran `npx eslint lib/api.ts` successfully.
- Ran `npx eslint lib/api.ts components/ChatInterface.tsx`; the only failure was the pre-existing `react-hooks/set-state-in-effect` violation already present in `components/ChatInterface.tsx`.
- Ran `npm run lint`; the full lint run still fails because of pre-existing repository issues unrelated to this fix, including `react-hooks/set-state-in-effect` violations in `app/page.tsx`, `components/ApiConfigManager.tsx`, `components/AssistantPresetManager.tsx`, `components/ChatInterface.tsx`, `components/ConversationConfigSelector.tsx`, and `components/ImageLightbox.tsx`.

## Open Questions

- TBD: whether we should persist an explicit `reasoningReplayable` flag once we have provider-specific confirmation rules beyond the current stream-state heuristic.
