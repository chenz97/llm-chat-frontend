'use client';

import { useState, useEffect, useRef } from 'react';
import { AssistantPreset, ApiConfig, RequestApi } from '@/types';
import { showFloatingStatus } from '@/lib/floatingStatus';
import {
  getAssistantPresets,
  saveAssistantPreset,
  setAssistantPresets,
  deleteAssistantPreset,
  generateId,
  getApiConfigs,
  getDefaultPresetId,
  setDefaultPresetId,
  hasAssistantPresetsMigrationNotice,
  clearAssistantPresetsMigrationNotice,
} from '@/lib/storage';
import { getNextSortOrder, reorderItems } from '@/lib/sortOrder';
import { Plus, Trash2, Edit2, Check, X, Star } from 'lucide-react';
import SortableList from './SortableList';

const REQUEST_API_OPTIONS: Array<{ value: RequestApi; label: string }> = [
  { value: 'chat_completions', label: 'Chat Completions API' },
  { value: 'responses', label: 'Responses API' },
];

const normalizeRequestApi = (value?: RequestApi): RequestApi => (
  value === 'responses' ? 'responses' : 'chat_completions'
);

const getRequestApiLabel = (value?: RequestApi): string => (
  REQUEST_API_OPTIONS.find((option) => option.value === normalizeRequestApi(value))?.label
  || 'Chat Completions API'
);

