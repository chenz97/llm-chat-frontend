# GitHub Gist Settings Sync Execution

## Status

Completed on 2026-06-08.

## Goal

Add manual settings sync through GitHub Gist from the Settings -> Import/Export page.

## Confirmed Scope

- Use GitHub Gist, not a repository file, as the cloud storage target.
- Reuse the existing `SettingsExport` JSON envelope used by local settings import/export.
- Sync API configurations, assistant presets, and the default preset id.
- Do not sync conversations.
- Store GitHub sync configuration only in browser local storage.
- Store GitHub token locally and never include it in exported settings JSON.
- Allow push to create a private Gist when no Gist ID is configured.
- Allow pull from the configured Gist file and overwrite local settings only after user confirmation.

## Success Criteria

- A new GitHub Gist sync section appears in `components/SettingsTransfer.tsx`.
- Sync configuration includes GitHub token, Gist ID, and filename, with default filename `llm-chat-settings.json`.
- Pushing writes the current settings export JSON to the configured Gist file.
- Pushing with an empty Gist ID creates a private Gist and saves the returned ID.
- Pulling reads the configured Gist file, validates and normalizes it with the same import path as local JSON import, saves local settings, and dispatches `settingsUpdated`.
- GitHub API errors, missing credentials, missing file content, invalid JSON, and local save failures surface as user-visible status messages.
- `npm run lint` and `npm run build` complete successfully.

## Implementation Plan

1. Extract settings transfer data helpers from `SettingsTransfer.tsx` into `lib/settingsTransfer.ts`.
2. Add a browser-local GitHub sync config boundary in `lib/storage.ts`.
3. Add a focused GitHub Gist API helper in `lib/githubGistSync.ts`.
4. Update `types/index.ts` with sync config and GitHub helper types.
5. Update `SettingsTransfer.tsx` with the GitHub Gist sync UI and handlers.
6. Update architecture, design, and planning docs after implementation.
7. Validate with lint and production build.

## Implemented Changes

- Added `SettingsSyncConfig` and `NormalizedSettingsImport` shared types.
- Added `lib/settingsTransferCore.ts` for import normalization and shared settings transfer constants.
- Added `lib/settingsTransfer.ts` for storage-backed export creation and normalized import persistence.
- Added `lib/githubGistSync.ts` for GitHub Gist create, update, and read operations with injected-fetch testability.
- Added `getSettingsSyncConfig` and `setSettingsSyncConfig` in `lib/storage.ts` using browser `localStorage`.
- Updated `components/SettingsTransfer.tsx` with GitHub token, Gist ID, filename, save config, sync-to-GitHub, and sync-from-GitHub controls.
- Added Node built-in test coverage for settings normalization and GitHub Gist helper behavior.

## Validation

- `npm test`: passed, 2 test files passed.
- `npx eslint components/SettingsTransfer.tsx lib/githubGistSync.ts lib/settingsTransfer.ts lib/settingsTransferCore.ts lib/storage.ts types/index.ts`: passed with no output.
- `npm run build`: passed, Next.js production build completed.
- `npm run lint`: still fails with 7 pre-existing `react-hooks/set-state-in-effect` errors in unrelated files such as `app/page.tsx`, `components/ApiConfigManager.tsx`, `components/AssistantPresetManager.tsx`, `components/ChatInterface.tsx`, `components/ConversationConfigSelector.tsx`, and `components/ImageLightbox.tsx`; it also reports the existing `@next/next/no-img-element` warning in `components/ImageLightbox.tsx`.

## Remaining Manual Check

Real GitHub API sync requires a valid GitHub token with Gist access. Manual browser verification should cover creating a new private Gist from an empty Gist ID, patching the same Gist on a second push, and pulling the configured file back into a fresh browser profile.

## Documentation Checkpoints

- Investigation checkpoint: existing import/export only covers settings, so cloud sync will cover the same scope.
- Pre-code checkpoint: `overview.md` non-goal "cloud sync" is no longer accurate and must be updated after implementation.
- Pre-code checkpoint: `architecture.md` and `design.md` need updates for the new Gist sync helper and config persistence.
- ADR checkpoint: no ADR required because the user directly selected Gist and the implementation is a small feature-level integration rather than a repository-wide architectural rule.
