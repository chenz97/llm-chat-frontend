'use client';

import { useState, useEffect } from 'react';
import { ApiConfig, AssistantPreset } from '@/types';
import { Settings } from 'lucide-react';
import { getApiConfigs, getAssistantPresets } from '@/lib/storage';

interface ConversationConfigSelectorProps {
  selectedApiConfigId: string;
  selectedPresetId?: string;
  selectedModelIdOverride?: string;
  onApiConfigChange: (id: string) => void;
  onPresetChange: (id: string | undefined) => void;
  onModelChange: (id: string | undefined) => void;
  onOpenSettings?: () => void;
}

export default function ConversationConfigSelector({
  selectedApiConfigId,
  selectedPresetId,
  selectedModelIdOverride,
  onApiConfigChange,
  onPresetChange,
  onModelChange,
  onOpenSettings,
}: ConversationConfigSelectorProps) {
  const [apiConfigs, setApiConfigs] = useState<ApiConfig[]>([]);
  const [presets, setPresets] = useState<AssistantPreset[]>([]);
  const [mounted, setMounted] = useState(false);

  const selectedApiConfig = apiConfigs.find((config) => config.id === selectedApiConfigId);
  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId);
  const availableModels = selectedApiConfig?.models || [];
  const fallbackModelId = selectedPreset?.modelId || availableModels[0] || '';
  const effectiveModelId = selectedModelIdOverride || fallbackModelId;
  const modelOptions = effectiveModelId && !availableModels.includes(effectiveModelId)
    ? [effectiveModelId, ...availableModels]
    : availableModels;

  useEffect(() => {
    let cancelled = false;
    setMounted(true);

    const loadSettings = async () => {
      const presetsData = await getAssistantPresets();
      const configsData = await getApiConfigs();
      if (!cancelled) {
        setApiConfigs(configsData);
        setPresets(presetsData);
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleSettingsUpdate = () => {
      const refresh = async () => {
        const presetsData = await getAssistantPresets();
        const configsData = await getApiConfigs();
        setApiConfigs(configsData);
        setPresets(presetsData);
      };
      void refresh();
    };

    window.addEventListener('settingsUpdated', handleSettingsUpdate);
    return () => window.removeEventListener('settingsUpdated', handleSettingsUpdate);
  }, []);

  if (!mounted) {
    return (
    <div className="app-panel px-4 py-4 relative pr-10">
      {onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="absolute top-3 right-3 p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      )}
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="block text-base font-medium text-slate-700 mb-1.5">
            API Configuration
          </label>
          <select className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm" disabled>
            <option value="">Loading...</option>
          </select>
        </div>
        <div>
          <label className="block text-base font-medium text-slate-700 mb-1.5">
            Assistant Preset
          </label>
          <select className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm" disabled>
            <option value="">Loading...</option>
          </select>
        </div>
        <div>
          <label className="block text-base font-medium text-slate-700 mb-1.5">
            Model ID
          </label>
          <select className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm" disabled>
            <option value="">Loading...</option>
          </select>
        </div>
      </div>
    </div>
  );
}

  return (
    <div className="app-panel px-4 py-4 flex-shrink-0 relative pr-10">
      {onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="absolute top-3 right-3 p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      )}
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label htmlFor="api-config-select" className="block text-base font-medium text-slate-700 mb-1.5">
            API Configuration
          </label>
          <select
            id="api-config-select"
            value={selectedApiConfigId}
            onChange={(e) => onApiConfigChange(e.target.value)}
            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-slate-300 transition-colors duration-200"
          >
            <option value="">Select API Config</option>
            {apiConfigs.map((config) => (
              <option key={config.id} value={config.id}>
                {config.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="preset-select" className="block text-base font-medium text-slate-700 mb-1.5">
            Assistant Preset
          </label>
          <select
            id="preset-select"
            value={selectedPresetId || ''}
            onChange={(e) => onPresetChange(e.target.value || undefined)}
            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-slate-300 transition-colors duration-200"
          >
            <option value="">None (Default)</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name} - {preset.modelId}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="model-select" className="block text-base font-medium text-slate-700 mb-1.5">
            Model ID
          </label>
          <select
            id="model-select"
            value={effectiveModelId}
            onChange={(e) => {
              const nextModelId = e.target.value || undefined;
              onModelChange(nextModelId && nextModelId !== fallbackModelId ? nextModelId : undefined);
            }}
            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-slate-300 transition-colors duration-200"
            disabled={modelOptions.length === 0}
          >
            {modelOptions.length === 0 ? (
              <option value="">No models available</option>
            ) : (
              modelOptions.map((modelId, index) => (
                <option key={`${modelId}-${index}`} value={modelId}>
                  {modelId}
                  {index === 0 && modelId === effectiveModelId && !availableModels.includes(modelId)
                    ? ' (current)'
                    : ''}
                </option>
              ))
            )}
          </select>
        </div>
      </div>
    </div>
  );
}