export default function AssistantPresetManager() {
  const [presets, setPresets] = useState<AssistantPreset[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<AssistantPreset>>({});
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [apiConfigs, setApiConfigs] = useState<ApiConfig[]>([]);
  const [mounted, setMounted] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [defaultPresetId, setDefaultPresetIdState] = useState<string | null>(null);
  const [migrationNotice, setMigrationNotice] = useState<string | null>(null);
  const pendingScrollIdRef = useRef<string | null>(null);
  const newPresetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const mountTimer = window.setTimeout(() => {
      if (!cancelled) {
        setMounted(true);
      }
    }, 0);

    const initialize = async () => {
      const loadedPresets = await getAssistantPresets();
      if (!cancelled) {
        setPresets(loadedPresets);
        setDefaultPresetIdState(await getDefaultPresetId());
      }

      // Get all available models from API configs
      const configs = await getApiConfigs();
      if (!cancelled) {
        setApiConfigs(configs);
        const models = configs.flatMap(c => c.models);
        setAvailableModels([...new Set(models)]);
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      window.clearTimeout(mountTimer);
    };
  }, []);

  useEffect(() => {
    const showNotice = () => {
      setMigrationNotice('Assistant presets were migrated to the local database for more reliable saving.');
      clearAssistantPresetsMigrationNotice();
    };

    if (hasAssistantPresetsMigrationNotice()) {
      showNotice();
    }

    const handleMigration = () => {
      showNotice();
    };

    window.addEventListener('assistantPresetsMigrated', handleMigration);
    return () => {
      window.removeEventListener('assistantPresetsMigrated', handleMigration);
    };
  }, []);

  useEffect(() => {
    if (!migrationNotice) return;
    const timer = window.setTimeout(() => {
      setMigrationNotice(null);
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [migrationNotice]);

  useEffect(() => {
    if (!editing || pendingScrollIdRef.current !== editing || !newPresetRef.current) {
      return;
    }

    const scrollTarget = newPresetRef.current;
    const frameId = window.requestAnimationFrame(() => {
      scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    pendingScrollIdRef.current = null;

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [editing]);

  if (!mounted) {
    return null;
  }

  const resolveModelsForProvider = (providerId?: string) => {
    if (!providerId) {
      return availableModels;
    }

    const provider = apiConfigs.find(config => config.id === providerId);
    return provider?.models || [];
  };

  const handleProviderChange = (providerId: string) => {
    const normalizedId = providerId || undefined;
    const modelsForProvider = resolveModelsForProvider(normalizedId);
    let nextModelId = formData.modelId || '';

    if (normalizedId) {
      if (modelsForProvider.length === 0) {
        nextModelId = '';
      } else if (!modelsForProvider.includes(nextModelId)) {
        nextModelId = modelsForProvider[0];
      }
    } else if (availableModels.length > 0 && !availableModels.includes(nextModelId)) {
      nextModelId = availableModels[0];
    }

    setFormData({ ...formData, apiConfigId: normalizedId, modelId: nextModelId });
  };

  const handleAdd = () => {
    const newPreset: AssistantPreset = {
      id: generateId(),
      name: 'New Assistant',
      apiConfigId: undefined,
      modelId: availableModels[0] || '',
      systemPrompt: '',
      parameters: {},
      requestApi: 'chat_completions',
      enableWebSearch: false,
      useVercelServerProxy: false,
      isVisible: true,
      createdAt: Date.now(),
      sortOrder: getNextSortOrder(presets),
    };
    pendingScrollIdRef.current = newPreset.id;
    setEditing(newPreset.id);
    setFormData(newPreset);
  };

  const handleSave = async () => {
    if (!formData.id) return;

    // Prefer the current list position in case the list was reordered while editing.
    const sortOrder = presets.find((p) => p.id === formData.id)?.sortOrder ?? formData.sortOrder;
    const preset: AssistantPreset = {
      id: formData.id,
      name: formData.name || 'Unnamed Assistant',
      apiConfigId: formData.apiConfigId || undefined,
      modelId: formData.modelId || '',
      systemPrompt: formData.systemPrompt || '',
      parameters: formData.parameters || {},
      requestApi: normalizeRequestApi(formData.requestApi),
      enableWebSearch: formData.enableWebSearch === true,
      useVercelServerProxy: formData.useVercelServerProxy === true,
      isVisible: formData.isVisible !== false,
      createdAt: formData.createdAt || Date.now(),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    };

    const didSave = await saveAssistantPreset(preset);
    if (!didSave) {
      showFloatingStatus({
        kind: 'error',
        message: 'Failed to save assistant preset. Your browser storage may be full.',
      });
      alert('Failed to save assistant preset. Your browser storage may be full.');
      return;
    }

    setPresets(await getAssistantPresets());
    setEditing(null);
    setFormData({});
    window.dispatchEvent(new Event('settingsUpdated'));
    showFloatingStatus({
      kind: 'success',
      message: 'Assistant preset saved locally.',
    });
  };

  const handleEdit = (preset: AssistantPreset) => {
    setEditing(preset.id);
    setFormData(preset);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this assistant preset?')) {
      const didDelete = await deleteAssistantPreset(id);
      if (!didDelete) {
        showFloatingStatus({
          kind: 'error',
          message: 'Failed to delete assistant preset. Please try again.',
        });
        alert('Failed to delete assistant preset. Please try again.');
        return;
      }

      setPresets(await getAssistantPresets());
      setDefaultPresetIdState(await getDefaultPresetId());
      window.dispatchEvent(new Event('settingsUpdated'));
      showFloatingStatus({
        kind: 'success',
        message: 'Assistant preset deleted locally.',
      });
    }
  };

  const toggleDefault = (id: string) => {
    const runToggle = async () => {
      if (defaultPresetId === id) {
        await setDefaultPresetId(null);
        setDefaultPresetIdState(null);
      } else {
        await setDefaultPresetId(id);
        setDefaultPresetIdState(id);
      }
      window.dispatchEvent(new Event('settingsUpdated'));
      showFloatingStatus({
        kind: 'success',
        message: 'Default assistant preset updated locally.',
      });
    };
    void runToggle();
  };

  const toggleVisibility = (preset: AssistantPreset) => {
    const runToggle = async () => {
      const didSave = await saveAssistantPreset({
        ...preset,
        isVisible: preset.isVisible === false,
      });

      if (!didSave) {
        showFloatingStatus({
          kind: 'error',
          message: 'Failed to save assistant preset. Your browser storage may be full.',
        });
        alert('Failed to save assistant preset. Your browser storage may be full.');
        return;
      }

      setPresets(await getAssistantPresets());
      window.dispatchEvent(new Event('settingsUpdated'));
      showFloatingStatus({
        kind: 'success',
        message: 'Assistant preset visibility updated locally.',
      });
    };

    void runToggle();
  };

  const handleReorder = async (activeId: string, overId: string) => {
    const reordered = reorderItems(presets, activeId, overId);
    if (!reordered) return;

    const previous = presets;
    setPresets(reordered);
    setIsReordering(true);
    const didSave = await setAssistantPresets(reordered);
    setIsReordering(false);

    if (!didSave) {
      setPresets(previous);
      showFloatingStatus({
        kind: 'error',
        message: 'Failed to save assistant preset order. Your browser storage may be full.',
      });
      return;
    }

    window.dispatchEvent(new Event('settingsUpdated'));
  };

  const handleCancel = () => {
    setEditing(null);
    setFormData({});
  };

  const updateParameter = (key: string, value: string) => {
    const params = { ...formData.parameters };

    if (value === '') {
      delete params[key];
    } else {
      // Try to parse as number if possible
      const numValue = parseFloat(value);
      params[key] = isNaN(numValue) ? value : numValue;
    }

    setFormData({ ...formData, parameters: params });
  };

  const addParameter = (key: string) => {
    if (!key || formData.parameters?.[key] !== undefined) return;
    updateParameter(key, '');
  };

  const addCustomParameter = (key: string, value: string) => {
    if (!key.trim()) return;
    const params = { ...formData.parameters };
    const numValue = parseFloat(value);
    params[key.trim()] = isNaN(numValue) ? value : numValue;
    setFormData({ ...formData, parameters: params });
  };

  const formatParameterValue = (value: unknown) => {
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    if (value === null || value === undefined) {
      return '';
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  const modelOptions = resolveModelsForProvider(formData.apiConfigId);

  return (
    <div className="space-y-3">
      {migrationNotice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-base text-emerald-700 flex items-start justify-between gap-3">
          <span>{migrationNotice}</span>
          <button
            type="button"
            onClick={() => setMigrationNotice(null)}
            className="text-emerald-700 hover:text-emerald-900 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-slate-900">Assistant Presets</h2>
        <button
          onClick={handleAdd}
          className="ui-btn ui-btn-primary"
          disabled={availableModels.length === 0}
        >
          <Plus className="w-4 h-4" />
          Add Preset
        </button>
      </div>

      {availableModels.length === 0 && (
        <div className="p-5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
          Please add an API configuration with models first.
        </div>
      )}

      <div className="space-y-3">
        <SortableList
          items={presets}
          disabled={isReordering}
          className="space-y-3"
          itemClassName="ui-card"
          getItemLabel={(preset) => preset.name}
          onReorder={(activeId, overId) => void handleReorder(activeId, overId)}
          renderItem={(preset, dragHandle) => (editing === preset.id ? (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Name"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="ui-input"
                />

                <select
                  value={formData.apiConfigId || ''}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="ui-input"
                >
                  <option value="">No provider (use current API config)</option>
                  {apiConfigs.map((config) => (
                    <option key={config.id} value={config.id}>
                      {config.name}
                    </option>
                  ))}
                </select>

                <select
                  value={formData.modelId || ''}
                  onChange={(e) => setFormData({ ...formData, modelId: e.target.value })}
                  className="ui-input"
                >
                  <option value="">Select Model</option>
                  {modelOptions.map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>

                <textarea
                  placeholder="System Prompt"
                  value={formData.systemPrompt || ''}
                  onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                  rows={4}
                  className="ui-input resize-none"
                />

                <div className="space-y-1">
                  <label className="ui-label mb-0">Request API</label>
                  <select
                    value={normalizeRequestApi(formData.requestApi)}
                    onChange={(e) => setFormData({ ...formData, requestApi: e.target.value as RequestApi })}
                    className="ui-input"
                  >
                    {REQUEST_API_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 text-base text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.enableWebSearch === true}
                    onChange={(e) => setFormData({ ...formData, enableWebSearch: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                  />
                  Enable Web Search
                </label>

                <label className="flex items-center gap-2 text-base text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.useVercelServerProxy === true}
                    onChange={(e) => setFormData({ ...formData, useVercelServerProxy: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                  />
                  Send requests via Vercel server proxy
                </label>

                <div className="space-y-2">
                  <label className="ui-label mb-0">Model Parameters</label>
                  {Object.entries(formData.parameters || {}).map(([key, value]) => (
                    <div
                      key={key}
                      className="grid grid-cols-1 sm:grid-cols-[12rem_minmax(0,1fr)_auto] gap-2 items-start sm:items-center"
                    >
                      <input
                        type="text"
                        value={key}
                        disabled
                        className="ui-input ui-input-muted sm:w-48"
                      />
                      <input
                        type="text"
                        value={formatParameterValue(value)}
                        onChange={(e) => updateParameter(key, e.target.value)}
                        className="ui-input min-w-0"
                      />
                      <button
                        onClick={() => updateParameter(key, '')}
                        className="ui-icon-btn ui-icon-btn-danger h-9 w-9 self-start sm:self-auto"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  <div className="w-full">
                    <select
                      className="ui-input"
                      onChange={(e) => {
                        if (e.target.value) {
                          addParameter(e.target.value);
                          e.target.value = '';
                        }
                      }}
                    >
                      <option value="">Add common parameter...</option>
                      <option value="temperature">temperature</option>
                      <option value="max_tokens">max_tokens</option>
                      <option value="top_p">top_p</option>
                      <option value="frequency_penalty">frequency_penalty</option>
                      <option value="presence_penalty">presence_penalty</option>
                      <option value="top_k">top_k</option>
                      <option value="stop">stop</option>
                    </select>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <label className="ui-label mb-0">Add Custom Parameter</label>
                    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-start sm:items-center">
                      <input
                        type="text"
                        placeholder="Parameter name"
                        id="custom-param-key"
                        className="ui-input"
                      />
                      <input
                        type="text"
                        placeholder="Value"
                        id="custom-param-value"
                        className="ui-input min-w-0"
                      />
                      <button
                        onClick={() => {
                          const keyInput = document.getElementById('custom-param-key') as HTMLInputElement;
                          const valueInput = document.getElementById('custom-param-value') as HTMLInputElement;
                          if (keyInput && valueInput && keyInput.value.trim()) {
                            addCustomParameter(keyInput.value, valueInput.value);
                            keyInput.value = '';
                            valueInput.value = '';
                          }
                        }}
                        className="ui-btn ui-btn-secondary h-10 w-10 px-0"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    className="ui-btn ui-btn-primary"
                  >
                    <Check className="w-4 h-4" />
                    Save
                  </button>
                  <button
                    onClick={handleCancel}
                    className="ui-btn ui-btn-secondary"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <div className="-ml-2 pt-0.5">{dragHandle}</div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-lg text-slate-900">{preset.name}</h3>
                      <p className="text-base text-slate-600 mt-0.5 break-all">Model: {preset.modelId}</p>
                      <p className="text-[15px] text-slate-500 mt-0.5">
                        API: {getRequestApiLabel(preset.requestApi)}
                      </p>
                      {preset.enableWebSearch && (
                        <p className="text-[15px] text-slate-500 mt-0.5">Web Search: Enabled</p>
                      )}
                      <p className="text-[15px] text-slate-500 mt-0.5">
                        Request mode: {preset.useVercelServerProxy ? 'Vercel proxy' : 'Browser direct'}
                      </p>
                      {preset.apiConfigId && (
                        <p className="text-[15px] text-slate-500 mt-0.5">
                          Provider: {apiConfigs.find((config) => config.id === preset.apiConfigId)?.name || 'Unknown provider'}
                        </p>
                      )}
                      {preset.systemPrompt && (
                        <p className="text-[15px] text-slate-500 mt-1 line-clamp-2">
                          {preset.systemPrompt}
                        </p>
                      )}
                      {Object.keys(preset.parameters).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {Object.entries(preset.parameters).map(([key, value]) => (
                            <span
                              key={key}
                              className="ui-chip break-all"
                            >
                              {key}: {formatParameterValue(value)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1 self-start">
                    <button
                      onClick={() => toggleDefault(preset.id)}
                      className={`ui-icon-btn h-9 w-9 ${
                        defaultPresetId === preset.id
                          ? 'text-yellow-500 hover:bg-yellow-50'
                          : 'text-slate-400 hover:bg-slate-100'
                      }`}
                      title={defaultPresetId === preset.id ? 'Remove as default' : 'Set as default'}
                    >
                      <Star className={`w-4 h-4 ${defaultPresetId === preset.id ? 'fill-yellow-500' : ''}`} />
                    </button>
                    <button
                      onClick={() => handleEdit(preset)}
                      className="ui-icon-btn h-9 w-9"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(preset.id)}
                      className="ui-icon-btn ui-icon-btn-danger h-9 w-9"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="flex h-9 items-center">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={preset.isVisible !== false}
                        aria-label={preset.isVisible === false ? 'Show in main assistant preset selector' : 'Hide from main assistant preset selector'}
                        title={preset.isVisible === false ? 'Show in main assistant preset selector' : 'Hide from main assistant preset selector'}
                        onClick={() => toggleVisibility(preset)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full p-0.5 transition-colors ${
                          preset.isVisible === false ? 'bg-slate-300' : 'bg-blue-600'
                        }`}
                      >
                        <span
                          className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            preset.isVisible === false ? 'translate-x-0' : 'translate-x-5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
        />

        {editing && !presets.find(p => p.id === editing) && (
          <div
            ref={newPresetRef}
            className="ui-card"
          >
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Name"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="ui-input"
              />

              <select
                value={formData.apiConfigId || ''}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="ui-input"
              >
                <option value="">No provider (use current API config)</option>
                {apiConfigs.map((config) => (
                  <option key={config.id} value={config.id}>
                    {config.name}
                  </option>
                ))}
              </select>

              <select
                value={formData.modelId || ''}
                onChange={(e) => setFormData({ ...formData, modelId: e.target.value })}
                className="ui-input"
              >
                <option value="">Select Model</option>
                {modelOptions.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>

              <textarea
                placeholder="System Prompt"
                value={formData.systemPrompt || ''}
                onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                rows={4}
                className="ui-input resize-none"
              />

              <div className="space-y-1">
                <label className="ui-label mb-0">Request API</label>
                <select
                  value={normalizeRequestApi(formData.requestApi)}
                  onChange={(e) => setFormData({ ...formData, requestApi: e.target.value as RequestApi })}
                  className="ui-input"
                >
                  {REQUEST_API_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-base text-slate-700">
                <input
                  type="checkbox"
                  checked={formData.enableWebSearch === true}
                  onChange={(e) => setFormData({ ...formData, enableWebSearch: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                />
                Enable Web Search
              </label>

              <label className="flex items-center gap-2 text-base text-slate-700">
                <input
                  type="checkbox"
                  checked={formData.useVercelServerProxy === true}
                  onChange={(e) => setFormData({ ...formData, useVercelServerProxy: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                />
                Send requests via Vercel server proxy
              </label>

              <div className="space-y-2">
                <label className="ui-label mb-0">Model Parameters</label>
                {Object.entries(formData.parameters || {}).map(([key, value]) => (
                  <div
                    key={key}
                    className="grid grid-cols-1 sm:grid-cols-[12rem_minmax(0,1fr)_auto] gap-2 items-start sm:items-center"
                  >
                    <input
                      type="text"
                      value={key}
                      disabled
                      className="ui-input ui-input-muted sm:w-48"
                    />
                    <input
                      type="text"
                      value={formatParameterValue(value)}
                      onChange={(e) => updateParameter(key, e.target.value)}
                      className="ui-input min-w-0"
                    />
                    <button
                      onClick={() => updateParameter(key, '')}
                      className="ui-icon-btn ui-icon-btn-danger h-9 w-9 self-start sm:self-auto"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                <div className="w-full">
                  <select
                    className="ui-input"
                    onChange={(e) => {
                      if (e.target.value) {
                        addParameter(e.target.value);
                        e.target.value = '';
                      }
                    }}
                  >
                    <option value="">Add common parameter...</option>
                    <option value="temperature">temperature</option>
                    <option value="max_tokens">max_tokens</option>
                    <option value="top_p">top_p</option>
                    <option value="frequency_penalty">frequency_penalty</option>
                    <option value="presence_penalty">presence_penalty</option>
                    <option value="top_k">top_k</option>
                    <option value="stop">stop</option>
                  </select>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <label className="ui-label mb-0">Add Custom Parameter</label>
                  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-start sm:items-center">
                    <input
                      type="text"
                      placeholder="Parameter name"
                      id="custom-param-key-new"
                      className="ui-input"
                    />
                    <input
                      type="text"
                      placeholder="Value"
                      id="custom-param-value-new"
                      className="ui-input min-w-0"
                    />
                    <button
                      onClick={() => {
                        const keyInput = document.getElementById('custom-param-key-new') as HTMLInputElement;
                        const valueInput = document.getElementById('custom-param-value-new') as HTMLInputElement;
                        if (keyInput && valueInput && keyInput.value.trim()) {
                          addCustomParameter(keyInput.value, valueInput.value);
                          keyInput.value = '';
                          valueInput.value = '';
                        }
                      }}
                      className="ui-btn ui-btn-secondary h-10 w-10 px-0"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="ui-btn ui-btn-primary"
                >
                  <Check className="w-4 h-4" />
                  Save
                </button>
                <button
                  onClick={handleCancel}
                  className="ui-btn ui-btn-secondary"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {presets.length === 0 && !editing && availableModels.length > 0 && (
        <p className="text-slate-500 text-center py-8">
          No assistant presets yet. Click &quot;Add Preset&quot; to create one.
        </p>
      )}
    </div>
  );
}
