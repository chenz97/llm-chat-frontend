# Project Planning

## Current Phase

The repository is currently in a local-first MVP hardening phase. The primary end-user chat workflow is already implemented, and the immediate project need is to keep behavior, documentation, and future maintenance aligned. As of 2026-04-18, this file establishes the first explicit project-level planning baseline.

## Completed Work

- Core single-page chat experience built on Next.js App Router.
- API configuration management for OpenAI-compatible providers.
- Assistant preset management with default preset support, optional server-proxy routing, and a preset-level OpenAI Responses API toggle.
- Per-assistant-preset visibility control for hiding presets from the main page preset selector.
- Conversation persistence, restoration, search, deletion, and draft creation.
- Streaming response parsing with reasoning text, usage extraction, and raw-response capture.
- Stream interruption hardening so network failures and mobile backgrounding preserve partial assistant output instead of replacing it.
- Multi-image upload and paste support for multimodal prompts, with legacy single-image conversation compatibility.
- Settings import/export and a raw request debugging script.
- Manual GitHub Gist settings sync from the Import/Export settings page.
- Baseline project documentation under `docs/`.
- README alignment with the current IndexedDB-first storage model, proxy behavior, and repository structure.

## Current Priorities

There is no separately committed feature roadmap in the repository at this time. The stable priorities that can be inferred from the current codebase are:

- keep the documented architecture synchronized with the implementation,
- preserve the local-first chat workflow,
- improve reliability around provider compatibility and storage behavior.
- keep stream interruption behavior predictable on mobile browsers even when background execution cannot be guaranteed.

## Candidate Next Priorities

The following items are reasonable next candidates, but they are not yet committed requirements:

- Add automated tests for storage helpers, SSE parsing, and core chat flows.
- Review the deployment security model for the optional server proxy, especially how browser-stored API keys are forwarded.
- Standardize user-facing copy and localization strategy, because the UI currently mixes English and Chinese labels.
- Decide whether conversation export/import should be added alongside the existing settings export/import flow.

## Risks And Maintenance Watchpoints

- Automated tests currently cover only focused settings-transfer logic, so regressions in browser storage, UI flows, and streaming parsing are still likely to be discovered manually.
- Browser storage limits can prevent saving large histories or many image-heavy conversations.
- OpenAI-compatible providers do not emit identical SSE payloads, so reasoning and usage extraction may drift by provider.
- Browser and OS background policies, especially on Android lock screen, can still terminate active streaming requests; the current mitigation preserves partial output but cannot keep the connection alive in every browser.
- The server proxy simplifies networking for some deployments, but it does not remove the need to trust the application server with API keys.

## Status Discipline

Future planning updates should distinguish clearly between:

- `Committed`: agreed work that should be implemented next.
- `Candidate`: plausible next work that still needs product or engineering confirmation.
- `Historical`: completed milestones retained for context.

At the time of writing, the completed items above are historical, and the candidate list remains explicitly non-committal.
