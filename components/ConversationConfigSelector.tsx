'use client';

import { useState, useEffect } from 'react';
import { ApiConfig, AssistantPreset } from '@/types';
import { getApiConfigs, getAssistantPresets } from '@/lib/storage';

interface ConversationConfigSelectorProps {
  selectedApiConfigId: string;
  selectedPresetId?: string;
  onApiConfigChange: (id: string) => void;
  onPresetChange: (id: string | undefined) => void;
}

export default function ConversationConfigSelector({
  selectedApiConfigId,
  selectedPresetId,
  onApiConfigChange,
  onPresetChange,
}: ConversationConfigSelectorProps) {
  const [apiConfigs, setApiConfigs] = useState<ApiConfig[]>([]);
  const [presets, setPresets] = useState<AssistantPreset[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setApiConfigs(getApiConfigs());
    setPresets(getAssistantPresets());
  }, []);

  if (!mounted) {
    return (
    <div className="app-panel px-4 py-4">
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
      </div>
    </div>
  );
}

  return (
    <div className="app-panel px-4 py-4 flex-shrink-0">
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
      </div>
    </div>
  );
}
