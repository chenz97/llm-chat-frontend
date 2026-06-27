# LLM Chat Assistant

A local-first chat interface for OpenAI-compatible chat APIs. The app is built with Next.js, React, TypeScript, and Tailwind CSS, and focuses on practical provider switching, reusable assistant presets, multimodal prompts, and browser-local persistence.

## Features

- **Multiple API Support**: Configure and manage multiple API endpoints with different base URLs, API keys, and model lists
- **Assistant Presets**: Save reusable assistant configurations with custom system prompts, model parameters, optional provider binding, a per-preset Chat Completions vs Responses API selector, and an optional server-proxy toggle
- **Rich Message Support**:
  - Text messages with streaming responses
  - Phone-like voice mode for Chat Completions audio models, with microphone silence detection, visible call state, saved audio history, and per-message audio replay
  - Reasoning text, token usage, and raw streamed response inspection when provided by the upstream API
  - Image uploads (base64-encoded following OpenAI's format)
  - Markdown rendering with LaTeX math support
  - Syntax highlighting for code blocks
- **Conversation Management**: Save, search, restore, edit, regenerate, and delete conversations with history
- **Customizable Parameters**: Set model parameters like `temperature`, `max_tokens`, `top_p`, and provider-specific fields per preset
- **Browser-Local Persistence**: IndexedDB is the primary storage layer, with `localStorage` fallback or migration for some settings data
- **Settings Transfer**: Export and import API configurations and assistant presets as JSON
- **Responsive Design**: A responsive light-theme interface that works on desktop and mobile

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Clone the repository or navigate to the project directory

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

### Debugging Raw API Responses

To reproduce the frontend chat request outside the browser and inspect the raw HTTP response or network error directly:

1. Create a request JSON file without worrying about `stream`; the script will force `stream: true`.
2. Run:

```bash
python3 scripts/debug_chat_completion.py \
  --base-url https://your-provider.example/v1 \
  --request-file /path/to/request.json
```

The script follows the same endpoint resolution as the frontend (`/v1/chat/completions` when needed) and prints the raw status line, response headers, and raw response body. If no HTTP response is received, it prints the underlying Python network exception instead.
If `--api-key` is omitted, the script reads `API_KEY` from `.env`.

### Building for Production

```bash
npm run build
npm start
```

## Deployment

This application is ready to be deployed on Vercel or any other Next.js-compatible platform.

### Deploy to Vercel

The easiest way to deploy is using the [Vercel Platform](https://vercel.com/new):

1. Push your code to a Git repository (GitHub, GitLab, or Bitbucket)
2. Import your project to Vercel
3. Vercel will detect Next.js and configure everything automatically
4. Your app will be deployed!

Or deploy manually:

```bash
npm run build
npx vercel
```

## Usage

### 1. Configure API Settings

On first launch, you'll be prompted to configure your API settings:

1. Click the Settings icon (gear) in the top-right corner
2. Add an API Configuration:
   - **Name**: A friendly name for this configuration
   - **Base URL**: Your API endpoint (e.g., `https://api.openai.com/v1`)
   - **API Key**: Your API key
   - **Models**: Comma-separated list of available models (e.g., `gpt-4,gpt-3.5-turbo`)

### 2. Create Assistant Presets (Optional)

Create reusable assistant configurations:

1. Go to Settings → Assistant Presets
2. Click "Add Preset"
3. Configure:
   - **Name**: Preset name
   - **Model**: Select from your configured models
   - **System Prompt**: Set the assistant's behavior
   - **Request API**: Choose `Chat Completions API` or `Responses API` for this preset
   - **Send requests via Vercel server proxy**: When enabled, requests are sent to the app's `/api/chat/completions` route first and then forwarded server-side
   - **Parameters**: Add model parameters like temperature, max_tokens, etc.

### Vercel Server-Side Proxy

When `Send requests via Vercel server proxy` is enabled in a preset, the browser sends chat requests to this app first (`/api/chat/completions`). The Next.js server route then forwards the streaming request to your configured upstream `/chat/completions` or `/responses` endpoint according to the preset's `Request API` setting.

Notes:
- This can help avoid direct browser-to-provider requests in deployed environments like Vercel.
- In the current implementation, the API key still comes from your saved API configuration in the browser settings.
- This is a transport convenience feature, not a secret-management boundary: the browser still sends the API key to your deployed app server for forwarding.

### 3. Start Chatting

1. Click "New Chat" in the sidebar
2. Select your API configuration and optionally an assistant preset
3. Type your message or upload an image
4. Press Enter or click Send, or click the phone button to start voice-call mode with a compatible Chat Completions audio model

### Voice Call Mode

Voice call mode uses the current conversation's API configuration, selected model, assistant preset, system prompt, and Model Parameters. The browser listens for speech, records the user turn, submits it after 3 seconds of silence, waits for the model response, plays returned assistant audio, then listens again.

Notes:
- Use a Chat Completions audio-capable model such as `gpt-audio-mini`.
- The default output audio config is `audio.voice = "cedar"` and `audio.format = "pcm16"`.
- Preset Model Parameters can override the audio config, for example `{ "audio": { "voice": "verse", "format": "pcm16" } }`.
- Text messages sent to audio-named models also request an audio reply, because some audio providers reject pure text-only requests for those models.
- The app stores audio records locally, sends saved user audio on later voice turns, and sends assistant replies as text history when text is available.

### Image Support

To send images with your messages:

1. Click the image icon in the message input area
2. Select an image file (JPEG, PNG, GIF, or WebP, max 10MB)
3. The image will be converted to base64 and included in your message
4. Type your text prompt and send

## Technology Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript with strict mode
- **Styling**: Tailwind CSS 4
- **Runtime UI**: React 19 client components with Lucide icons
- **Markdown**: react-markdown with:
  - GitHub Flavored Markdown (remark-gfm)
  - LaTeX math (KaTeX)
  - Syntax highlighting (highlight.js)
- **Storage**: IndexedDB for primary persistence, with `localStorage` fallback or migration for selected settings data

## API Compatibility

This application is compatible with providers that expose OpenAI-compatible Chat Completions and, when enabled per preset, OpenAI-compatible Responses endpoints. Voice call mode additionally requires a Chat Completions model/provider that supports audio input and audio output:

- OpenAI API
- Azure OpenAI
- OpenRouter
- Together AI
- Anthropic Claude (with OpenAI-compatible wrapper)
- Any OpenAI-compatible local models (Ollama, LM Studio, etc.)

### API Request Format

```json
{
  "model": "model-name",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "What's in this image?" },
        { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } }
      ]
    }
  ],
  "temperature": 0.7,
  "max_tokens": 2000,
  "stream": true
}
```

## Data Privacy

API configs, presets, and conversations are stored locally in your browser. In the default direct-request mode, chat requests are sent only to the provider endpoint you configure. If you enable the optional Vercel server proxy, requests are sent to your deployed app first and then forwarded upstream, which means your app server also receives the API key and request payload for that chat.

## Project Structure

```text
llm-chat-frontend/
├── app/                    # Next.js app directory
│   ├── api/
│   │   └── chat/completions/route.ts  # Optional server-side proxy for streaming requests
│   ├── page.tsx           # Main page orchestration and layout state
│   ├── layout.tsx         # Root layout
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── ApiConfigManager.tsx
│   ├── AssistantPresetManager.tsx
│   ├── ChatInterface.tsx
│   ├── ConversationConfigSelector.tsx
│   ├── ConversationSidebar.tsx
│   ├── ImageLightbox.tsx
│   ├── MarkdownRenderer.tsx
│   ├── Message.tsx
│   ├── RawResponseModal.tsx
│   ├── SettingsModal.tsx
│   └── SettingsTransfer.tsx
├── lib/                   # Utility functions
│   ├── api.ts            # API client for streaming
│   ├── audioChat.ts      # Streaming Chat Completions audio request helpers
│   ├── errorUtils.ts     # Error normalization helpers
│   ├── imageUtils.ts     # Image handling utilities
│   └── storage.ts        # IndexedDB and browser storage management
├── scripts/              # Local debug helpers
│   └── debug_chat_completion.py
└── types/                 # TypeScript type definitions
    └── index.ts
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
