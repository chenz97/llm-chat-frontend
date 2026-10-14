import type {
  ApiConfig,
  AssistantPreset,
  NormalizedSettingsImport,
  RequestApi,
} from '@/types';

export const SETTINGS_UPDATED_EVENT = 'settingsUpdated';
export const DEFAULT_SETTINGS_SYNC_FILENAME = 'llm-chat-settings.json';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const normalizeRequestApi = (value: unknown): RequestApi => (
  value === 'responses' ? 'responses' : 'chat_completions'
);

const readSortOrder = (record: Record<string, unknown>): { sortOrder?: number } => (
  typeof record.sortOrder === 'number' && Number.isFinite(record.sortOrder)
    ? { sortOrder: record.sortOrder }
    : {}
);

const sanitizeApiConfigs = (rawConfigs: unknown): ApiConfig[] => {
  if (!Array.isArray(rawConfigs)) return [];

  return rawConfigs
    .map((config) => {
      if (!isRecord(config)) return null;
      const id = typeof config.id === 'string' ? config.id : '';
      const name = typeof config.name === 'string' ? config.name : '';
      if (!id || !name) return null;

      const models = Array.isArray(config.models)
        ? config.models.filter((model): model is string => typeof model === 'string')
        : [];

      return {
        id,
        name,
        baseUrl: typeof config.baseUrl === 'string' ? config.baseUrl : '',
        apiKey: typeof config.apiKey === 'string' ? config.apiKey : '',
        models,
        createdAt: typeof config.createdAt === 'number' ? config.createdAt : Date.now(),
        ...readSortOrder(config),
      };
    })
    .filter((config): config is ApiConfig => Boolean(config));
};

const sanitizeAssistantPresets = (rawPresets: unknown): AssistantPreset[] => {
  if (!Array.isArray(rawPresets)) return [];

  const sanitized: AssistantPreset[] = [];

  for (const preset of rawPresets) {
    if (!isRecord(preset)) continue;
    const id = typeof preset.id === 'string' ? preset.id : '';
    const name = typeof preset.name === 'string' ? preset.name : '';
    if (!id || !name) continue;

    const parameters = isRecord(preset.parameters) ? preset.parameters : {};

    sanitized.push({
      id,
      name,
      apiConfigId: typeof preset.apiConfigId === 'string' ? preset.apiConfigId : undefined,
      modelId: typeof preset.modelId === 'string' ? preset.modelId : '',
      systemPrompt: typeof preset.systemPrompt === 'string' ? preset.systemPrompt : '',
      parameters: parameters as AssistantPreset['parameters'],
      requestApi: normalizeRequestApi(preset.requestApi),
      useVercelServerProxy: preset.useVercelServerProxy === true,
      isVisible: preset.isVisible !== false,
      createdAt: typeof preset.createdAt === 'number' ? preset.createdAt : Date.now(),
      ...readSortOrder(preset),
    });
  }

  return sanitized;
};

export const normalizeImportData = (raw: unknown): NormalizedSettingsImport => {
  if (!isRecord(raw)) {
    throw new Error('Invalid settings format.');
  }

  if (raw.version !== undefined && raw.version !== 1) {
    throw new Error('Unsupported settings version.');
  }

  const rawApiConfigs = raw.apiConfigs;
  const rawAssistantPresets = raw.assistantPresets;

  if (!Array.isArray(rawApiConfigs) || !Array.isArray(rawAssistantPresets)) {
    throw new Error('Missing settings data.');
  }

  const apiConfigs = sanitizeApiConfigs(rawApiConfigs);
  const assistantPresets = sanitizeAssistantPresets(rawAssistantPresets);

  if (rawApiConfigs.length > 0 && apiConfigs.length === 0) {
    throw new Error('No valid API configurations found.');
  }

  if (rawAssistantPresets.length > 0 && assistantPresets.length === 0) {
    throw new Error('No valid assistant presets found.');
  }

  const apiConfigIds = new Set(apiConfigs.map((config) => config.id));
  const normalizedPresets = assistantPresets.map((preset) => (
    preset.apiConfigId && !apiConfigIds.has(preset.apiConfigId)
      ? { ...preset, apiConfigId: undefined }
      : preset
  ));

  const defaultPresetId = typeof raw.defaultPresetId === 'string' ? raw.defaultPresetId : null;
  const normalizedDefaultPresetId = defaultPresetId
    && normalizedPresets.some((preset) => preset.id === defaultPresetId)
    ? defaultPresetId
    : null;

  return {
    apiConfigs,
    assistantPresets: normalizedPresets,
    defaultPresetId: normalizedDefaultPresetId,
  };
};
