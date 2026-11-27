import type {
  Message,
  ChatCompletionRequest,
  TokenUsage,
  ReasoningDetail,
  ProviderMetadata,
  ChatMessage,
  RequestApi,
  ResponsesRequest,
  UrlCitation,
  WebSearchCall,
} from '@/types';
import { normalizeError } from './errorUtils.ts';
import { getMessageImageUrls } from './imageUtils.ts';
import { withWebSearch } from './webSearch.ts';
import { extractResponseCitations } from './responseCitations.ts';
import { updateWebSearchCalls } from './webSearchActivity.ts';

const VERCEL_PROXY_ENDPOINT = '/api/chat/completions';
const DEFAULT_REQUEST_API: RequestApi = 'chat_completions';

export interface StreamOptions {
  signal?: AbortSignal;
  requestApi?: RequestApi;
  enableWebSearch?: boolean;
  useVercelServerProxy?: boolean;
  buildStatelessResponsesRequest?: () => ResponsesRequest;
}

export interface StreamCallbacks {
  onMessage: (chunk: string) => void;
  onReasoning?: (chunk: string) => void;
  onReasoningDetails?: (details: ReasoningDetail[]) => void;
  onResponseId?: (responseId: string) => void;
  onCitations?: (citations: UrlCitation[]) => void;
  onWebSearch?: (calls: WebSearchCall[]) => void;
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

function normalizeRequestApi(requestApi?: RequestApi): RequestApi {
  return requestApi === 'responses' ? 'responses' : DEFAULT_REQUEST_API;
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

  const response = asRecord(record.response);
  const usage = asRecord(record.usage) ?? asRecord(response?.usage);
  if (!usage) return null;

  const promptTokens = coerceNumber(usage.prompt_tokens ?? usage.input_tokens);
  const completionTokens = coerceNumber(usage.completion_tokens ?? usage.output_tokens);
  const promptTokensDetails = asRecord(usage.prompt_tokens_details ?? usage.input_tokens_details);
  const completionTokensDetails = asRecord(
    usage.completion_tokens_details ?? usage.output_tokens_details
  );
  const reasoningTokens = coerceNumber(
    usage.reasoning_tokens ?? completionTokensDetails?.reasoning_tokens
  );
  const cachedTokens = coerceNumber(
    usage.cached_tokens
    ?? usage.cache_read_input_tokens
    ?? usage.input_cached_tokens
    ?? promptTokensDetails?.cached_tokens
  );
  const cacheReadInputTokens = coerceNumber(
    usage.cache_read_input_tokens
    ?? usage.cache_read_tokens
    ?? usage.input_cached_tokens
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

  const response = asRecord(record.response);
  const provider = typeof record.provider === 'string'
    ? record.provider
    : (typeof response?.provider === 'string' ? response.provider : undefined);
  const usageExtraction = extractUsage(data);

  if (!provider && !usageExtraction?.usageDetails) {
    return null;
  }

  return {
    ...(provider ? { provider } : {}),
    ...(usageExtraction?.usageDetails ? { usageDetails: usageExtraction.usageDetails } : {}),
  };
}

function extractResponsesContentChunk(data: unknown): string {
  const record = asRecord(data);
  if (!record) {
    return '';
  }

  if (
    record.type === 'response.output_text.delta'
    || record.type === 'response.refusal.delta'
  ) {
    return extractTextValue(record.delta);
  }

  return '';
}

function extractResponsesReasoningTextFromValue(value: unknown): string {
  const record = asRecord(value);
  if (!record) {
    return '';
  }

  const summary = Array.isArray(record.summary) ? record.summary : [];
  const summaryText = summary
    .map((item) => {
      const summaryItem = asRecord(item);
      return extractTextValue(
        summaryItem?.text
        ?? summaryItem?.summary_text
        ?? summaryItem?.content
        ?? item
      );
    })
    .join('');

  if (summaryText) {
    return summaryText;
  }

  return extractTextValue(record.text ?? record.content);
}

function isResponsesReasoningItem(value: unknown): value is Record<string, unknown> {
  const record = asRecord(value);
  return record?.type === 'reasoning';
}

function extractResponsesReasoningChunk(data: unknown): string {
  const record = asRecord(data);
  if (!record) {
    return '';
  }

  if (record.type === 'response.reasoning_summary_text.delta') {
    return extractTextValue(record.delta);
  }

  if (record.type === 'response.output_item.done' && isResponsesReasoningItem(record.item)) {
    return extractResponsesReasoningTextFromValue(record.item);
  }

  return '';
}

function collectResponsesReasoningDetails(value: unknown): ReasoningDetail[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectResponsesReasoningDetails(item));
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  const details: ReasoningDetail[] = [];
  if (record.type === 'reasoning') {
    details.push(record);
  }

  if (Array.isArray(record.output)) {
    details.push(...collectResponsesReasoningDetails(record.output));
  }

  if (record.item) {
    details.push(...collectResponsesReasoningDetails(record.item));
  }

  return details;
}

function extractResponsesReasoningDetailsChunk(data: unknown): ReasoningDetail[] {
  const record = asRecord(data);
  if (!record) {
    return [];
  }

  if (record.type === 'response.output_item.done' && isResponsesReasoningItem(record.item)) {
    return collectResponsesReasoningDetails(record.item);
  }

  return [];
}

function extractResponsesError(data: unknown): Error | null {
  const record = asRecord(data);
  if (!record) {
    return null;
  }

  if (record.type !== 'error' && record.type !== 'response.failed') {
    return null;
  }

  const errorRecord = asRecord(record.error) ?? asRecord(asRecord(record.response)?.error);
  const message = extractTextValue(errorRecord?.message ?? record.message);
  return new Error(message || 'Responses API streaming failed');
}

function extractResponsesResponseId(data: unknown): string | null {
  const record = asRecord(data);
  if (!record) {
    return null;
  }

  if (typeof record.response_id === 'string' && record.response_id.trim()) {
    return record.response_id;
  }

  const response = asRecord(record.response);
  if (typeof response?.id === 'string' && response.id.trim()) {
    return response.id;
  }

  return null;
}

function buildReasoningDetailKey(detail: ReasoningDetail, fallbackIndex: number): string {
  const id = typeof detail.id === 'string' ? detail.id : '';
  const index = typeof detail.index === 'number' ? detail.index : fallbackIndex;
  const type = typeof detail.type === 'string' ? detail.type : 'unknown';
  const format = typeof detail.format === 'string' ? detail.format : 'unknown';

  return `${id}::${index}::${type}::${format}`;
}

function mergeReasoningDetailString(
  currentValue: unknown,
  incomingValue: unknown
): unknown {
  if (typeof incomingValue !== 'string' || incomingValue.length === 0) {
    return currentValue;
  }

  if (typeof currentValue !== 'string' || currentValue.length === 0) {
    return incomingValue;
  }

  if (incomingValue === currentValue || incomingValue.startsWith(currentValue)) {
    return incomingValue;
  }

  if (currentValue.endsWith(incomingValue)) {
    return currentValue;
  }

  return `${currentValue}${incomingValue}`;
}

function mergeReasoningDetail(
  current: ReasoningDetail,
  incoming: ReasoningDetail
): ReasoningDetail {
  const merged: ReasoningDetail = {
    ...current,
    ...incoming,
  };

  for (const field of ['text', 'summary', 'data']) {
    merged[field] = mergeReasoningDetailString(current[field], incoming[field]);
  }

  if (incoming.signature === null && typeof current.signature === 'string') {
    merged.signature = current.signature;
  }

  return merged;
}

export function mergeReasoningDetails(
  current: ReasoningDetail[],
  incoming: ReasoningDetail[]
): ReasoningDetail[] {
  const merged = [...current];
  const keyToIndex = new Map<string, number>();

  merged.forEach((detail, index) => {
    keyToIndex.set(buildReasoningDetailKey(detail, index), index);
  });

  incoming.forEach((detail, incomingIndex) => {
    const key = buildReasoningDetailKey(detail, merged.length + incomingIndex);
    const existingIndex = keyToIndex.get(key);

    if (existingIndex === undefined) {
      keyToIndex.set(key, merged.length);
      merged.push(detail);
      return;
    }

    merged[existingIndex] = mergeReasoningDetail(merged[existingIndex], detail);
  });

  return merged;
}

function normalizeReasoningDetailsForReplay(details: ReasoningDetail[]): ReasoningDetail[] {
  return mergeReasoningDetails([], details);
}

function hasRequiredReasoningSignatures(details: ReasoningDetail[]): boolean {
  return details.every((detail) => {
    if (detail.type !== 'reasoning.text') {
      return true;
    }

    return typeof detail.signature === 'string' && detail.signature.trim().length > 0;
  });
}

function getReplayableReasoningDetails(message: ChatMessage): ReasoningDetail[] | null {
  if (message.role !== 'assistant') {
    return null;
  }

  if (!Array.isArray(message.reasoningDetails) || message.reasoningDetails.length === 0) {
    return null;
  }

  if (message.streamState === 'error' || message.streamState === 'stopped') {
    return null;
  }

  const normalizedDetails = normalizeReasoningDetailsForReplay(message.reasoningDetails);
  if (!hasRequiredReasoningSignatures(normalizedDetails)) {
    return null;
  }

  return normalizedDetails;
}

export async function streamChatCompletion(
  baseUrl: string,
  apiKey: string,
  request: ChatCompletionRequest | ResponsesRequest,
  callbacks: StreamCallbacks,
  options?: StreamOptions
): Promise<void> {
  const { onMessage, onReasoning, onError, onComplete } = callbacks;

  try {
    const shouldUseServerProxy = options?.useVercelServerProxy === true;
    const requestApi = normalizeRequestApi(options?.requestApi);
    const normalizedBaseUrl = baseUrl.trim();
    const endpoint = shouldUseServerProxy
      ? VERCEL_PROXY_ENDPOINT
      : resolveApiEndpoint(normalizedBaseUrl, requestApi);

    const sendRequest = (body: ChatCompletionRequest | ResponsesRequest) => {
      const preparedRequest = withWebSearch({ ...body, stream: true }, {
        baseUrl: normalizedBaseUrl,
        requestApi,
        enabled: options?.enableWebSearch,
      });
      return fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(!shouldUseServerProxy ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(shouldUseServerProxy ? {
          baseUrl: normalizedBaseUrl,
          apiKey,
          requestApi,
          request: preparedRequest,
        } : preparedRequest),
        signal: options?.signal,
      });
    };

    let response = await sendRequest(request);
    if (
      response.status === 400
      && requestApi === 'responses'
      && typeof request.previous_response_id === 'string'
      && options?.buildStatelessResponsesRequest
    ) {
      const errorText = await response.text();
      if (!/\bprevious_response_id\b['"`]?\s+is\s+not\s+supported\b/i.test(errorText)) {
        throw new Error(`API request failed: ${response.status} ${errorText}`);
      }
      response = await sendRequest(options.buildStatelessResponsesRequest());
    }

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
    let webSearchCalls: WebSearchCall[] = [];

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
          onComplete();
          return;
        }

        if (trimmedLine.startsWith('data: ')) {
          try {
            callbacks.onRawEvent?.(trimmedLine);
            const jsonStr = trimmedLine.slice(6);
            const data: unknown = JSON.parse(jsonStr);

            if (requestApi === 'responses') {
              const updatedSearchCalls = updateWebSearchCalls(webSearchCalls, data);
              if (updatedSearchCalls !== webSearchCalls) {
                webSearchCalls = updatedSearchCalls;
                callbacks.onWebSearch?.(webSearchCalls);
              }

              const responseId = extractResponsesResponseId(data);
              if (responseId) {
                callbacks.onResponseId?.(responseId);
              }

              const streamingError = extractResponsesError(data);
              if (streamingError) {
                onError(streamingError);
                return;
              }

              const reasoningDetails = extractResponsesReasoningDetailsChunk(data);
              if (reasoningDetails.length > 0) {
                callbacks.onReasoningDetails?.(reasoningDetails);
              }

              const reasoning = extractResponsesReasoningChunk(data);
              if (reasoning) {
                onReasoning?.(reasoning);
              }

              const content = extractResponsesContentChunk(data);
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

              if (
                asRecord(data)?.type === 'response.completed'
                || asRecord(data)?.type === 'response.incomplete'
              ) {
                const citations = extractResponseCitations(asRecord(data)?.response);
                if (citations.length > 0) {
                  callbacks.onCitations?.(citations);
                }
                onComplete();
                return;
              }
            } else {
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

    onError(normalizeError(error));
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

function resolveResponsesEndpoint(baseUrl: string): string {
  let endpoint = baseUrl.replace(/\/$/, '');
  if (!endpoint.endsWith('/responses')) {
    endpoint += '/responses';
  }
  return endpoint;
}

function resolveApiEndpoint(baseUrl: string, requestApi: RequestApi): string {
  return requestApi === 'responses'
    ? resolveResponsesEndpoint(baseUrl)
    : resolveChatCompletionsEndpoint(baseUrl);
}

export function convertToOpenAIMessages(
  messages: ChatMessage[]
): Message[] {
  return messages.map(msg => {
    const imageUrls = msg.role === 'user' ? getMessageImageUrls(msg) : [];

    if (msg.role === 'user' && imageUrls.length > 0) {
      return {
        role: 'user',
        content: [
          { type: 'text' as const, text: msg.content },
          ...imageUrls.map((imageUrl) => ({
            type: 'image_url' as const,
            image_url: { url: imageUrl }
          }))
        ]
      };
    }

    const message: Message = {
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content
    };

    const replayableReasoningDetails = getReplayableReasoningDetails(msg);
    if (replayableReasoningDetails) {
      message.reasoning_details = replayableReasoningDetails;
    }

    return message;
  });
}
