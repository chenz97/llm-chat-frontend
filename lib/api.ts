import {
  Message,
  ChatCompletionRequest,
  TokenUsage,
  ReasoningDetail,
  ProviderMetadata,
  ChatMessage,
} from '@/types';

const VERCEL_PROXY_ENDPOINT = '/api/chat/completions';

export interface StreamOptions {
  signal?: AbortSignal;
  useVercelServerProxy?: boolean;
}

export interface StreamCallbacks {
  onMessage: (chunk: string) => void;
  onReasoning?: (chunk: string) => void;
  onReasoningDetails?: (details: ReasoningDetail[]) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
  onUsage?: (usage: TokenUsage) => void;
  onResponseMetadata?: (metadata: Partial<ProviderMetadata>) => void;
  onRawEvent?: (rawLine: string) => void;
}

interface UsageExtraction {
  usage: TokenUsage;
  usageDetails?: Record<string, unknown>;
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

function extractUsage(data: unknown): UsageExtraction | null {
  const record = asRecord(data);
  if (!record) return null;

  const usage = asRecord(record.usage);
  if (!usage) return null;

  const promptTokens = coerceNumber(usage.prompt_tokens);
  const completionTokens = coerceNumber(usage.completion_tokens);
  const promptTokensDetails = asRecord(usage.prompt_tokens_details);
  const completionTokensDetails = asRecord(usage.completion_tokens_details);
  const reasoningTokens = coerceNumber(
    usage.reasoning_tokens ?? completionTokensDetails?.reasoning_tokens
  );
  const cachedTokens = coerceNumber(
    usage.cached_tokens
    ?? usage.cache_read_input_tokens
    ?? promptTokensDetails?.cached_tokens
  );
  const cacheReadInputTokens = coerceNumber(
    usage.cache_read_input_tokens
    ?? usage.cache_read_tokens
    ?? promptTokensDetails?.cached_tokens
  );
  const cacheCreationInputTokens = coerceNumber(
    usage.cache_creation_input_tokens
    ?? usage.cache_write_input_tokens
    ?? usage.cache_write_tokens
  );

  if (
    promptTokens === undefined
    && completionTokens === undefined
    && reasoningTokens === undefined
    && cachedTokens === undefined
    && cacheReadInputTokens === undefined
    && cacheCreationInputTokens === undefined
  ) {
    return null;
  }

  const usageDetails: Record<string, unknown> = {};
  const detailKeys = [
    'prompt_tokens_details',
    'completion_tokens_details',
    'input_tokens_details',
    'output_tokens_details',
  ];

  for (const key of detailKeys) {
    const detail = asRecord(usage[key]);
    if (detail) {
      usageDetails[key] = detail;
    }
  }

  return {
    usage: {
      prompt_tokens: promptTokens,
      reasoning_tokens: reasoningTokens,
      completion_tokens: completionTokens,
      cached_tokens: cachedTokens,
      cache_read_input_tokens: cacheReadInputTokens,
      cache_creation_input_tokens: cacheCreationInputTokens,
    },
    usageDetails: Object.keys(usageDetails).length > 0 ? usageDetails : undefined,
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
  const reasoningDetails = extractReasoningDetailsChunk(data);
  const reasoningFromDetails = reasoningDetails
    .map(detail => extractTextValue(detail))
    .join('');

  if (reasoningFromDetails) {
    return reasoningFromDetails;
  }

  const record = asRecord(data);
  const choices = Array.isArray(record?.choices) ? record.choices : [];
  const firstChoice = asRecord(choices[0]);
  const delta = asRecord(firstChoice?.delta);

  if (!delta) {
    return '';
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

function extractReasoningDetailsChunk(data: unknown): ReasoningDetail[] {
  const record = asRecord(data);
  const choices = Array.isArray(record?.choices) ? record.choices : [];
  const firstChoice = asRecord(choices[0]);
  const delta = asRecord(firstChoice?.delta);

  if (!delta || !Array.isArray(delta.reasoning_details)) {
    return [];
  }

  return delta.reasoning_details
    .map(detail => asRecord(detail))
    .filter((detail): detail is ReasoningDetail => detail !== null);
}

function extractContentChunk(data: unknown): string {
  const record = asRecord(data);
  const choices = Array.isArray(record?.choices) ? record.choices : [];
  const firstChoice = asRecord(choices[0]);
  const delta = asRecord(firstChoice?.delta);

  return extractTextValue(delta?.content);
}

function extractResponseMetadata(data: unknown): Partial<ProviderMetadata> | null {
  const record = asRecord(data);
  if (!record) {
    return null;
  }

  const provider = typeof record.provider === 'string' ? record.provider : undefined;
  const usageExtraction = extractUsage(data);

  if (!provider && !usageExtraction?.usageDetails) {
    return null;
  }

  return {
    ...(provider ? { provider } : {}),
    ...(usageExtraction?.usageDetails ? { usageDetails: usageExtraction.usageDetails } : {}),
  };
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

            const reasoningDetails = extractReasoningDetailsChunk(data);
            if (reasoningDetails.length > 0) {
              callbacks.onReasoningDetails?.(reasoningDetails);
            }

            const reasoning = extractReasoningChunk(data);
            if (reasoning) {
              onReasoning?.(reasoning);
            }

            const content = extractContentChunk(data);
            if (content) {
              onMessage(content);
            }

            const usageExtraction = extractUsage(data);
            if (usageExtraction) {
              callbacks.onUsage?.(usageExtraction.usage);
            }

            const metadata = extractResponseMetadata(data);
            if (metadata) {
              callbacks.onResponseMetadata?.(metadata);
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
  messages: ChatMessage[]
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

    const message: Message = {
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content
    };

    if (msg.role === 'assistant' && Array.isArray(msg.reasoningDetails) && msg.reasoningDetails.length > 0) {
      message.reasoning_details = msg.reasoningDetails;
    }

    return message;
  });
}
