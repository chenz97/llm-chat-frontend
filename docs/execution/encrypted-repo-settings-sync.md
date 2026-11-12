# Encrypted Private-Repository Settings Sync Execution

## Status

Completed on 2026-11-12. Supersedes `github-gist-settings-sync.md`.

## Problem

Gist sync uploaded the settings export, including provider API keys, as plaintext to a "secret" Gist. Secret Gists are unlisted, not private: anyone who obtains the URL can read them, and the classic token needed the account-wide `gist` scope.

## Changes

- Removed `lib/githubGistSync.ts` and its tests.
- Added `lib/settingsCrypto.ts`: AES-256-GCM encryption with a PBKDF2-SHA-256 (600k iterations) passphrase-derived key; fresh salt and IV per push; minimum passphrase length 12; decryption refuses unencrypted payloads.
- Added `lib/githubRepoSync.ts`: GitHub Contents API storage in a private repository. Every push/pull verifies `private === true` first.
- `SettingsSyncConfig` is now `{ githubToken, repository, path }`. The passphrase is kept only in React state.
- Legacy Gist configs are not migrated: their token is discarded and the UI shows a warning with the old Gist ID asking the user to delete it, revoke the token, and rotate exposed API keys.

## User setup

1. Create a private GitHub repository (e.g. `me/llm-chat-sync`).
2. Create a fine-grained personal access token limited to that repository with **Contents: Read and write** (Metadata: read is added automatically).
3. In Settings -> Import/Export, enter the token, `owner/repo`, file path, and a passphrase, then sync.

## Verification

- `npm test` (includes `lib/settingsCrypto.test.mjs`, `lib/githubRepoSync.test.mjs`).
- `npx tsc --noEmit`, `npm run lint`.
