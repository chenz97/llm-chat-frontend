import { Message, ChatCompletionRequest, TokenUsage } from '@/types';

const VERCEL_PROXY_ENDPOINT = '/api/chat/completions';

export interface StreamOptions {
  signal?: AbortSignal;
  useVercelServerProxy?: boolean;
}

export interface StreamCallbacks {
  onMessage: (chunk: string) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
  onUsage?: (usage: TokenUsage) => void;
  onRawEvent?: (rawLine: string) => void;
}

function coerceNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function extractUsage(data: any): TokenUsage | null {
  const usage = data?.usage;
  if (!usage) return null;

  const promptTokens = coerceNumber(usage.prompt_tokens);
  const completionTokens = coerceNumber(usage.completion_tokens);
  const reasoningTokens = coerceNumber(
    usage.reasoning_tokens ?? usage.completion_tokens_details?.reasoning_tokens
  );

  if (
    promptTokens === undefined
    && completionTokens === undefined
    && reasoningTokens === undefined
  ) {
    return null;
  }

  return {
    prompt_tokens: promptTokens,
    reasoning_tokens: reasoningTokens,
    completion_tokens: completionTokens,
  };
}

export async function streamChatCompletion(
  baseUrl: string,
  apiKey: string,
  request: ChatCompletionRequest,
  callbacks: StreamCallbacks,
  options?: StreamOptions
): Promise<void> {
  const { onMessage, onError, onComplete } = callbacks;

  try {
    const shouldUseServerProxy = options?.useVercelServerProxy === true;

    const response = shouldUseServerProxy
      ? await fetch(VERCEL_PROXY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          baseUrl,
          apiKey,
          request: {
            ...request,
            stream: true,
          },
        }),
        signal: options?.signal,
      })
      : await fetch(resolveChatCompletionsEndpoint(baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          ...request,
          stream: true,
        }),
        signal: options?.signal,
      });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        onComplete();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) {
          continue;
        }

        if (trimmedLine === 'data: [DONE]') {
          callbacks.onRawEvent?.(trimmedLine);
          continue;
        }

        if (trimmedLine.startsWith('data: ')) {
          try {
            callbacks.onRawEvent?.(trimmedLine);
            const jsonStr = trimmedLine.slice(6);
            const data = JSON.parse(jsonStr);

            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              onMessage(content);
            }

            const usage = extractUsage(data);
            if (usage) {
              callbacks.onUsage?.(usage);
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e, trimmedLine);
          }
        }
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      onError(error);
      return;
    }

    onError(error instanceof Error ? error : new Error(String(error)));
  }
}

function resolveChatCompletionsEndpoint(baseUrl: string): string {
  let endpoint = baseUrl.replace(/\/$/, '');
  if (!endpoint.endsWith('/chat/completions')) {
    if (!endpoint.endsWith('/v1')) {
      endpoint += '/v1';
    }
    endpoint += '/chat/completions';
  }
  return endpoint;
}

export function convertToOpenAIMessages(
  messages: Array<{ role: string; content: string; imageUrl?: string }>
): Message[] {
  return messages.map(msg => {
    if (msg.role === 'user' && msg.imageUrl) {
      return {
        role: 'user',
        content: [
          { type: 'text' as const, text: msg.content },
          {
            type: 'image_url' as const,
            image_url: { url: msg.imageUrl }
          }
        ]
      };
    }

    return {
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content
    };
  });
}
