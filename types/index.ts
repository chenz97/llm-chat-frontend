// OpenAI API Types
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string | MessageContent[];
  reasoning_details?: ReasoningDetail[];
}

export interface MessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: Message[];
  stream?: boolean;
  [key: string]: unknown; // For additional model parameters
}

export interface ReasoningDetail {
  [key: string]: unknown;
}

export interface ProviderMetadata {
  provider?: string;
  cacheControl?: unknown;
  usageDetails?: Record<string, unknown>;
}

// App Types
export interface ApiConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  createdAt: number;
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
  useVercelServerProxy?: boolean;
  createdAt: number;
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
  imageUrl?: string; // For user uploaded images
  rawResponse?: string;
  usage?: TokenUsage;
  providerMetadata?: ProviderMetadata;
  timestamp: number;
  firstTokenTimestamp?: number;
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

export interface SettingsExport {
  version: 1;
  exportedAt: number;
  apiConfigs: ApiConfig[];
  assistantPresets: AssistantPreset[];
  defaultPresetId: string | null;
}
