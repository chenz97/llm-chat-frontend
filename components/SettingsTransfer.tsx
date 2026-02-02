'use client';

import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { ApiConfig, AssistantPreset, SettingsExport } from '@/types';
import {
  getApiConfigs,
  getAssistantPresets,
  getDefaultPresetId,
  setApiConfigs,
  setAssistantPresets,
  setDefaultPresetId,
} from '@/lib/storage';

const SETTINGS_UPDATED_EVENT = 'settingsUpdated';

type StatusMessage = {
  kind: 'success' | 'error';
  message: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
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
      createdAt: typeof preset.createdAt === 'number' ? preset.createdAt : Date.now(),
    });
  }

  return sanitized;
};

const buildExportData = async (): Promise<SettingsExport> => ({
  version: 1,
  exportedAt: Date.now(),
  apiConfigs: getApiConfigs(),
  assistantPresets: await getAssistantPresets(),
  defaultPresetId: getDefaultPresetId(),
});

const normalizeImportData = (raw: unknown) => {
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

const downloadSettings = (data: SettingsExport) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `llm-chat-settings-${timestamp}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
};

export default function SettingsTransfer() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);

  const handleExport = async () => {
    try {
      const data = await buildExportData();
      downloadSettings(data);
      setStatus({
        kind: 'success',
        message: 'Settings exported successfully.',
      });
    } catch (error) {
      console.error('Failed to export settings:', error);
      setStatus({
        kind: 'error',
        message: 'Failed to export settings. Please try again.',
      });
    }
  };

  const handleImportClick = () => {
    setStatus(null);
    fileInputRef.current?.click();
  };

  const handleImportChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!confirm('Importing will overwrite existing API configurations and assistant presets. Continue?')) {
      event.target.value = '';
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const normalized = normalizeImportData(parsed);

      setApiConfigs(normalized.apiConfigs);
      const didSavePresets = await setAssistantPresets(normalized.assistantPresets);
      if (!didSavePresets) {
        throw new Error('Failed to save assistant presets.');
      }
      setDefaultPresetId(normalized.defaultPresetId);
      window.dispatchEvent(new Event(SETTINGS_UPDATED_EVENT));

      setStatus({
        kind: 'success',
        message: `Imported ${normalized.apiConfigs.length} API config(s) and ${normalized.assistantPresets.length} preset(s).`,
      });
    } catch (error) {
      console.error('Failed to import settings:', error);
      setStatus({
        kind: 'error',
        message: 'Failed to import settings. Please check the file format.',
      });
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="app-panel p-4 sm:p-5 space-y-2">
        <h3 className="text-lg font-semibold text-slate-900">Export Settings</h3>
        <p className="text-sm text-slate-600">
          Download a JSON backup of your API configurations and assistant presets.
        </p>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Download className="w-4 h-4" />
          Export JSON
        </button>
      </div>

      <div className="app-panel p-4 sm:p-5 space-y-2">
        <h3 className="text-lg font-semibold text-slate-900">Import Settings</h3>
        <p className="text-sm text-slate-600">
          Import a JSON file to replace your existing API configurations and assistant presets.
        </p>
        <button
          onClick={handleImportClick}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-800"
        >
          <Upload className="w-4 h-4" />
          Import JSON
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={handleImportChange}
          className="hidden"
        />
        <p className="text-xs text-amber-700">
          Importing will overwrite existing settings.
        </p>
      </div>

      {status && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            status.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {status.message}
        </div>
      )}
    </div>
  );
}
