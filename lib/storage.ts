import { ApiConfig, AssistantPreset, Conversation, ChatMessage } from '@/types';

const STORAGE_KEYS = {
  API_CONFIGS: 'llm_chat_api_configs',
  ASSISTANT_PRESETS: 'llm_chat_assistant_presets',
  ASSISTANT_PRESETS_MIGRATION_NOTICE: 'llm_chat_assistant_presets_migration_notice',
  DEFAULT_PRESET_ID: 'llm_chat_default_preset_id',
} as const;

const DB_CONFIG = {
  NAME: 'llm_chat_db',
  VERSION: 3,
} as const;

const DB_OPEN_TIMEOUT = 2000;

const DB_STORES = {
  API_CONFIGS: 'api_configs',
  CONVERSATIONS: 'conversations',
  ASSISTANT_PRESETS: 'assistant_presets',
  META: 'meta',
} as const;

const META_KEYS = {
  CURRENT_CONVERSATION_ID: 'current_conversation_id',
  DEFAULT_PRESET_ID: 'default_preset_id',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;
let didNotifyAssistantPresetsMigration = false;

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

  const openWithVersion = (version?: number) => new Promise<IDBDatabase>((resolve, reject) => {
    const request = version === undefined
      ? indexedDB.open(DB_CONFIG.NAME)
      : indexedDB.open(DB_CONFIG.NAME, version);
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('IndexedDB open timed out'));
    }, DB_OPEN_TIMEOUT);

    const finalize = (db?: IDBDatabase) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (db) {
        db.onversionchange = () => db.close();
      }
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORES.API_CONFIGS)) {
        db.createObjectStore(DB_STORES.API_CONFIGS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(DB_STORES.CONVERSATIONS)) {
        db.createObjectStore(DB_STORES.CONVERSATIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(DB_STORES.ASSISTANT_PRESETS)) {
        db.createObjectStore(DB_STORES.ASSISTANT_PRESETS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(DB_STORES.META)) {
        db.createObjectStore(DB_STORES.META, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      finalize(db);
      resolve(db);
    };
    request.onerror = () => {
      finalize();
      reject(request.error || new Error('IndexedDB open failed'));
    };
    request.onblocked = () => {
      finalize();
      reject(new Error('IndexedDB open blocked'));
    };
  });

  dbPromise = (async () => {
    try {
      return await openWithVersion(DB_CONFIG.VERSION);
    } catch (error) {
      try {
        return await openWithVersion();
      } catch (fallbackError) {
        dbPromise = null;
        throw fallbackError;
      }
    }
  })();

  return dbPromise;
}

// API Configs
function clearApiConfigsStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEYS.API_CONFIGS);
  } catch (error) {
    console.error(`Error clearing localStorage (${STORAGE_KEYS.API_CONFIGS}):`, error);
  }
}

async function migrateApiConfigsToStore(store: IDBObjectStore): Promise<boolean> {
  const fallback = getFromStorage<ApiConfig[]>(STORAGE_KEYS.API_CONFIGS, []);
  if (fallback.length === 0) return false;

  const count = await requestToPromise(store.count());
  if (count > 0) return false;

  fallback.forEach((config) => {
    store.put(config);
  });

  return true;
}

export async function getApiConfigs(): Promise<ApiConfig[]> {
  const fallback = getFromStorage<ApiConfig[]>(STORAGE_KEYS.API_CONFIGS, []);

  if (!isIndexedDbAvailable()) return fallback;

  try {
    const db = await openDb();
    if (!hasStore(db, DB_STORES.API_CONFIGS)) {
      return fallback;
    }
    const tx = db.transaction(DB_STORES.API_CONFIGS, 'readonly');
    const store = tx.objectStore(DB_STORES.API_CONFIGS);
    const result = await requestToPromise(store.getAll());
    await transactionComplete(tx);
    const configs = Array.isArray(result) ? result : [];

    if (configs.length > 0) {
      return configs;
    }

    if (fallback.length > 0) {
      await setApiConfigs(fallback);
    }

    return fallback;
  } catch (error) {
    console.error('Error loading API configs from IndexedDB:', error);
    return fallback;
  }
}

