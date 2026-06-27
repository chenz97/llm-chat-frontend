# Project Overview

## Purpose

`llm-chat-frontend` is a local-first web client for OpenAI-compatible chat APIs. The application gives a single user a browser UI for configuring providers, selecting models, saving reusable assistant presets, running multi-turn conversations, attaching one or more images or audio turns, and reviewing streamed or audio responses without requiring a dedicated backend for normal use.

The current implementation is centered on practical experimentation with different providers and models. The browser stores API settings, presets, and conversation history locally so the user can reopen the app and continue previous chats on the same device. Requests still default to chat completions, but each assistant preset can now opt into the OpenAI Responses API when the target provider supports it.

## Core User Jobs

- Configure one or more provider endpoints with base URL, API key, and available model IDs.
- Start a conversation, pick an assistant preset and model, and send text prompts, multimodal prompts with one or more uploaded images, or phone-like audio turns with supported Chat Completions audio models.
- Read streamed assistant output with markdown, code highlighting, math rendering, token usage, reasoning text, and optional raw SSE event inspection.
- Regenerate or edit messages while keeping the conversation history in local browser storage.
- Export and import API settings and assistant presets as JSON backups.
- Manually sync API settings and assistant presets through a user-configured private GitHub Gist.

## Functional Scope

The codebase currently implements the following stable product scope:

- A Next.js App Router single-page chat interface with responsive sidebar and settings modal.
- API configuration management for multiple OpenAI-compatible providers.
- Assistant preset management with system prompts, model parameters, optional provider binding, a preset-level request API selector, an optional server-proxy toggle, and per-preset main-selector visibility.
- Conversation storage, conversation search, current-conversation restoration, and draft conversation creation before first persistence.
- Streaming chat responses with partial rendering, cancellation, final persistence, and recovery-friendly interruption handling that preserves already received assistant output across both chat-completions and responses request modes.
- User image upload and paste support using base64 `image_url` message content, including multiple images in a single user turn.
- Voice-call mode for Chat Completions audio models. The browser records user speech, auto-submits after 3 seconds of silence, sends full available audio history, plays returned assistant audio, and keeps every audio record replayable in the conversation.
- Markdown rendering with GitHub Flavored Markdown, KaTeX math, and syntax highlighting.
- A server-side forwarding route at `/api/chat/completions` for deployments where browser-to-provider requests are undesirable.
- JSON import/export for API configurations and assistant presets.
- Manual GitHub Gist sync for the same settings JSON envelope, including push-to-cloud and pull-from-cloud overwrite flows.
- A local Python helper script for reproducing raw chat-completions requests outside the browser.

## Constraints And Assumptions

- The app is single-user and browser-local. There is no account system, shared workspace, or remote database.
- IndexedDB is the primary persistence layer. `localStorage` remains as a fallback and migration source for some settings data.
- Conversations are not persisted when IndexedDB is unavailable.
- The app expects OpenAI-compatible streaming semantics, especially streamed `data:` server-sent events for chat-completions and responses endpoints.
- Provider-specific extensions such as reasoning fields and detailed usage tokens are handled on a best-effort basis rather than through vendor SDKs.
- Mobile browsers may suspend or terminate in-flight streaming requests when the page enters the background or the device is locked. The app mitigates this by preserving partial output, but it does not guarantee uninterrupted background streaming.
- API keys are entered in the browser UI and stored locally in the browser. When the optional Vercel proxy path is used, the browser still sends the saved API key to the application server for forwarding.
- GitHub Gist sync uses a browser-stored GitHub token and direct GitHub REST API calls; the token is not included in settings export files.
- Automated coverage is currently limited to focused Node tests for settings transfer, deep links, sync helpers, and audio request construction. Broader UI, microphone, and chat-flow validation still relies on build, lint, and manual/browser checks.

## Non-Goals

The current implementation does not aim to provide:

- Multi-user collaboration, accounts, or cloud sync.
- Multi-user collaboration or accounts.
- Server-side secret management, key vault integration, or tenant isolation.
- Retrieval-augmented generation, document indexing, or knowledge-base features.
- Workflow orchestration, tool calling UI, agent management, or OpenAI API surfaces beyond chat-completions and responses.
- Realtime API, separate transcription, or separate TTS integrations for voice mode.
- Provider-specific SDK integrations beyond the common OpenAI-compatible HTTP contract.
- Formal observability, analytics, or production operations dashboards.

## Source Of Truth

This document summarizes the implementation that exists in `app/`, `components/`, `lib/`, `types/`, and `scripts/`. If this overview ever conflicts with executable behavior, the implementation is the current source of truth until the documentation is updated.
