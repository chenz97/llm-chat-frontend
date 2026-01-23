'use client';

import { useState, useEffect } from 'react';
import { ApiConfig } from '@/types';
import { getApiConfigs, saveApiConfig, deleteApiConfig, generateId } from '@/lib/storage';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';

export default function ApiConfigManager() {
  const [configs, setConfigs] = useState<ApiConfig[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<ApiConfig>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setConfigs(getApiConfigs());
  }, []);

  if (!mounted) {
    return null;
  }

  const handleAdd = () => {
    const newConfig: ApiConfig = {
      id: generateId(),
      name: 'New API Config',
      baseUrl: '',
      apiKey: '',
      models: [],
      createdAt: Date.now(),
    };
    setEditing(newConfig.id);
    setFormData(newConfig);
  };

  const handleSave = () => {
    if (!formData.id) return;

    const config: ApiConfig = {
      id: formData.id,
      name: formData.name || 'Unnamed Config',
      baseUrl: formData.baseUrl || '',
      apiKey: formData.apiKey || '',
      models: formData.models || [],
      createdAt: formData.createdAt || Date.now(),
    };

    saveApiConfig(config);
    setConfigs(getApiConfigs());
    setEditing(null);
    setFormData({});
  };

  const handleEdit = (config: ApiConfig) => {
    setEditing(config.id);
    setFormData(config);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this API configuration?')) {
      deleteApiConfig(id);
      setConfigs(getApiConfigs());
    }
  };

  const handleCancel = () => {
    if (editing && !configs.find(c => c.id === editing)) {
      // Was adding a new config, just cancel
    }
    setEditing(null);
    setFormData({});
  };

  const updateModels = (value: string) => {
    const models = value.split(',').map(m => m.trim()).filter(Boolean);
    setFormData({ ...formData, models });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900">API Configurations</h2>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Add Config
        </button>
      </div>

      <div className="space-y-2.5">
        {configs.map(config => (
          <div
            key={config.id}
            className="app-panel p-4 sm:p-5"
          >
            {editing === config.id ? (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Name"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                />
                <input
                  type="text"
                  placeholder="Base URL (e.g., https://api.openai.com/v1)"
                  value={formData.baseUrl || ''}
                  onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                />
                <input
                  type="password"
                  placeholder="API Key"
                  value={formData.apiKey || ''}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                />
                <input
                  type="text"
                  placeholder="Models (comma-separated, e.g., gpt-4,gpt-3.5-turbo)"
                  value={formData.models?.join(', ') || ''}
                  onChange={(e) => updateModels(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                />
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
                    <h3 className="font-semibold text-xl text-slate-900">{config.name}</h3>
                    <p className="text-base text-slate-600 mt-1">{config.baseUrl}</p>
                    <p className="text-sm text-slate-500 mt-1">
                      API Key: {config.apiKey ? '•'.repeat(20) : 'Not set'}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {config.models.map((model, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 bg-blue-100 text-blue-700 text-sm rounded-md border border-blue-200"
                        >
                          {model}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(config)}
                      className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-md"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(config.id)}
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

        {editing && !configs.find(c => c.id === editing) && (
          <div className="app-panel p-4 sm:p-5">
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Name"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
              />
              <input
                type="text"
                placeholder="Base URL (e.g., https://api.openai.com/v1)"
                value={formData.baseUrl || ''}
                onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
              />
              <input
                type="password"
                placeholder="API Key"
                value={formData.apiKey || ''}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
              />
              <input
                type="text"
                placeholder="Models (comma-separated, e.g., gpt-4,gpt-3.5-turbo)"
                value={formData.models?.join(', ') || ''}
                onChange={(e) => updateModels(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
              />
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
          </div>
        )}
      </div>

      {configs.length === 0 && !editing && (
        <p className="text-slate-500 text-center py-8">
          No API configurations yet. Click &quot;Add Config&quot; to create one.
        </p>
      )}
    </div>
  );
}