export async function setApiConfigs(configs: ApiConfig[]): Promise<boolean> {
  if (!isIndexedDbAvailable()) {
    return saveToStorage(STORAGE_KEYS.API_CONFIGS, configs);
  }

  try {
    const db = await openDb();
    if (!hasStore(db, DB_STORES.API_CONFIGS)) {
      return saveToStorage(STORAGE_KEYS.API_CONFIGS, configs);
    }
    const tx = db.transaction(DB_STORES.API_CONFIGS, 'readwrite');
    const store = tx.objectStore(DB_STORES.API_CONFIGS);

    store.clear();
    configs.forEach((config) => {
      store.put(config);
    });

    await transactionComplete(tx);
    clearApiConfigsStorage();
    return true;
  } catch (error) {
    console.error('Error saving API configs to IndexedDB:', error);
    return saveToStorage(STORAGE_KEYS.API_CONFIGS, configs);
  }
}

export async function saveApiConfig(config: ApiConfig): Promise<boolean> {
  if (!isIndexedDbAvailable()) {
    const configs = getFromStorage<ApiConfig[]>(STORAGE_KEYS.API_CONFIGS, []);
    const index = configs.findIndex(c => c.id === config.id);

    if (index >= 0) {
      configs[index] = config;
    } else {
      configs.push(config);
    }

    return saveToStorage(STORAGE_KEYS.API_CONFIGS, configs);
  }

  try {
    const db = await openDb();
    if (!hasStore(db, DB_STORES.API_CONFIGS)) {
      const configs = getFromStorage<ApiConfig[]>(STORAGE_KEYS.API_CONFIGS, []);
      const index = configs.findIndex(c => c.id === config.id);

      if (index >= 0) {
        configs[index] = config;
      } else {
        configs.push(config);
      }

      return saveToStorage(STORAGE_KEYS.API_CONFIGS, configs);
    }
    const tx = db.transaction(DB_STORES.API_CONFIGS, 'readwrite');
    const store = tx.objectStore(DB_STORES.API_CONFIGS);
    await migrateApiConfigsToStore(store);
    store.put(config);
    await transactionComplete(tx);
    clearApiConfigsStorage();
    return true;
  } catch (error) {
    console.error('Error saving API config to IndexedDB:', error);
    const configs = getFromStorage<ApiConfig[]>(STORAGE_KEYS.API_CONFIGS, []);
    const index = configs.findIndex(c => c.id === config.id);

    if (index >= 0) {
      configs[index] = config;
    } else {
      configs.push(config);
    }

    return saveToStorage(STORAGE_KEYS.API_CONFIGS, configs);
  }
}

export async function deleteApiConfig(id: string): Promise<boolean> {
  let removed = false;

  if (!isIndexedDbAvailable()) {
    const configs = getFromStorage<ApiConfig[]>(STORAGE_KEYS.API_CONFIGS, [])
      .filter(c => c.id !== id);
    removed = saveToStorage(STORAGE_KEYS.API_CONFIGS, configs);
  } else {
    try {
      const db = await openDb();
      if (!hasStore(db, DB_STORES.API_CONFIGS)) {
        const configs = getFromStorage<ApiConfig[]>(STORAGE_KEYS.API_CONFIGS, [])
          .filter(c => c.id !== id);
        removed = saveToStorage(STORAGE_KEYS.API_CONFIGS, configs);
        return removed;
      }
      const tx = db.transaction(DB_STORES.API_CONFIGS, 'readwrite');
      const store = tx.objectStore(DB_STORES.API_CONFIGS);
      await migrateApiConfigsToStore(store);
      store.delete(id);
      await transactionComplete(tx);
      clearApiConfigsStorage();
      removed = true;
    } catch (error) {
      console.error('Error deleting API config from IndexedDB:', error);
      const configs = getFromStorage<ApiConfig[]>(STORAGE_KEYS.API_CONFIGS, [])
        .filter(c => c.id !== id);
      removed = saveToStorage(STORAGE_KEYS.API_CONFIGS, configs);
    }
  }

  return removed;
}

