# Chat Deep-Link Autosend Execution

## Status

Completed.

## Request

Add a web entry point that lets a Windows command open the deployed chat page, preload a specified message into the composer, and optionally send it automatically.

## Confirmed Design

- Support URL parameters `prompt` and `autoSend`.
- `prompt=<text>` fills the chat composer after the active conversation and API configuration are ready.
- `prompt=<text>&autoSend=1` fills the composer and sends through the existing submit flow.
- Empty or whitespace-only prompts are ignored.
- The auto action must execute at most once per page load to prevent duplicate sends during React re-renders.
- Existing chat behavior remains the source of truth for API config checks, assistant preset handling, conversation persistence, streaming, and errors.

## Verification Contract

The implementation is correct only if all of the following are true:

- Parsing tests confirm search and hash parameters are decoded and normalized.
- `prompt=hello` produces a fill-only instruction.
- `prompt=hello&autoSend=1` produces an autosend instruction.
- Empty prompts produce no instruction.
- Unknown `autoSend` values do not autosend.
- `npm test` passes, exercising the deep-link parser.
- `npm run lint` passes.
- `npm run build` passes, confirming the component integration compiles for production.

Manual runtime check after deployment:

```powershell
start msedge "https://example.com/?prompt=hello&autoSend=1"
```

Expected result: the site opens, restores or creates the active conversation, inserts `hello`, and sends it with the locally configured provider.

## Subtask Log

### 1. Investigation

Status: completed.

Findings:

- The chat composer and submit flow live in `components/ChatInterface.tsx`.
- `app/page.tsx` creates or restores a conversation before rendering `ChatInterface`.
- The existing submit path is `handleSubmit`, which validates input, checks API config, appends the user message, clears draft state, persists conversation state, and starts streaming.
- Existing tests use Node's built-in test runner with `--experimental-strip-types`.

Decision:

- Add a small parser helper under `lib/` so URL normalization can be covered by unit tests.
- Keep submit orchestration in `ChatInterface` so the feature reuses current behavior instead of duplicating request logic.

### 2. Implementation

Status: completed.

Changes:

- Added `lib/chatDeepLink.ts` and `lib/chatDeepLink.test.mjs`.
- Wired `components/ChatInterface.tsx` to parse the current URL and apply a fill/send action once after `conversation` and `apiConfig` are ready.
- Extracted the form submit body into `submitPrompt` so URL autosend and manual form submit share the same behavior.
- Adjusted existing synchronous state updates in effects so the full lint command can run under the current React lint rules.
- Updated `docs/architecture.md` and `docs/planning.md`.

### 3. Validation

Status: completed.

Commands run:

```bash
npm test
npm run lint
npm run build
```

Results:

- `npm test`: passed. Node test runner reported 3 passing test files, including `lib/chatDeepLink.test.mjs`.
- `npm run lint`: passed with exit code 0. One pre-existing Next.js warning remains for `<img>` usage in `components/ImageLightbox.tsx`.
- `npm run build`: passed. Next.js compiled successfully and generated the static app routes plus the dynamic proxy route.

Manual runtime check after deployment remains environment-dependent because it requires a deployed domain and browser-local API settings:

```powershell
start msedge "https://example.com/?prompt=hello&autoSend=1"
```

Expected result: the site opens, restores or creates the active conversation, inserts `hello`, and sends it with the locally configured provider.
