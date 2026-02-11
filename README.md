# LLM Chat Assistant

A modern, feature-rich chat interface for interacting with LLM APIs following the OpenAI Chat Completions standard. Built with Next.js, React, and Tailwind CSS.

## Features

- **Multiple API Support**: Configure and manage multiple API endpoints with different base URLs and API keys
- **Assistant Presets**: Create and save assistant configurations with custom system prompts and model parameters
- **Rich Message Support**:
  - Text messages with streaming responses
  - Image uploads (base64-encoded following OpenAI's format)
  - Markdown rendering with LaTeX math support
  - Syntax highlighting for code blocks
- **Conversation Management**: Save and organize multiple conversations with history
- **Customizable Parameters**: Set model parameters like temperature, max_tokens, top_p, etc. per conversation
- **Local Storage**: All data is stored locally in your browser using localStorage
- **Responsive Design**: Modern dark-themed UI that works on desktop and mobile

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
   - **Send requests via Vercel server proxy**: When enabled, requests are sent to the app's `/api/chat/completions` route first and then forwarded server-side
   - **Parameters**: Add model parameters like temperature, max_tokens, etc.

### Vercel Server-Side Proxy

When `Send requests via Vercel server proxy` is enabled in a preset, the browser sends chat requests to this app first (`/api/chat/completions`). The Next.js server route then forwards the streaming request to your configured upstream API endpoint.

Notes:
- This can help avoid direct browser-to-provider requests in deployed environments like Vercel.
- In the current implementation, the API key still comes from your saved API configuration in the browser settings.

### 3. Start Chatting

1. Click "New Chat" in the sidebar
2. Select your API configuration and optionally an assistant preset
3. Type your message or upload an image
4. Press Enter or click Send

### Image Support

To send images with your messages:

1. Click the image icon in the message input area
2. Select an image file (JPEG, PNG, GIF, or WebP, max 10MB)
3. The image will be converted to base64 and included in your message
4. Type your text prompt and send

## Technology Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Custom components with Lucide icons
- **Markdown**: react-markdown with:
  - GitHub Flavored Markdown (remark-gfm)
  - LaTeX math (KaTeX)
  - Syntax highlighting (highlight.js)
- **Storage**: Browser localStorage

## API Compatibility

This application is compatible with any API that follows the OpenAI Chat Completions format:

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

All data is stored locally in your browser's localStorage. No data is sent to any server except the API endpoints you configure. Your API keys and conversations remain private and are never shared.

## Project Structure

```
llm-chat-frontend/
├── app/                    # Next.js app directory
│   ├── page.tsx           # Main page component
│   ├── layout.tsx         # Root layout
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── ApiConfigManager.tsx
│   ├── AssistantPresetManager.tsx
│   ├── ChatInterface.tsx
│   ├── ConversationConfigSelector.tsx
│   ├── ConversationSidebar.tsx
│   ├── MarkdownRenderer.tsx
│   ├── Message.tsx
│   └── SettingsModal.tsx
├── lib/                   # Utility functions
│   ├── api.ts            # API client for streaming
│   ├── imageUtils.ts     # Image handling utilities
│   └── storage.ts        # localStorage management
└── types/                 # TypeScript type definitions
    └── index.ts
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
