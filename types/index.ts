// OpenAI API Types
export type RequestApi = 'chat_completions' | 'responses';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string | MessageContent[];
  audio?: {
    id: string;
  };
  reasoning_details?: ReasoningDetail[];
}

export interface MessageContent {
  type: 'text' | 'image_url' | 'input_audio';
  text?: string;
  image_url?: {
    url: string;
  };
  input_audio?: {
    data: string;
    format: 'wav' | 'mp3';
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: Message[];
  stream?: boolean;
  [key: string]: unknown; // For additional model parameters
}

export interface ResponsesInputTextContent {
  type: 'input_text';
  text: string;
}

export interface ResponsesInputImageContent {
  type: 'input_image';
  image_url: string;
}

export type ResponsesInputContent = ResponsesInputTextContent | ResponsesInputImageContent;

export interface ResponsesInputMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ResponsesInputContent[];
}

export interface ResponsesRequest {
  model: string;
  input: ResponsesInputMessage[];
  instructions?: string;
  previous_response_id?: string;
  stream?: boolean;
  [key: string]: unknown;
}

export interface ReasoningDetail {
  [key: string]: unknown;
}

export interface ProviderMetadata {
  provider?: string;
  cacheControl?: unknown;
  usageDetails?: Record<string, unknown>;
}

export interface AudioRecord {
  id: string;
  role: 'user' | 'assistant';
  mimeType: string;
  format: 'wav' | 'mp3' | 'pcm16';
  data: string;
  durationMs?: number;
  providerAudioId?: string;
  createdAt: number;
}

// App Types
export interface ApiConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  createdAt: number;
  sortOrder?: number; // User-defined list position; lower comes first
}

export interface ModelParameters {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  [key: string]: unknown;
}

export interface AssistantPreset {
  id: string;
  name: string;
  apiConfigId?: string;
  modelId: string;
  systemPrompt: string;
  parameters: ModelParameters;
  requestApi?: RequestApi;
  enableWebSearch?: boolean;
  useVercelServerProxy?: boolean;
  isVisible?: boolean;
  createdAt: number;
  sortOrder?: number; // User-defined list position; lower comes first
}

export interface TokenUsage {
  prompt_tokens?: number;
  reasoning_tokens?: number;
  completion_tokens?: number;
  cached_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface ChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  reasoning?: string;
  reasoningDetails?: ReasoningDetail[];
  responseId?: string;
  urlCitations?: UrlCitation[];
  webSearchCalls?: WebSearchCall[];
  audioRecords?: AudioRecord[];
  imageUrls?: string[]; // For user uploaded images
  imageUrl?: string; // Legacy single-image fallback for older conversations
  rawResponse?: string;
  usage?: TokenUsage;
  providerMetadata?: ProviderMetadata;
  streamState?: 'streaming' | 'error' | 'stopped';
  streamError?: string;
  timestamp: number;
  firstTokenTimestamp?: number;
}

export interface UrlCitation {
  startIndex: number;
  endIndex: number;
  url: string;
  title: string;
}

export interface WebSearchCall {
  id: string;
  status: 'in_progress' | 'searching' | 'completed' | 'failed' | 'stopped' | 'incomplete';
  action?: 'search' | 'open_page' | 'find_in_page';
  queries?: string[];
  url?: string;
  pattern?: string;
}

export interface Conversation {
  id: string;
  title: string;
  apiConfigId: string;
  assistantPresetId?: string;
  modelIdOverride?: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export type ConversationSummary = Omit<Conversation, 'messages'>;

export interface SettingsExport {
  version: 1;
  exportedAt: number;
  apiConfigs: ApiConfig[];
  assistantPresets: AssistantPreset[];
  defaultPresetId: string | null;
}

export interface SettingsSyncConfig {
  githubToken: string;
  repository: string;
  path: string;
}

export interface NormalizedSettingsImport {
  apiConfigs: ApiConfig[];
  assistantPresets: AssistantPreset[];
  defaultPresetId: string | null;
}
