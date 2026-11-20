'use client';

import { useState, useEffect, useRef } from 'react';
import { ApiConfig } from '@/types';
import { showFloatingStatus } from '@/lib/floatingStatus';
import { getApiConfigs, saveApiConfig, setApiConfigs, deleteApiConfig, generateId } from '@/lib/storage';
import { getNextSortOrder, reorderItems } from '@/lib/sortOrder';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import SortableList from './SortableList';

export default function ApiConfigManager() {
  const [configs, setConfigs] = useState<ApiConfig[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<ApiConfig>>({});
  const [modelsInput, setModelsInput] = useState('');
  const [mounted, setMounted] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const pendingScrollIdRef = useRef<string | null>(null);
  const newConfigRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const mountTimer = window.setTimeout(() => {
      if (!cancelled) {
        setMounted(true);
      }
    }, 0);

    const loadConfigs = async () => {
      const loaded = await getApiConfigs();
      if (!cancelled) {
        setConfigs(loaded);
      }
    };

    void loadConfigs();

    return () => {
      cancelled = true;
      window.clearTimeout(mountTimer);
    };
  }, []);

  useEffect(() => {
    if (!editing || pendingScrollIdRef.current !== editing || !newConfigRef.current) {
      return;
    }

    const scrollTarget = newConfigRef.current;
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

  const handleAdd = () => {
    const newConfig: ApiConfig = {
      id: generateId(),
      name: 'New API Config',
      baseUrl: '',
      apiKey: '',
      models: [],
      createdAt: Date.now(),
      sortOrder: getNextSortOrder(configs),
    };
    pendingScrollIdRef.current = newConfig.id;
    setEditing(newConfig.id);
    setFormData(newConfig);
    setModelsInput('');
  };

  const handleSave = async () => {
    if (!formData.id) return;

    // Prefer the current list position in case the list was reordered while editing.
    const sortOrder = configs.find((c) => c.id === formData.id)?.sortOrder ?? formData.sortOrder;
    const config: ApiConfig = {
      id: formData.id,
      name: formData.name || 'Unnamed Config',
      baseUrl: formData.baseUrl || '',
      apiKey: formData.apiKey || '',
      models: formData.models || [],
      createdAt: formData.createdAt || Date.now(),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    };

    const didSave = await saveApiConfig(config);
    if (!didSave) {
      showFloatingStatus({
        kind: 'error',
        message: 'Failed to save API configuration. Your browser storage may be full.',
      });
      alert('Failed to save API configuration. Your browser storage may be full.');
      return;
    }

    setConfigs(await getApiConfigs());
    setEditing(null);
    setFormData({});
    window.dispatchEvent(new Event('settingsUpdated'));
    showFloatingStatus({
      kind: 'success',
      message: 'API configuration saved locally.',
    });
  };

  const handleEdit = (config: ApiConfig) => {
    setEditing(config.id);
    setFormData(config);
    setModelsInput((config.models || []).join(', '));
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this API configuration?')) {
      const didDelete = await deleteApiConfig(id);
      if (!didDelete) {
        showFloatingStatus({
          kind: 'error',
          message: 'Failed to delete API configuration. Please try again.',
        });
        alert('Failed to delete API configuration. Please try again.');
        return;
      }

      setConfigs(await getApiConfigs());
      window.dispatchEvent(new Event('settingsUpdated'));
      showFloatingStatus({
        kind: 'success',
        message: 'API configuration deleted locally.',
      });
    }
  };

  const handleReorder = async (activeId: string, overId: string) => {
    const reordered = reorderItems(configs, activeId, overId);
    if (!reordered) return;

    const previous = configs;
    setConfigs(reordered);
    setIsReordering(true);
    const didSave = await setApiConfigs(reordered);
    setIsReordering(false);

    if (!didSave) {
      setConfigs(previous);
      showFloatingStatus({
        kind: 'error',
        message: 'Failed to save API configuration order. Your browser storage may be full.',
      });
      return;
    }

    window.dispatchEvent(new Event('settingsUpdated'));
  };

  const handleCancel = () => {
    if (editing && !configs.find(c => c.id === editing)) {
      // Was adding a new config, just cancel
    }
    setEditing(null);
    setFormData({});
    setModelsInput('');
  };

  const updateModels = (value: string) => {
    setModelsInput(value);
    const models = value
      .split(/[,\s，]+/)
      .map(m => m.trim())
      .filter(Boolean);
    setFormData((prev) => ({ ...prev, models }));
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-base font-semibold text-slate-900">API Configurations</h2>
        <button
          onClick={handleAdd}
          className="ui-btn ui-btn-primary"
        >
          <Plus className="w-4 h-4" />
          Add Config
        </button>
      </div>

      <div className="space-y-2.5">
        <SortableList
          items={configs}
          disabled={isReordering}
          className="space-y-2.5"
          itemClassName="ui-card"
          getItemLabel={(config) => config.name}
          onReorder={(activeId, overId) => void handleReorder(activeId, overId)}
          renderItem={(config, dragHandle) => (editing === config.id ? (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Name"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="ui-input"
                />
                <input
                  type="text"
                  placeholder="Base URL (e.g., https://api.openai.com/v1)"
                  value={formData.baseUrl || ''}
                  onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                  className="ui-input"
                />
                <input
                  type="password"
                  placeholder="API Key"
                  value={formData.apiKey || ''}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  className="ui-input"
                />
                <input
                  type="text"
                  placeholder="Models (comma-separated, e.g., gpt-4,gpt-3.5-turbo)"
                  value={modelsInput}
                  onChange={(e) => updateModels(e.target.value)}
                  className="ui-input"
                />
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
                <div className="flex justify-between items-start gap-2">
                  <div className="-ml-2 pt-0.5">{dragHandle}</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-[15px] text-slate-900">{config.name}</h3>
                    <p className="text-sm text-slate-600 mt-0.5 break-all">{config.baseUrl}</p>
                    <p className="text-[13px] text-slate-500 mt-0.5">
                      API Key: {config.apiKey ? '•'.repeat(20) : 'Not set'}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {config.models.map((model, i) => (
                        <span
                          key={i}
                          className="ui-chip"
                        >
                          {model}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(config)}
                      className="ui-icon-btn h-9 w-9"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(config.id)}
                      className="ui-icon-btn ui-icon-btn-danger h-9 w-9"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
        />

        {editing && !configs.find(c => c.id === editing) && (
          <div
            ref={newConfigRef}
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
              <input
                type="text"
                placeholder="Base URL (e.g., https://api.openai.com/v1)"
                value={formData.baseUrl || ''}
                onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                className="ui-input"
              />
              <input
                type="password"
                placeholder="API Key"
                value={formData.apiKey || ''}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                className="ui-input"
              />
              <input
                type="text"
                placeholder="Models (comma-separated, e.g., gpt-4,gpt-3.5-turbo)"
                value={modelsInput}
                onChange={(e) => updateModels(e.target.value)}
                className="ui-input"
              />
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

      {configs.length === 0 && !editing && (
        <p className="text-slate-500 text-center py-8">
          No API configurations yet. Click &quot;Add Config&quot; to create one.
        </p>
      )}
    </div>
  );
}