export async function getApiConfig(id: string): Promise<ApiConfig | undefined> {
  if (!isIndexedDbAvailable()) {
    return getFromStorage<ApiConfig[]>(STORAGE_KEYS.API_CONFIGS, [])
      .find(c => c.id === id);
  }

  try {
    const db = await openDb();
    if (!hasStore(db, DB_STORES.API_CONFIGS)) {
      return getFromStorage<ApiConfig[]>(STORAGE_KEYS.API_CONFIGS, [])
        .find(c => c.id === id);
    }
    const tx = db.transaction(DB_STORES.API_CONFIGS, 'readonly');
    const store = tx.objectStore(DB_STORES.API_CONFIGS);
    const result = await requestToPromise<ApiConfig | undefined>(store.get(id));
    await transactionComplete(tx);
    if (result) return result;

    const fallback = getFromStorage<ApiConfig[]>(STORAGE_KEYS.API_CONFIGS, []);
    if (fallback.length > 0) {
      await setApiConfigs(fallback);
    }
    return fallback.find(c => c.id === id);
  } catch (error) {
    console.error('Error loading API config from IndexedDB:', error);
    return getFromStorage<ApiConfig[]>(STORAGE_KEYS.API_CONFIGS, [])
      .find(c => c.id === id);
  }
}

// Assistant Presets
function clearAssistantPresetsStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEYS.ASSISTANT_PRESETS);
  } catch (error) {
    console.error(`Error clearing localStorage (${STORAGE_KEYS.ASSISTANT_PRESETS}):`, error);
  }
}

function clearDefaultPresetStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEYS.DEFAULT_PRESET_ID);
  } catch (error) {
    console.error(`Error clearing localStorage (${STORAGE_KEYS.DEFAULT_PRESET_ID}):`, error);
  }
}

function markAssistantPresetsMigrated(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEYS.ASSISTANT_PRESETS_MIGRATION_NOTICE, '1');
  } catch (error) {
    console.error('Error saving assistant preset migration notice:', error);
  }

  if (!didNotifyAssistantPresetsMigration) {
    didNotifyAssistantPresetsMigration = true;
    window.dispatchEvent(new Event('assistantPresetsMigrated'));
  }
}

async function migrateAssistantPresetsToStore(store: IDBObjectStore): Promise<boolean> {
  const fallback = getFromStorage<AssistantPreset[]>(STORAGE_KEYS.ASSISTANT_PRESETS, []);
  if (fallback.length === 0) return false;

  const count = await requestToPromise(store.count());
  if (count > 0) return false;

  fallback.forEach((preset) => {
    store.put(preset);
  });

  return true;
}

function hasStore(db: IDBDatabase, storeName: string): boolean {
  return db.objectStoreNames.contains(storeName);
}

export async function getAssistantPresets(): Promise<AssistantPreset[]> {
  const fallback = getFromStorage<AssistantPreset[]>(STORAGE_KEYS.ASSISTANT_PRESETS, []);

  if (!isIndexedDbAvailable()) return fallback;

  try {
    const db = await openDb();
    if (!hasStore(db, DB_STORES.ASSISTANT_PRESETS)) {
      return fallback;
    }
    const tx = db.transaction(DB_STORES.ASSISTANT_PRESETS, 'readonly');
    const store = tx.objectStore(DB_STORES.ASSISTANT_PRESETS);
    const result = await requestToPromise(store.getAll());
    await transactionComplete(tx);
    const presets = Array.isArray(result) ? result : [];

    if (presets.length > 0) {
      return presets;
    }

    if (fallback.length > 0) {
      const migrated = await setAssistantPresets(fallback);
      if (migrated) {
        markAssistantPresetsMigrated();
      }
    }

    return fallback;
  } catch (error) {
    console.error('Error loading assistant presets from IndexedDB:', error);
    return fallback;
  }
}

export async function setAssistantPresets(presets: AssistantPreset[]): Promise<boolean> {
  if (!isIndexedDbAvailable()) {
    return saveToStorage(STORAGE_KEYS.ASSISTANT_PRESETS, presets);
  }

  try {
    const db = await openDb();
    if (!hasStore(db, DB_STORES.ASSISTANT_PRESETS)) {
      return saveToStorage(STORAGE_KEYS.ASSISTANT_PRESETS, presets);
    }
    const tx = db.transaction(DB_STORES.ASSISTANT_PRESETS, 'readwrite');
    const store = tx.objectStore(DB_STORES.ASSISTANT_PRESETS);

    store.clear();
    presets.forEach((preset) => {
      store.put(preset);
    });

    await transactionComplete(tx);
    clearAssistantPresetsStorage();
    return true;
  } catch (error) {
    console.error('Error saving assistant presets to IndexedDB:', error);
    return saveToStorage(STORAGE_KEYS.ASSISTANT_PRESETS, presets);
  }
}

