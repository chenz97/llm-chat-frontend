# Assistant Preset Visibility

## Status

Completed on 2026-05-25.

## Goal

Add a per-assistant-preset visibility switch in Settings. Presets should default to visible, and hidden presets should not appear in the main page assistant preset selector. Existing conversations that already reference a hidden preset should remain functional.

## Investigation

- `types/index.ts` defines `AssistantPreset` without a visibility field.
- `components/AssistantPresetManager.tsx` owns preset creation, editing, default selection, and display cards.
- `components/ConversationConfigSelector.tsx` loads all presets from storage and renders all of them in the main selector.
- `components/ChatInterface.tsx` and `app/page.tsx` resolve selected preset IDs directly through storage, so hiding a preset can be limited to selector visibility without changing request construction.
- `components/SettingsTransfer.tsx` sanitizes imported presets and should preserve the new visibility flag while defaulting old exports to visible.

## Design

- Add optional `isVisible?: boolean` to `AssistantPreset`.
- Treat missing `isVisible` as visible for backward compatibility.
- Save new presets with `isVisible: true`.
- Add a settings checkbox so each preset can be shown or hidden from the main selector.
- Filter `ConversationConfigSelector` options to presets where `isVisible !== false`.
- If the current conversation references a hidden preset, keep that preset as an option in the selector so the select value remains understandable and the conversation can continue unchanged.
- Preserve `isVisible` through settings export/import; old imports with no flag remain visible.

## Documentation Impact

- `docs/design.md`: update the data model and settings transfer contract.
- `docs/architecture.md`: update settings subsystem and selector behavior.
- `docs/planning.md`: add completed feature once validated.
- ADR: not needed; the change is local metadata and does not introduce an architectural dependency or costly-to-reverse decision.

## Validation Plan

- Run `npm run lint`.
- If lint is blocked by existing repository issues, inspect whether any new errors are introduced by this task.
- Run `npm run build` if feasible.

## Progress

- [x] Investigated preset data flow, settings CRUD, selector rendering, and import/export sanitization.
- [x] Chose backward-compatible optional metadata design.
- [x] Implemented code changes.
- [x] Updated durable docs.
- [x] Validated.

## Validation Results

- `npm run lint` still fails on pre-existing `react-hooks/set-state-in-effect` errors in `app/page.tsx`, `components/ApiConfigManager.tsx`, `components/AssistantPresetManager.tsx`, `components/ChatInterface.tsx`, `components/ConversationConfigSelector.tsx`, and `components/ImageLightbox.tsx`, plus existing warnings. The new preset visibility code did not introduce a new lint failure.
- `npm run build` failed in the default sandbox because `next/font` could not fetch Google Fonts.
- `npm run build` passed when rerun with network access.

## Outcome

Assistant presets now carry optional visibility metadata. New and imported presets default to visible unless `isVisible` is explicitly `false`. Settings exposes a per-preset checkbox, export/import preserves the value, and the main selector filters out hidden presets except for a currently selected hidden preset, which remains labeled as hidden so existing conversations do not silently appear to use a different preset.
