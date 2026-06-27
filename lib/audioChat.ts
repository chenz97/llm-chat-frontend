import type {
  AudioRecord,
  ChatCompletionRequest,
  ChatMessage,
  Message,
  MessageContent,
  ModelParameters,
  TokenUsage,
} from '../types/index.ts';

const DEFAULT_OUTPUT_AUDIO_FORMAT: AudioRecord['format'] = 'pcm16';
const DEFAULT_OUTPUT_AUDIO_MIME_TYPE = 'audio/pcm';

export interface BuildAudioChatCompletionRequestOptions {
  model: string;
  messages: ChatMessage[];
  currentUserAudio: AudioRecord;
  systemPrompt?: string;
  parameters?: ModelParameters;
}

export interface BuildTextAudioChatCompletionRequestOptions {
  model: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  parameters?: ModelParameters;
}

export interface AudioChatCompletionResponse {
  content: string;
  audio?: AudioRecord;
  usage?: TokenUsage;
  rawResponse?: string;
  provider?: string;
}

export interface SendAudioChatCompletionOptions {
  signal?: AbortSignal;
  useVercelServerProxy?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function coerceNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function cloneParameters(parameters?: ModelParameters): Record<string, unknown> {
  if (!parameters) return {};
  return { ...parameters };
}

function resolveAudioRequestConfig(parameters: Record<string, unknown>): Record<string, unknown> {
  const audio = isRecord(parameters.audio) ? parameters.audio : {};
  return {
    voice: typeof audio.voice === 'string' && audio.voice.trim() ? audio.voice : 'cedar',
    format: typeof audio.format === 'string' && audio.format.trim() ? audio.format : DEFAULT_OUTPUT_AUDIO_FORMAT,
    ...audio,
  };
}

function resolveModalities(parameters: Record<string, unknown>): unknown {
  return Array.isArray(parameters.modalities) ? parameters.modalities : ['text', 'audio'];
}

function requiresDataUrlAudioInput(model: string): boolean {
  const normalizedModel = model.toLowerCase();
  return normalizedModel.includes('qwen') && normalizedModel.includes('omni');
}

function normalizeAudioInputData(data: string, model: string): string {
  if (
    !requiresDataUrlAudioInput(model)
    || data.startsWith('data:')
    || data.startsWith('http://')
    || data.startsWith('https://')
  ) {
    return data;
  }

  return `data:;base64,${data}`;
}

function buildAudioContent(record: AudioRecord, model: string): MessageContent {
  if (record.format !== 'wav' && record.format !== 'mp3') {
    throw new Error(`Unsupported input audio format: ${record.format}`);
  }

  return {
    type: 'input_audio',
    input_audio: {
      data: normalizeAudioInputData(record.data, model),
      format: record.format,
    },
  };
}

function buildUserAudioMessage(record: AudioRecord, model: string, content?: string): Message {
  const contentParts: MessageContent[] = [];
  if (content?.trim()) {
    contentParts.push({ type: 'text', text: content.trim() });
  }
  contentParts.push(buildAudioContent(record, model));

  return {
    role: 'user',
    content: contentParts,
  };
}

function convertStoredMessage(message: ChatMessage, model: string): Message[] {
  const audioRecords = message.audioRecords ?? [];
  const converted: Message[] = [];

  if (message.role === 'user' && audioRecords.length > 0) {
    audioRecords
      .filter((record) => (
        record.role === 'user'
        && (record.format === 'wav' || record.format === 'mp3')
      ))
      .forEach((record, index) => {
        converted.push(buildUserAudioMessage(record, model, index === 0 ? message.content : undefined));
      });
    return converted;
  }

  converted.push({
    role: message.role,
    content: message.content,
  });
  return converted;
}

export function buildAudioChatCompletionRequest({
  model,
  messages,
  currentUserAudio,
  systemPrompt,
  parameters,
}: BuildAudioChatCompletionRequestOptions): ChatCompletionRequest {
  const requestParameters = cloneParameters(parameters);
  const audio = resolveAudioRequestConfig(requestParameters);
  const modalities = resolveModalities(requestParameters);
  delete requestParameters.audio;
  delete requestParameters.modalities;

  const apiMessages: Message[] = [];
  if (systemPrompt?.trim()) {
    apiMessages.push({
      role: 'system',
      content: systemPrompt.trim(),
    });
  }

  for (const message of messages) {
    apiMessages.push(...convertStoredMessage(message, model));
  }

  apiMessages.push(buildUserAudioMessage(currentUserAudio, model));

  return {
    model,
    messages: apiMessages,
    modalities,
    audio,
    ...requestParameters,
  };
}

export function buildTextAudioChatCompletionRequest({
  model,
  messages,
  systemPrompt,
  parameters,
}: BuildTextAudioChatCompletionRequestOptions): ChatCompletionRequest {
  const requestParameters = cloneParameters(parameters);
  const audio = resolveAudioRequestConfig(requestParameters);
  const modalities = resolveModalities(requestParameters);
  delete requestParameters.audio;
  delete requestParameters.modalities;

  const apiMessages: Message[] = [];
  if (systemPrompt?.trim()) {
    apiMessages.push({
      role: 'system',
      content: systemPrompt.trim(),
    });
  }

  for (const message of messages) {
    apiMessages.push(...convertStoredMessage(message, model));
  }

  return {
    model,
    messages: apiMessages,
    modalities,
    audio,
    ...requestParameters,
  };
}

function extractUsageFromResponse(response: unknown): TokenUsage | undefined {
  const record = isRecord(response) ? response : null;
  const usage = isRecord(record?.usage) ? record.usage : null;
  if (!usage) return undefined;

  const promptTokensDetails = isRecord(usage.prompt_tokens_details)
    ? usage.prompt_tokens_details
    : undefined;
  const completionTokensDetails = isRecord(usage.completion_tokens_details)
    ? usage.completion_tokens_details
    : undefined;

  return {
    prompt_tokens: coerceNumber(usage.prompt_tokens),
    reasoning_tokens: coerceNumber(usage.reasoning_tokens ?? completionTokensDetails?.reasoning_tokens),
    completion_tokens: coerceNumber(usage.completion_tokens),
    cached_tokens: coerceNumber(usage.cached_tokens ?? promptTokensDetails?.cached_tokens),
    cache_read_input_tokens: coerceNumber(usage.cache_read_input_tokens),
    cache_creation_input_tokens: coerceNumber(usage.cache_creation_input_tokens),
  };
}

export function extractAudioChatCompletionResponse(
  response: unknown,
  outputFormat: AudioRecord['format'] = DEFAULT_OUTPUT_AUDIO_FORMAT
): AudioChatCompletionResponse {
  const record = isRecord(response) ? response : {};
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = isRecord(choices[0]) ? choices[0] : {};
  const message = isRecord(firstChoice.message) ? firstChoice.message : {};
  const audio = isRecord(message.audio) ? message.audio : undefined;
  const content = asString(message.content)
    ?? asString(audio?.transcript)
    ?? '';
  const audioData = asString(audio?.data);
  const providerAudioId = asString(audio?.id);
  const rawResponse = JSON.stringify(response, null, 2);

  return {
    content,
    ...(audioData
      ? {
        audio: {
          id: `audio-${Date.now()}`,
          role: 'assistant',
          mimeType: outputFormat === 'mp3'
            ? 'audio/mpeg'
            : (outputFormat === 'wav' ? 'audio/wav' : DEFAULT_OUTPUT_AUDIO_MIME_TYPE),
          format: outputFormat,
          data: audioData,
          providerAudioId,
          createdAt: Date.now(),
        },
      }
      : {}),
    usage: extractUsageFromResponse(response),
    rawResponse,
  };
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

function resolveOutputFormat(request: ChatCompletionRequest): AudioRecord['format'] {
  const audio = isRecord(request.audio) ? request.audio : {};
  if (audio.format === 'mp3' || audio.format === 'wav' || audio.format === 'pcm16') {
    return audio.format;
  }
  return DEFAULT_OUTPUT_AUDIO_FORMAT;
}

export async function sendAudioChatCompletion(
  baseUrl: string,
  apiKey: string,
  request: ChatCompletionRequest,
  options?: SendAudioChatCompletionOptions
): Promise<AudioChatCompletionResponse> {
  const response = options?.useVercelServerProxy === true
    ? await fetch('/api/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        baseUrl,
        apiKey,
        requestApi: 'chat_completions',
        stream: true,
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

  return readAudioChatCompletionStream(response, resolveOutputFormat(request));
}

function extractTextValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(extractTextValue).join('');
  return '';
}

function mergeUsage(current: TokenUsage | undefined, next: TokenUsage | undefined): TokenUsage | undefined {
  if (!next) return current;
  return { ...current, ...next };
}

function extractStreamingError(data: unknown): Error | null {
  const record = isRecord(data) ? data : null;
  const error = isRecord(record?.error) ? record.error : null;
  if (!error) return null;
  return new Error(asString(error.message) ?? 'Audio stream failed');
}

function collectAudioDelta(
  data: unknown,
  state: {
    content: string;
    audioTranscript: string;
    audioData: string;
    providerAudioId?: string;
    provider?: string;
    usage?: TokenUsage;
  }
) {
  const record = isRecord(data) ? data : {};
  if (typeof record.provider === 'string') {
    state.provider = record.provider;
  }

  state.usage = mergeUsage(state.usage, extractUsageFromResponse(data));

  const choices = Array.isArray(record.choices) ? record.choices : [];
  for (const choiceValue of choices) {
    const choice = isRecord(choiceValue) ? choiceValue : {};
    const delta = isRecord(choice.delta) ? choice.delta : {};
    const message = isRecord(choice.message) ? choice.message : {};
    const audio = isRecord(delta.audio)
      ? delta.audio
      : (isRecord(message.audio) ? message.audio : undefined);

    state.content += extractTextValue(delta.content ?? message.content);
    state.audioTranscript += extractTextValue(audio?.transcript);
    state.audioData += extractTextValue(audio?.data);
    const audioId = asString(audio?.id);
    if (audioId) {
      state.providerAudioId = audioId;
    }
  }
}

export async function readAudioChatCompletionStream(
  response: Response,
  outputFormat: AudioRecord['format'] = DEFAULT_OUTPUT_AUDIO_FORMAT
): Promise<AudioChatCompletionResponse> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  const rawLines: string[] = [];
  const state = {
    content: '',
    audioTranscript: '',
    audioData: '',
    providerAudioId: undefined as string | undefined,
    provider: undefined as string | undefined,
    usage: undefined as TokenUsage | undefined,
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      rawLines.push(trimmed);
      if (trimmed === 'data: [DONE]') {
        continue;
      }
      if (!trimmed.startsWith('data: ')) continue;

      const data: unknown = JSON.parse(trimmed.slice(6));
      const streamingError = extractStreamingError(data);
      if (streamingError) {
        throw streamingError;
      }
      collectAudioDelta(data, state);
    }
  }

  const content = state.content || state.audioTranscript;
  return {
    content,
    ...(state.audioData
      ? {
        audio: {
          id: `audio-${Date.now()}`,
          role: 'assistant',
          mimeType: outputFormat === 'mp3'
            ? 'audio/mpeg'
            : (outputFormat === 'wav' ? 'audio/wav' : DEFAULT_OUTPUT_AUDIO_MIME_TYPE),
          format: outputFormat,
          data: state.audioData,
          providerAudioId: state.providerAudioId,
          createdAt: Date.now(),
        },
      }
      : {}),
    usage: state.usage,
    rawResponse: rawLines.join('\n'),
    provider: state.provider,
  };
}
