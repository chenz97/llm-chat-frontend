# Design Notes

## Data Model

The shared application types live in `types/index.ts`.

Stable persisted entities:

- `ApiConfig`: provider definition with `id`, `name`, `baseUrl`, `apiKey`, `models`, and `createdAt`.
- `AssistantPreset`: reusable assistant definition with optional `apiConfigId`, fixed `modelId`, `systemPrompt`, arbitrary `parameters`, optional `useVercelServerProxy`, and `createdAt`.
- `Conversation`: a persisted chat thread with `apiConfigId`, optional `assistantPresetId`, optional `modelIdOverride`, message list, and timestamps.
- `ChatMessage`: individual message record with `role`, `content`, optional `imageUrl`, optional reasoning fields, optional usage, optional raw response, and timestamps.
- `SettingsExport`: portable JSON envelope for settings backup and restore.

The request-side OpenAI compatibility layer is also defined here through `Message`, `MessageContent`, `ChatCompletionRequest`, `ReasoningDetail`, `TokenUsage`, and `ProviderMetadata`.

## Persistence Strategy

The application uses IndexedDB as the durable store because conversations and settings can grow beyond what is comfortable for direct `localStorage` usage.

Database details in `lib/storage.ts`:

- database name: `llm_chat_db`
- schema version: `3`
- stores: `api_configs`, `conversations`, `assistant_presets`, `meta`

Design choices:

- API configs and presets keep `localStorage` compatibility so older saved data can be migrated and browsers without IndexedDB can still retain some settings.
- Conversations require IndexedDB, which avoids serializing large conversation histories into `localStorage`.
- Small global selectors such as current conversation and default preset are stored in the `meta` store.
- Storage helpers return application-shaped values rather than exposing raw IndexedDB operations to components.

## Conversation Bootstrap Design

`app/page.tsx` implements a deterministic startup sequence:

1. Load API configurations.
2. If none exist, open the settings modal.
3. Try the stored current conversation ID and only restore it if its referenced API config still exists.
4. Otherwise fall back to the most recently updated valid conversation.
5. Otherwise fall back to the default preset and its provider when available.
6. Otherwise use the first configured provider.
7. Create an unsaved draft conversation so the UI is immediately usable before the first message is persisted.

This design avoids presenting an empty shell when valid provider settings already exist, while also preventing restoration of conversations whose provider configuration has been deleted.

## Request Construction

`components/ChatInterface.tsx` and `lib/api.ts` jointly build provider requests.

Request resolution rules:

- Base provider comes from `conversation.apiConfigId`.
- System prompt and model parameters come from the selected assistant preset when present.
- `conversation.modelIdOverride` wins over the preset model ID.
- If no override exists, the preset model ID is used.
- If neither exists, the first model declared by the provider config is used.
- `stream_options.include_usage` is always added or merged into the outgoing request so providers that support it can return token metrics during or after streaming.

User images are represented as OpenAI-style `content` arrays that contain both a text item and an `image_url` item.

## Streaming And Persistence Design

`lib/api.ts` parses server-sent events line by line instead of relying on a provider SDK. This keeps the frontend provider-agnostic and allows the app to retain raw event lines for debugging.

Extraction behavior:

- `extractContentChunk` reads assistant text deltas.
- `extractReasoningChunk` and `extractReasoningDetailsChunk` collect provider-specific reasoning fields when present.
- `extractUsage` normalizes token usage from several likely provider field names.
- `extractResponseMetadata` captures provider name and usage detail payloads for later display.

`ChatInterface` persists streamed content in two stages:

- partial persistence through a throttled `updateConversationMessages` path during streaming,
- final persistence through `saveConversation` after completion, manual stop, or transport interruption.

Additional interruption behavior:

- assistant messages may temporarily carry a `streamState` of `streaming` while chunks are still arriving,
- interrupted or manually stopped assistant messages persist a final `streamState` plus a short `streamError` notice instead of replacing the assistant text with the raw transport error,
- when the page is backgrounded, `ChatInterface` flushes any queued partial persistence immediately so mobile lock-screen interruption is less likely to lose the most recent streamed text.

This approach reduces write frequency while keeping long responses recoverable if the user navigates away mid-stream or a browser terminates the streaming connection in the background.

## Server Proxy Contract

The optional proxy route accepts:

- `baseUrl`
- `apiKey`
- `request`

The route validates that the first two values are non-empty strings and that `request` is an object, then forwards the payload to the resolved `/chat/completions` endpoint with `stream: true`.

Important design limitation:

- the proxy is a transport convenience layer, not a secrets boundary. The browser still supplies the API key at request time.

## Settings Transfer Contract

`components/SettingsTransfer.tsx` defines a strict but minimal import/export format:

- exported JSON version is currently `1`,
- invalid or incomplete config entries are discarded during import sanitization,
- preset `apiConfigId` references are cleared if the target provider does not exist in the imported config set,
- the imported default preset is kept only if that preset still exists after normalization.

This design favors successful partial recovery over hard failure when an import file contains stale provider references.

## Error Handling

`lib/errorUtils.ts` normalizes nested network and runtime errors into concise user-visible text. Both the browser client and the proxy route use this helper so transport failures produce actionable messages instead of opaque thrown objects.