export async function saveAssistantPreset(preset: AssistantPreset): Promise<boolean> {
  if (!isIndexedDbAvailable()) {
    const presets = getFromStorage<AssistantPreset[]>(STORAGE_KEYS.ASSISTANT_PRESETS, []);
    const index = presets.findIndex(p => p.id === preset.id);

    if (index >= 0) {
      presets[index] = preset;
    } else {
      presets.push(preset);
    }

    return saveToStorage(STORAGE_KEYS.ASSISTANT_PRESETS, presets);
  }

  try {
    const db = await openDb();
    if (!hasStore(db, DB_STORES.ASSISTANT_PRESETS)) {
      const presets = getFromStorage<AssistantPreset[]>(STORAGE_KEYS.ASSISTANT_PRESETS, []);
      const index = presets.findIndex(p => p.id === preset.id);

      if (index >= 0) {
        presets[index] = preset;
      } else {
        presets.push(preset);
      }

      return saveToStorage(STORAGE_KEYS.ASSISTANT_PRESETS, presets);
    }
    const tx = db.transaction(DB_STORES.ASSISTANT_PRESETS, 'readwrite');
    const store = tx.objectStore(DB_STORES.ASSISTANT_PRESETS);
    const didMigrate = await migrateAssistantPresetsToStore(store);
    store.put(preset);
    await transactionComplete(tx);
    clearAssistantPresetsStorage();
    if (didMigrate) {
      markAssistantPresetsMigrated();
    }
    return true;
  } catch (error) {
    console.error('Error saving assistant preset to IndexedDB:', error);
    const presets = getFromStorage<AssistantPreset[]>(STORAGE_KEYS.ASSISTANT_PRESETS, []);
    const index = presets.findIndex(p => p.id === preset.id);

    if (index >= 0) {
      presets[index] = preset;
    } else {
      presets.push(preset);
    }

    return saveToStorage(STORAGE_KEYS.ASSISTANT_PRESETS, presets);
  }
}

export async function deleteAssistantPreset(id: string): Promise<boolean> {
  let removed = false;

  if (!isIndexedDbAvailable()) {
    const presets = getFromStorage<AssistantPreset[]>(STORAGE_KEYS.ASSISTANT_PRESETS, [])
      .filter(p => p.id !== id);
    removed = saveToStorage(STORAGE_KEYS.ASSISTANT_PRESETS, presets);
  } else {
    try {
      const db = await openDb();
      if (!hasStore(db, DB_STORES.ASSISTANT_PRESETS)) {
        const presets = getFromStorage<AssistantPreset[]>(STORAGE_KEYS.ASSISTANT_PRESETS, [])
          .filter(p => p.id !== id);
        removed = saveToStorage(STORAGE_KEYS.ASSISTANT_PRESETS, presets);
        if (removed) {
          const defaultPresetId = await getDefaultPresetId();
          if (defaultPresetId === id) {
            await setDefaultPresetId(null);
          }
        }
        return removed;
      }
      const tx = db.transaction(DB_STORES.ASSISTANT_PRESETS, 'readwrite');
      const store = tx.objectStore(DB_STORES.ASSISTANT_PRESETS);
      const didMigrate = await migrateAssistantPresetsToStore(store);
      store.delete(id);
      await transactionComplete(tx);
      clearAssistantPresetsStorage();
      if (didMigrate) {
        markAssistantPresetsMigrated();
      }
      removed = true;
    } catch (error) {
      console.error('Error deleting assistant preset from IndexedDB:', error);
      const presets = getFromStorage<AssistantPreset[]>(STORAGE_KEYS.ASSISTANT_PRESETS, [])
        .filter(p => p.id !== id);
      removed = saveToStorage(STORAGE_KEYS.ASSISTANT_PRESETS, presets);
    }
  }

  // Clear default if deleting default preset
  if (removed) {
    const defaultPresetId = await getDefaultPresetId();
    if (defaultPresetId === id) {
      await setDefaultPresetId(null);
    }
  }

  return removed;
}

