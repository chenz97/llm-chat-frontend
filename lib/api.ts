import { Message, ChatCompletionRequest, TokenUsage } from '@/types';

const VERCEL_PROXY_ENDPOINT = '/api/chat/completions';

export interface StreamOptions {
  signal?: AbortSignal;
  useVercelServerProxy?: boolean;
}

export interface StreamCallbacks {
  onMessage: (chunk: string) => void;
  onReasoning?: (chunk: string) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
  onUsage?: (usage: TokenUsage) => void;
  onRawEvent?: (rawLine: string) => void;
}

function coerceNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }

  return null;
}

function extractUsage(data: unknown): TokenUsage | null {
  const record = asRecord(data);
  if (!record) return null;

  const usage = asRecord(record.usage);
  if (!usage) return null;

  const promptTokens = coerceNumber(usage.prompt_tokens);
  const completionTokens = coerceNumber(usage.completion_tokens);
  const completionTokensDetails = asRecord(usage.completion_tokens_details);
  const reasoningTokens = coerceNumber(
    usage.reasoning_tokens ?? completionTokensDetails?.reasoning_tokens
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

function extractTextValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(extractTextValue).join('');
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const preferredKeys = ['summary', 'text', 'content', 'value'];

    for (const key of preferredKeys) {
      const nested = record[key];
      const text = extractTextValue(nested);
      if (text) {
        return text;
      }
    }
  }

  return '';
}

function extractReasoningChunk(data: unknown): string {
  const record = asRecord(data);
  const choices = Array.isArray(record?.choices) ? record.choices : [];
  const firstChoice = asRecord(choices[0]);
  const delta = asRecord(firstChoice?.delta);

  if (!delta) {
    return '';
  }

  const reasoningDetails = Array.isArray(delta.reasoning_details)
    ? delta.reasoning_details
    : [];
  const reasoningFromDetails = reasoningDetails
    .map(detail => extractTextValue(detail))
    .join('');

  if (reasoningFromDetails) {
    return reasoningFromDetails;
  }

  const fallbackFields = [
    delta.reasoning,
    delta.reasoning_content,
    delta.reasoningText,
    delta.thinking,
    delta.thinking_content,
    delta.thought,
    delta.thoughts,
  ];

  for (const field of fallbackFields) {
    const text = extractTextValue(field);
    if (text) {
      return text;
    }
  }

  return '';
}

function extractContentChunk(data: unknown): string {
  const record = asRecord(data);
  const choices = Array.isArray(record?.choices) ? record.choices : [];
  const firstChoice = asRecord(choices[0]);
  const delta = asRecord(firstChoice?.delta);

  return extractTextValue(delta?.content);
}

export async function streamChatCompletion(
  baseUrl: string,
  apiKey: string,
  request: ChatCompletionRequest,
  callbacks: StreamCallbacks,
  options?: StreamOptions
): Promise<void> {
  const { onMessage, onReasoning, onError, onComplete } = callbacks;

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
            const data: unknown = JSON.parse(jsonStr);

            const reasoning = extractReasoningChunk(data);
            if (reasoning) {
              onReasoning?.(reasoning);
            }

            const content = extractContentChunk(data);
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
