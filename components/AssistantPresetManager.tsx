'use client';

import { useState, useEffect } from 'react';
import { AssistantPreset, ApiConfig } from '@/types';
import {
  getAssistantPresets,
  saveAssistantPreset,
  deleteAssistantPreset,
  generateId,
  getApiConfigs,
  getDefaultPresetId,
  setDefaultPresetId,
} from '@/lib/storage';
import { Plus, Trash2, Edit2, Check, X, Star } from 'lucide-react';

export default function AssistantPresetManager() {
  const [presets, setPresets] = useState<AssistantPreset[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<AssistantPreset>>({});
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [apiConfigs, setApiConfigs] = useState<ApiConfig[]>([]);
  const [mounted, setMounted] = useState(false);
  const [defaultPresetId, setDefaultPresetIdState] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setPresets(getAssistantPresets());
    setDefaultPresetIdState(getDefaultPresetId());

    // Get all available models from API configs
    const configs = getApiConfigs();
    setApiConfigs(configs);
    const models = configs.flatMap(c => c.models);
    setAvailableModels([...new Set(models)]);
  }, []);

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
      createdAt: Date.now(),
    };
    setEditing(newPreset.id);
    setFormData(newPreset);
  };

  const handleSave = () => {
    if (!formData.id) return;

    const preset: AssistantPreset = {
      id: formData.id,
      name: formData.name || 'Unnamed Assistant',
      apiConfigId: formData.apiConfigId || undefined,
      modelId: formData.modelId || '',
      systemPrompt: formData.systemPrompt || '',
      parameters: formData.parameters || {},
      createdAt: formData.createdAt || Date.now(),
    };

    saveAssistantPreset(preset);
    setPresets(getAssistantPresets());
    setEditing(null);
    setFormData({});
  };

  const handleEdit = (preset: AssistantPreset) => {
    setEditing(preset.id);
    setFormData(preset);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this assistant preset?')) {
      deleteAssistantPreset(id);
      setPresets(getAssistantPresets());
      setDefaultPresetIdState(getDefaultPresetId());
    }
  };

  const toggleDefault = (id: string) => {
    if (defaultPresetId === id) {
      setDefaultPresetId(null);
      setDefaultPresetIdState(null);
    } else {
      setDefaultPresetId(id);
      setDefaultPresetIdState(id);
    }
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

  const modelOptions = resolveModelsForProvider(formData.apiConfigId);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900">Assistant Presets</h2>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
        {presets.map(preset => (
          <div
            key={preset.id}
            className="app-panel p-4 sm:p-5"
          >
            {editing === preset.id ? (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Name"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                />

                <select
                  value={formData.apiConfigId || ''}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
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
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
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
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 resize-none"
                />

                <div className="space-y-2">
                  <label className="text-base text-slate-600 font-medium">Model Parameters</label>
                  {Object.entries(formData.parameters || {}).map(([key, value]) => (
                    <div
                      key={key}
                      className="grid grid-cols-1 sm:grid-cols-[12rem_minmax(0,1fr)_auto] gap-2 items-start sm:items-center"
                    >
                      <input
                        type="text"
                        value={key}
                        disabled
                        className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-700 sm:w-48"
                      />
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => updateParameter(key, e.target.value)}
                        className="w-full min-w-0 px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                      />
                      <button
                        onClick={() => updateParameter(key, '')}
                        className="self-start sm:self-auto p-2.5 text-red-600 hover:bg-red-50 rounded-md"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  <div className="w-full">
                    <select
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
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
                    <label className="text-base text-slate-600 font-medium">Add Custom Parameter</label>
                    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-start sm:items-center">
                      <input
                        type="text"
                        placeholder="Parameter name"
                        id="custom-param-key"
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                      />
                      <input
                        type="text"
                        placeholder="Value"
                        id="custom-param-value"
                        className="w-full min-w-0 px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
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
                        className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <Check className="w-4 h-4" />
                    Save
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-500 text-white rounded-lg hover:bg-slate-600"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-semibold text-xl text-slate-900">{preset.name}</h3>
                    <p className="text-base text-slate-600 mt-1">Model: {preset.modelId}</p>
                    {preset.apiConfigId && (
                      <p className="text-sm text-slate-500 mt-1">
                        Provider: {apiConfigs.find((config) => config.id === preset.apiConfigId)?.name || 'Unknown provider'}
                      </p>
                    )}
                    {preset.systemPrompt && (
                      <p className="text-base text-slate-500 mt-1 line-clamp-2">
                        {preset.systemPrompt}
                      </p>
                    )}
                    {Object.keys(preset.parameters).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {Object.entries(preset.parameters).map(([key, value]) => (
                          <span
                            key={key}
                            className="px-2.5 py-1 bg-blue-100 text-blue-700 text-sm rounded-md border border-blue-200 break-all"
                          >
                            {key}: {value}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleDefault(preset.id)}
                      className={`p-2.5 rounded-md transition-colors ${
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
                      className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-md"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(preset.id)}
                      className="p-2.5 text-red-600 hover:bg-red-50 rounded-md"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {editing && !presets.find(p => p.id === editing) && (
          <div className="app-panel p-4 sm:p-5">
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Name"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
              />

              <select
                value={formData.apiConfigId || ''}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
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
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
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
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 resize-none"
              />

              <div className="space-y-2">
                <label className="text-base text-gray-400">Model Parameters</label>
                {Object.entries(formData.parameters || {}).map(([key, value]) => (
                  <div
                    key={key}
                    className="grid grid-cols-1 sm:grid-cols-[12rem_minmax(0,1fr)_auto] gap-2 items-start sm:items-center"
                  >
                    <input
                      type="text"
                      value={key}
                      disabled
                      className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-700 sm:w-48"
                    />
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => updateParameter(key, e.target.value)}
                      className="w-full min-w-0 px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                    />
                    <button
                      onClick={() => updateParameter(key, '')}
                      className="self-start sm:self-auto p-2.5 text-red-600 hover:bg-red-50 rounded-md"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                <div className="w-full">
                  <select
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
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

                <div className="space-y-2 pt-2 border-t border-gray-700">
                  <label className="text-base text-slate-600 font-medium">Add Custom Parameter</label>
                  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-start sm:items-center">
                    <input
                      type="text"
                      placeholder="Parameter name"
                      id="custom-param-key-new"
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                    />
                    <input
                      type="text"
                      placeholder="Value"
                      id="custom-param-value-new"
                      className="w-full min-w-0 px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
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
                      className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Check className="w-4 h-4" />
                  Save
                </button>
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
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
