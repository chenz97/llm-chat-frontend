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
  const visiblePresets = presets.filter((preset) => preset.isVisible !== false);
  const presetOptions = selectedPreset && selectedPreset.isVisible === false
    ? [selectedPreset, ...visiblePresets.filter((preset) => preset.id !== selectedPreset.id)]
    : visiblePresets;
  const availableModels = selectedApiConfig?.models || [];
  const fallbackModelId = selectedPreset?.modelId || availableModels[0] || '';
  const effectiveModelId = selectedModelIdOverride || fallbackModelId;
  const modelOptions = effectiveModelId && !availableModels.includes(effectiveModelId)
    ? [effectiveModelId, ...availableModels]
    : availableModels;

  useEffect(() => {
    let cancelled = false;
    const mountedTimer = window.setTimeout(() => {
      if (!cancelled) {
        setMounted(true);
      }
    }, 0);

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
      window.clearTimeout(mountedTimer);
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

  const header = (
    <div className="mb-2 flex items-center justify-between">
      <span className="px-0.5 text-xs font-medium uppercase tracking-wide text-slate-400">Configuration</span>
      {onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="ui-icon-btn h-7 w-7"
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  const selectClass = 'ui-input h-9 py-0 pl-2.5 pr-8 text-[13px]';
  const labelClass = 'mb-1 block px-0.5 text-xs text-slate-500';

  if (!mounted) {
    return (
      <div className="flex-shrink-0 border-t border-slate-200/80 px-3 pt-2.5 pb-3">
        {header}
        <div className="grid gap-2">
          {['API', 'Preset', 'Model'].map((label) => (
            <div key={label}>
              <span className={labelClass}>{label}</span>
              <select className={selectClass} disabled>
                <option value="">Loading...</option>
              </select>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 border-t border-slate-200/80 px-3 pt-2.5 pb-3">
      {header}
      <div className="grid gap-2">
        <div>
          <label htmlFor="api-config-select" className={labelClass}>
            API
          </label>
          <select
            id="api-config-select"
            value={selectedApiConfigId}
            onChange={(e) => onApiConfigChange(e.target.value)}
            className={selectClass}
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
          <label htmlFor="preset-select" className={labelClass}>
            Preset
          </label>
          <select
            id="preset-select"
            value={selectedPresetId || ''}
            onChange={(e) => onPresetChange(e.target.value || undefined)}
            className={selectClass}
          >
            <option value="">None (Default)</option>
            {presetOptions.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name} - {preset.modelId}
                {preset.isVisible === false ? ' (hidden)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="model-select" className={labelClass}>
            Model
          </label>
          <select
            id="model-select"
            value={effectiveModelId}
            onChange={(e) => {
              const nextModelId = e.target.value || undefined;
              onModelChange(nextModelId && nextModelId !== fallbackModelId ? nextModelId : undefined);
            }}
            className={selectClass}
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
