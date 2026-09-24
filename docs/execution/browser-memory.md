# Reduce browser memory used by conversation history

## Purpose / Big Picture

Opening the app should not load every saved image, audio recording, and raw response into JavaScript memory. Conversation selection, full text search, editing, and voice playback must continue to work without deleting existing history. This work targets verified allocation paths; reported browser process sizes cannot be attributed precisely without measuring the user's browser and data.

## Progress

- [x] (2026-09-24) Inspected startup, sidebar storage, streaming, rendering, and voice lifecycle.
- [x] (2026-09-24) Add a lightweight persistent conversation index and migrate existing history without loading it all at once.
- [x] (2026-09-24) Bound diagnostic capture, remove duplicate audio from new diagnostic responses, and reduce rendering/playback retention.
- [x] (2026-09-24) Run regression tests, lint, production build, and browser storage/memory checks; synchronize stable documentation.

## Surprises & Discoveries

Before this change, `ConversationSidebar` kept `getConversations()` results in React state, including every message and media payload. Startup also read full histories just to resolve configuration. List refreshes repeated these reads. `lib/audioChat.ts` retained audio base64 both in the audio record and raw SSE lines. VAD is dynamically imported only when starting a call, so its model is not initialized by opening the page. Markdown was parsed again on parent rerenders even when the content has not changed. Audio serialization also built a string one byte at a time, creating many temporary string objects; playback now uses Blob parts directly. Partial persistence previously updated its throttle timestamp only after a write completed, allowing repeated full-history writes to queue while IndexedDB was slow.

## Decision Log

Use an IndexedDB summary/search store, populated with a cursor during version upgrade and updated atomically with conversation writes. Search preserves title and message-content keyword matching; callers receive metadata only. Keep original conversation records intact. Bound newly captured raw diagnostics and annotate omissions; actual model content and audio remain complete. Memoize Markdown and initially render a recent message page with access to older messages.

## Outcomes & Retrospective

Completed. The storage index, bounded diagnostics, rendering pagination, memoization, chunked audio conversion, Blob playback release, and serialized partial persistence are implemented. All 34 Node tests pass. Production build passes. Lint has no errors and one existing ImageLightbox warning. The isolated Chrome integration check passes migration, original audio preservation, metadata-only reads, title/content search, partial index updates, deletion, absence of startup VAD requests, 40-to-80-message expansion, sidebar search, and playback resource release on end/unmount. Stable architecture, design, planning, and overview documentation has been synchronized.

With 33 synthetic conversations containing 128 MiB of audio and raw payloads, retained JavaScript heap after collection was 128.70 MiB for the full-history read and 0.68 MiB for summary reads (0.67 MiB baseline). Production startup was 3.88–4.12 MiB across the two final browser runs. These compare storage paths using the same fixture; they are not measurements of the user's 500 MB–1 GB browser process, nor a promise about total process memory. Full active histories still load when selected, and VAD/ONNX runtime memory after real microphone use was not profiled. Audio lifecycle checks simulate playback completion without a physical audio device.

## Context and Orientation

`lib/storage.ts` owns IndexedDB versioning and all conversation CRUD. `app/page.tsx` resolves initial configuration and the active conversation. `components/ConversationSidebar.tsx` lists and searches saved conversations. `components/ChatInterface.tsx` renders messages and captures text SSE diagnostics; `lib/audioChat.ts` handles audio SSE. `components/Message.tsx` owns individual playback elements. An IndexedDB cursor visits records individually so a migration need not retain all histories simultaneously.

## Plan of Work

First add the summary type and versioned index, then switch startup and sidebar to metadata reads with stale-result protection. Next add bounded raw capture and omit audio payloads from diagnostics, memoize Markdown, limit initial rendered history, and release finished playback resources. Finally exercise upgrades, writes, searches, deletion, and rich-history memory using synthetic data in an isolated browser profile.

## Concrete Steps

Run all commands from `/Users/zeno/projects/llm-chat-frontend`. Use `npm test`, `npm run lint`, and `npm run build`. For the browser check, run the following commands in separate terminals:

    npm start -- --hostname 127.0.0.1 --port 3311
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' --headless --disable-gpu --remote-debugging-port=9333 --user-data-dir=/private/tmp/llm-chat-memory-profile --no-first-run --no-default-browser-check about:blank
    MEMORY_CHECK_ALLOW_RESET=1 MEMORY_CHECK_ORIGIN=http://127.0.0.1:3311 node scripts/check_browser_memory.mjs

The script deletes only the test origin database in the connected profile. Use a disposable profile and never attach it to the user's normal Chrome. It uses synthetic settings and does not call model endpoints. Successful output lists ten passed integration checks and retained heap measurements. Stop the temporary server and Chrome afterward. First build needed network elevation for the existing Google font imports; no font or dependency changes were made.

## Validation and Acceptance

Existing histories must migrate with all original data intact. Sidebar and startup metadata reads must omit messages and media; title/content searches must retain multi-keyword, case-insensitive behavior. Saving, partial updates, and deletion must keep the index consistent. Diagnostic limits must not truncate model output or playable audio. Opening a long conversation must initially mount a bounded number of messages and allow reading earlier history. Compare retained JavaScript heap for full-history and summary reads using the same synthetic dataset; distinguish that metric from total browser process memory.

## Idempotence and Recovery

The schema upgrade is transactional and additive. Failure aborts the upgrade without deleting original history. Repeatable checks use temporary browser profiles. Existing raw responses remain untouched.

## Artifacts and Notes

Evidence: `npm test` reports 34 passed, 0 failed. `npm run build` completes type checking and all static routes. `npm run lint` reports 0 errors and the pre-existing `ImageLightbox.tsx` image warning. The browser script reports all ten checks passed, with 128.70 MiB full-history heap and 0.68 MiB summary heap. Overview, architecture, planning, and design were reviewed after implementation and again before delivery; stable contracts and validation coverage are synchronized.

## Interfaces and Dependencies

Use existing React, native IndexedDB, and Node test tooling. Introduce `ConversationSummary` and `getConversationSummaries(query?: string)` for metadata-only reads. No new production dependencies are required. TypeScript allows explicit `.ts` imports under its existing `noEmit` setting so shared runtime helpers can also run in Node tests.

Revision (2026-09-24): Implementation complete; added single in-flight partial persistence after finding overlapping-write retention. Stable docs updated; browser and production checks remain.

Revision (2026-09-24): Completed final validation and documented measured storage-path reductions, playback cleanup coverage, test commands, and real-device/process-memory limitations.
