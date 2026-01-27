import { ApiConfig, AssistantPreset, Conversation, ChatMessage } from '@/types';

const STORAGE_KEYS = {
  API_CONFIGS: 'llm_chat_api_configs',
  ASSISTANT_PRESETS: 'llm_chat_assistant_presets',
  CONVERSATIONS: 'llm_chat_conversations',
  CURRENT_CONVERSATION_ID: 'llm_chat_current_conversation_id',
  DEFAULT_PRESET_ID: 'llm_chat_default_preset_id',
} as const;

// Generic storage helpers
function getFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;

  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error(`Error reading from localStorage (${key}):`, error);
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, value: T): boolean {
  if (typeof window === 'undefined') return false;

  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Error saving to localStorage (${key}):`, error);
    return false;
  }
}

// API Configs
export function getApiConfigs(): ApiConfig[] {
  return getFromStorage<ApiConfig[]>(STORAGE_KEYS.API_CONFIGS, []);
}

export function setApiConfigs(configs: ApiConfig[]): void {
  saveToStorage(STORAGE_KEYS.API_CONFIGS, configs);
}

export function saveApiConfig(config: ApiConfig): void {
  const configs = getApiConfigs();
  const index = configs.findIndex(c => c.id === config.id);

  if (index >= 0) {
    configs[index] = config;
  } else {
    configs.push(config);
  }

  saveToStorage(STORAGE_KEYS.API_CONFIGS, configs);
}

export function deleteApiConfig(id: string): void {
  const configs = getApiConfigs().filter(c => c.id !== id);
  saveToStorage(STORAGE_KEYS.API_CONFIGS, configs);
}

export function getApiConfig(id: string): ApiConfig | undefined {
  return getApiConfigs().find(c => c.id === id);
}

// Assistant Presets
export function getAssistantPresets(): AssistantPreset[] {
  return getFromStorage<AssistantPreset[]>(STORAGE_KEYS.ASSISTANT_PRESETS, []);
}

export function setAssistantPresets(presets: AssistantPreset[]): void {
  saveToStorage(STORAGE_KEYS.ASSISTANT_PRESETS, presets);
}

export function saveAssistantPreset(preset: AssistantPreset): void {
  const presets = getAssistantPresets();
  const index = presets.findIndex(p => p.id === preset.id);

  if (index >= 0) {
    presets[index] = preset;
  } else {
    presets.push(preset);
  }

  saveToStorage(STORAGE_KEYS.ASSISTANT_PRESETS, presets);
}

export function deleteAssistantPreset(id: string): void {
  const presets = getAssistantPresets().filter(p => p.id !== id);
  saveToStorage(STORAGE_KEYS.ASSISTANT_PRESETS, presets);

  // Clear default if deleting default preset
  if (getDefaultPresetId() === id) {
    setDefaultPresetId(null);
  }
}

export function getAssistantPreset(id: string): AssistantPreset | undefined {
  return getAssistantPresets().find(p => p.id === id);
}

// Default Preset
export function getDefaultPresetId(): string | null {
  return getFromStorage<string | null>(STORAGE_KEYS.DEFAULT_PRESET_ID, null);
}

export function setDefaultPresetId(id: string | null): void {
  saveToStorage(STORAGE_KEYS.DEFAULT_PRESET_ID, id);
}

// Conversations
export function getConversations(): Conversation[] {
  return getFromStorage<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []);
}

function saveConversationsWithFallback(
  conversations: Conversation[],
  preserveId?: string
): boolean {
  if (saveToStorage(STORAGE_KEYS.CONVERSATIONS, conversations)) {
    return true;
  }

  let working = [...conversations];
  const prunable = working
    .filter(c => c.id !== preserveId)
    .sort((a, b) => a.updatedAt - b.updatedAt);

  for (const conv of prunable) {
    working = working.filter(c => c.id !== conv.id);
    if (saveToStorage(STORAGE_KEYS.CONVERSATIONS, working)) {
      console.warn('Storage quota exceeded; removed an older conversation to free space.');
      return true;
    }
  }

  if (preserveId) {
    const preserved = conversations.find(c => c.id === preserveId);
    const fallback = preserved ? [preserved] : [];
    if (saveToStorage(STORAGE_KEYS.CONVERSATIONS, fallback)) {
      console.warn('Storage quota exceeded; kept only the active conversation.');
      return true;
    }
  }

  console.error('Failed to save conversations: localStorage quota exceeded.');
  return false;
}

export function saveConversation(conversation: Conversation): boolean {
  const conversations = getConversations();
  const index = conversations.findIndex(c => c.id === conversation.id);

  conversation.updatedAt = Date.now();

  if (index >= 0) {
    conversations[index] = conversation;
  } else {
    conversations.push(conversation);
  }

  return saveConversationsWithFallback(conversations, conversation.id);
}

export function updateConversationMessages(
  conversationId: string,
  messages: ChatMessage[]
): boolean {
  const conversations = getConversations();
  const index = conversations.findIndex(c => c.id === conversationId);

  if (index < 0) return false;

  conversations[index] = {
    ...conversations[index],
    messages,
  };

  return saveConversationsWithFallback(conversations, conversationId);
}

export function deleteConversation(id: string): void {
  const conversations = getConversations().filter(c => c.id !== id);
  saveToStorage(STORAGE_KEYS.CONVERSATIONS, conversations);

  // Clear current conversation if it was deleted
  if (getCurrentConversationId() === id) {
    setCurrentConversationId(null);
  }
}

export function getConversation(id: string): Conversation | undefined {
  return getConversations().find(c => c.id === id);
}

// Current Conversation
export function getCurrentConversationId(): string | null {
  return getFromStorage<string | null>(STORAGE_KEYS.CURRENT_CONVERSATION_ID, null);
}

export function setCurrentConversationId(id: string | null): void {
  saveToStorage(STORAGE_KEYS.CURRENT_CONVERSATION_ID, id);
}

// Utility function to generate unique IDs
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
