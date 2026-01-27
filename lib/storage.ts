import { ApiConfig, AssistantPreset, Conversation, ChatMessage } from '@/types';

const STORAGE_KEYS = {
  API_CONFIGS: 'llm_chat_api_configs',
  ASSISTANT_PRESETS: 'llm_chat_assistant_presets',
  DEFAULT_PRESET_ID: 'llm_chat_default_preset_id',
} as const;

const DB_CONFIG = {
  NAME: 'llm_chat_db',
  VERSION: 1,
} as const;

const DB_STORES = {
  CONVERSATIONS: 'conversations',
  META: 'meta',
} as const;

const META_KEYS = {
  CURRENT_CONVERSATION_ID: 'current_conversation_id',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

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

function isIndexedDbAvailable(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function transactionComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
  });
}

function openDb(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error('IndexedDB is not available'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_CONFIG.NAME, DB_CONFIG.VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORES.CONVERSATIONS)) {
        db.createObjectStore(DB_STORES.CONVERSATIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(DB_STORES.META)) {
        db.createObjectStore(DB_STORES.META, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
  });

  return dbPromise;
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
export async function getConversations(): Promise<Conversation[]> {
  if (!isIndexedDbAvailable()) return [];

  try {
    const db = await openDb();
    const tx = db.transaction(DB_STORES.CONVERSATIONS, 'readonly');
    const store = tx.objectStore(DB_STORES.CONVERSATIONS);
    const result = await requestToPromise(store.getAll());
    await transactionComplete(tx);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Error loading conversations from IndexedDB:', error);
    return [];
  }
}

export async function saveConversation(conversation: Conversation): Promise<boolean> {
  if (!isIndexedDbAvailable()) return false;

  try {
    const db = await openDb();
    const tx = db.transaction(DB_STORES.CONVERSATIONS, 'readwrite');
    const store = tx.objectStore(DB_STORES.CONVERSATIONS);

    const payload = {
      ...conversation,
      updatedAt: Date.now(),
    };

    store.put(payload);
    await transactionComplete(tx);
    return true;
  } catch (error) {
    console.error('Error saving conversation to IndexedDB:', error);
    return false;
  }
}

export async function updateConversationMessages(
  conversationId: string,
  messages: ChatMessage[]
): Promise<boolean> {
  if (!isIndexedDbAvailable()) return false;

  try {
    const db = await openDb();
    const tx = db.transaction(DB_STORES.CONVERSATIONS, 'readwrite');
    const store = tx.objectStore(DB_STORES.CONVERSATIONS);
    const existing = await requestToPromise<Conversation | undefined>(store.get(conversationId));

    if (!existing) {
      await transactionComplete(tx);
      return false;
    }

    store.put({
      ...existing,
      messages,
    });
    await transactionComplete(tx);
    return true;
  } catch (error) {
    console.error('Error updating conversation messages in IndexedDB:', error);
    return false;
  }
}

export async function deleteConversation(id: string): Promise<void> {
  if (!isIndexedDbAvailable()) return;

  try {
    const currentId = await getCurrentConversationId();
    const db = await openDb();
    const tx = db.transaction(DB_STORES.CONVERSATIONS, 'readwrite');
    const store = tx.objectStore(DB_STORES.CONVERSATIONS);
    store.delete(id);
    await transactionComplete(tx);

    if (currentId === id) {
      await setCurrentConversationId(null);
    }
  } catch (error) {
    console.error('Error deleting conversation from IndexedDB:', error);
  }
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  if (!isIndexedDbAvailable()) return undefined;

  try {
    const db = await openDb();
    const tx = db.transaction(DB_STORES.CONVERSATIONS, 'readonly');
    const store = tx.objectStore(DB_STORES.CONVERSATIONS);
    const result = await requestToPromise<Conversation | undefined>(store.get(id));
    await transactionComplete(tx);
    return result;
  } catch (error) {
    console.error('Error loading conversation from IndexedDB:', error);
    return undefined;
  }
}

// Current Conversation
export async function getCurrentConversationId(): Promise<string | null> {
  if (!isIndexedDbAvailable()) return null;

  try {
    const db = await openDb();
    const tx = db.transaction(DB_STORES.META, 'readonly');
    const store = tx.objectStore(DB_STORES.META);
    const entry = await requestToPromise<{ key: string; value: string } | undefined>(
      store.get(META_KEYS.CURRENT_CONVERSATION_ID)
    );
    await transactionComplete(tx);
    return entry?.value ?? null;
  } catch (error) {
    console.error('Error loading current conversation id from IndexedDB:', error);
    return null;
  }
}

export async function setCurrentConversationId(id: string | null): Promise<void> {
  if (!isIndexedDbAvailable()) return;

  try {
    const db = await openDb();
    const tx = db.transaction(DB_STORES.META, 'readwrite');
    const store = tx.objectStore(DB_STORES.META);

    if (id === null) {
      store.delete(META_KEYS.CURRENT_CONVERSATION_ID);
    } else {
      store.put({ key: META_KEYS.CURRENT_CONVERSATION_ID, value: id });
    }

    await transactionComplete(tx);
  } catch (error) {
    console.error('Error saving current conversation id to IndexedDB:', error);
  }
}

// Utility function to generate unique IDs
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