export async function getAssistantPreset(id: string): Promise<AssistantPreset | undefined> {
  if (!isIndexedDbAvailable()) {
    return getFromStorage<AssistantPreset[]>(STORAGE_KEYS.ASSISTANT_PRESETS, [])
      .find(p => p.id === id);
  }

  try {
    const db = await openDb();
    if (!hasStore(db, DB_STORES.ASSISTANT_PRESETS)) {
      return getFromStorage<AssistantPreset[]>(STORAGE_KEYS.ASSISTANT_PRESETS, [])
        .find(p => p.id === id);
    }
    const tx = db.transaction(DB_STORES.ASSISTANT_PRESETS, 'readonly');
    const store = tx.objectStore(DB_STORES.ASSISTANT_PRESETS);
    const result = await requestToPromise<AssistantPreset | undefined>(store.get(id));
    await transactionComplete(tx);
    if (result) return result;

    const fallback = getFromStorage<AssistantPreset[]>(STORAGE_KEYS.ASSISTANT_PRESETS, []);
    if (fallback.length > 0) {
      const migrated = await setAssistantPresets(fallback);
      if (migrated) {
        markAssistantPresetsMigrated();
      }
    }
    return fallback.find(p => p.id === id);
  } catch (error) {
    console.error('Error loading assistant preset from IndexedDB:', error);
    return getFromStorage<AssistantPreset[]>(STORAGE_KEYS.ASSISTANT_PRESETS, [])
      .find(p => p.id === id);
  }
}

export function hasAssistantPresetsMigrationNotice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEYS.ASSISTANT_PRESETS_MIGRATION_NOTICE) === '1';
  } catch (error) {
    console.error('Error reading assistant preset migration notice:', error);
    return false;
  }
}

export function clearAssistantPresetsMigrationNotice(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEYS.ASSISTANT_PRESETS_MIGRATION_NOTICE);
  } catch (error) {
    console.error('Error clearing assistant preset migration notice:', error);
  }
}

// Default Preset
export async function getDefaultPresetId(): Promise<string | null> {
  const fallback = getFromStorage<string | null>(STORAGE_KEYS.DEFAULT_PRESET_ID, null);

  if (!isIndexedDbAvailable()) return fallback;

  try {
    const db = await openDb();
    if (!hasStore(db, DB_STORES.META)) {
      return fallback;
    }
    const tx = db.transaction(DB_STORES.META, 'readonly');
    const store = tx.objectStore(DB_STORES.META);
    const entry = await requestToPromise<{ key: string; value: string } | undefined>(
      store.get(META_KEYS.DEFAULT_PRESET_ID)
    );
    await transactionComplete(tx);
    if (entry?.value) return entry.value;

    if (fallback) {
      await setDefaultPresetId(fallback);
    }
    return fallback;
  } catch (error) {
    console.error('Error loading default preset id from IndexedDB:', error);
    return fallback;
  }
}

export async function setDefaultPresetId(id: string | null): Promise<void> {
  if (!isIndexedDbAvailable()) {
    saveToStorage(STORAGE_KEYS.DEFAULT_PRESET_ID, id);
    return;
  }

  try {
    const db = await openDb();
    if (!hasStore(db, DB_STORES.META)) {
      saveToStorage(STORAGE_KEYS.DEFAULT_PRESET_ID, id);
      return;
    }
    const tx = db.transaction(DB_STORES.META, 'readwrite');
    const store = tx.objectStore(DB_STORES.META);

    if (id === null) {
      store.delete(META_KEYS.DEFAULT_PRESET_ID);
    } else {
      store.put({ key: META_KEYS.DEFAULT_PRESET_ID, value: id });
    }

    await transactionComplete(tx);
    clearDefaultPresetStorage();
  } catch (error) {
    console.error('Error saving default preset id to IndexedDB:', error);
    saveToStorage(STORAGE_KEYS.DEFAULT_PRESET_ID, id);
  }
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
