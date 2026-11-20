'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { ApiConfig, AssistantPreset } from '@/types';
import { ChevronsUpDown, Settings } from 'lucide-react';
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
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

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

  const title = selectedPreset?.name || 'Default assistant';
  const subtitle = [selectedApiConfig?.name || 'No API selected', effectiveModelId || 'No model']
    .join(' · ');

  return (
    <div className="flex-shrink-0 border-t border-slate-200/80 p-2.5">
      <div ref={rootRef} className="relative flex items-center gap-1">
        {isOpen && mounted && (
          <div
            id="conversation-config-panel"
            role="dialog"
            aria-label="Conversation configuration"
            className="config-popover absolute bottom-full left-0 right-0 z-30 mb-2 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18),0_2px_6px_rgba(15,23,42,0.05)]"
          >
            <div className="mb-2.5 flex items-center justify-between px-0.5">
              <span className="text-xs font-semibold text-slate-900">This conversation</span>
              <span className="text-[11px] text-slate-400">Saved per chat</span>
            </div>
            <div className="space-y-2.5">
              <ConfigField label="API" htmlFor="api-config-select">
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
              </ConfigField>

              <ConfigField label="Assistant preset" htmlFor="preset-select">
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
              </ConfigField>

              <ConfigField label="Model" htmlFor="model-select">
                <select
                  id="model-select"
                  value={effectiveModelId}
                  onChange={(e) => {
                    const nextModelId = e.target.value || undefined;
                    onModelChange(nextModelId && nextModelId !== fallbackModelId ? nextModelId : undefined);
                  }}
                  className={`${selectClass} font-mono text-[12.5px]`}
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
              </ConfigField>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          disabled={!mounted}
          aria-expanded={isOpen}
          aria-controls="conversation-config-panel"
          aria-haspopup="dialog"
          title="Change API, preset or model"
          className={`group flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition-colors hover:bg-slate-200/50 ${
            isOpen ? 'bg-slate-200/50' : ''
          }`}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-5 text-slate-800">
              {mounted ? title : 'Loading…'}
            </span>
            <span className="block truncate text-xs leading-4 text-slate-500">
              {mounted ? subtitle : '\u00a0'}
            </span>
          </span>
          <ChevronsUpDown className={`h-4 w-4 flex-shrink-0 transition-colors ${
            isOpen ? 'text-slate-600' : 'text-slate-400 group-hover:text-slate-600'
          }`} />
        </button>

        {onOpenSettings && (
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onOpenSettings();
            }}
            className="ui-icon-btn h-9 w-9 rounded-xl"
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>
    </div>
  );
}

const selectClass = 'ui-input h-9 py-0 pl-2.5 text-[13px]';

function ConfigField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block px-0.5 text-[11px] font-medium text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}
