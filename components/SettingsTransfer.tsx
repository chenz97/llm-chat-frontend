'use client';

import { useEffect, useRef, useState } from 'react';
import { CloudDownload, CloudUpload, Download, Save, ShieldAlert, Upload } from 'lucide-react';
import type { SettingsExport, SettingsSyncConfig } from '@/types';
import { pullSettingsFromRepo, pushSettingsToRepo } from '@/lib/githubRepoSync';
import { MIN_PASSPHRASE_LENGTH } from '@/lib/settingsCrypto';
import { showFloatingStatus } from '@/lib/floatingStatus';
import { normalizeSettingsSyncConfig } from '@/lib/settingsSyncConfig';
import {
  getLegacyGistId,
  getSettingsSyncConfig,
  setSettingsSyncConfig,
} from '@/lib/storage';
import {
  buildExportData,
  DEFAULT_SETTINGS_SYNC_FILENAME,
  normalizeImportData,
  saveImportedSettings,
  SETTINGS_UPDATED_EVENT,
} from '@/lib/settingsTransfer';

type StatusMessage = {
  kind: 'success' | 'error';
  message: string;
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
  const [syncConfig, setSyncConfig] = useState<SettingsSyncConfig>({
    githubToken: '',
    repository: '',
    path: DEFAULT_SETTINGS_SYNC_FILENAME,
  });
  // The passphrase is intentionally kept only in memory and never persisted.
  const [passphrase, setPassphrase] = useState('');
  const [legacyGistId, setLegacyGistId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSyncConfig(getSettingsSyncConfig());
      setLegacyGistId(getLegacyGistId());
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  const showStatus = (nextStatus: StatusMessage) => {
    setStatus(nextStatus);
    showFloatingStatus(nextStatus);
  };

  const handleExport = async () => {
    try {
      const data = await buildExportData();
      downloadSettings(data);
      showStatus({
        kind: 'success',
        message: 'Settings exported successfully.',
      });
    } catch (error) {
      console.error('Failed to export settings:', error);
      showStatus({
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

      await saveImportedSettings(normalized);
      window.dispatchEvent(new Event(SETTINGS_UPDATED_EVENT));

      showStatus({
        kind: 'success',
        message: `Imported ${normalized.apiConfigs.length} API config(s) and ${normalized.assistantPresets.length} preset(s).`,
      });
    } catch (error) {
      console.error('Failed to import settings:', error);
      showStatus({
        kind: 'error',
        message: 'Failed to import settings. Please check the file format.',
      });
    } finally {
      event.target.value = '';
    }
  };

  const saveSyncConfig = (nextConfig: SettingsSyncConfig): boolean => {
    const normalized = normalizeSettingsSyncConfig(nextConfig);
    setSyncConfig(normalized);
    const didSave = setSettingsSyncConfig(normalized);
    if (didSave) setLegacyGistId(null);
    return didSave;
  };

  const handleSyncConfigChange = (field: keyof SettingsSyncConfig, value: string) => {
    setSyncConfig((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSaveSyncConfig = () => {
    const didSave = saveSyncConfig(syncConfig);
    showStatus({
      kind: didSave ? 'success' : 'error',
      message: didSave
        ? 'GitHub sync configuration saved.'
        : 'Failed to save GitHub sync configuration.',
    });
  };

  const handleSyncToGitHub = async () => {
    setIsSyncing(true);
    setStatus(null);

    try {
      const savedConfig = normalizeSettingsSyncConfig(syncConfig);
      const settings = await buildExportData();
      const result = await pushSettingsToRepo({
        token: savedConfig.githubToken,
        repository: savedConfig.repository,
        path: savedConfig.path,
        passphrase,
        settings,
      });
      saveSyncConfig(savedConfig);

      showStatus({
        kind: 'success',
        message: result.didCreate
          ? `Created encrypted ${savedConfig.path} in ${savedConfig.repository}.`
          : `Encrypted settings synced to ${savedConfig.repository}.`,
      });
    } catch (error) {
      console.error('Failed to sync settings to GitHub:', error);
      showStatus({
        kind: 'error',
        message: error instanceof Error
          ? error.message
          : 'Failed to sync settings to GitHub.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncFromGitHub = async () => {
    if (!confirm('Syncing from GitHub will overwrite existing API configurations and assistant presets. Continue?')) {
      return;
    }

    setIsSyncing(true);
    setStatus(null);

    try {
      const savedConfig = normalizeSettingsSyncConfig(syncConfig);
      saveSyncConfig(savedConfig);

      const parsed = await pullSettingsFromRepo({
        token: savedConfig.githubToken,
        repository: savedConfig.repository,
        path: savedConfig.path,
        passphrase,
      });
      const normalized = normalizeImportData(parsed);

      await saveImportedSettings(normalized);
      window.dispatchEvent(new Event(SETTINGS_UPDATED_EVENT));

      showStatus({
        kind: 'success',
        message: `Synced ${normalized.apiConfigs.length} API config(s) and ${normalized.assistantPresets.length} preset(s) from GitHub.`,
      });
    } catch (error) {
      console.error('Failed to sync settings from GitHub:', error);
      showStatus({
        kind: 'error',
        message: error instanceof Error
          ? error.message
          : 'Failed to sync settings from GitHub.',
      });
    } finally {
      setIsSyncing(false);
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

      <div className="app-panel p-4 sm:p-5 space-y-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Encrypted GitHub Sync</h3>
          <p className="text-sm text-slate-600">
            Settings are encrypted in this browser (AES-256-GCM, passphrase-derived key) and stored as a file in a
            private GitHub repository. GitHub only ever sees ciphertext.
          </p>
        </div>

        {legacyGistId && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>
              Gist sync has been removed because secret Gists are readable by anyone with the link and stored API keys
              in plaintext. Delete Gist <code>{legacyGistId}</code> on GitHub, revoke its token, and rotate any API keys
              it contained. Then configure a private repository below.
            </span>
          </div>
        )}

        <div className="grid gap-3">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            GitHub Token
            <input
              type="password"
              value={syncConfig.githubToken}
              onChange={(event) => handleSyncConfigChange('githubToken', event.target.value)}
              placeholder="Fine-grained token: this repo only, Contents read/write"
              autoComplete="off"
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Private Repository
            <input
              type="text"
              value={syncConfig.repository}
              onChange={(event) => handleSyncConfigChange('repository', event.target.value)}
              placeholder="owner/repo"
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            File Path
            <input
              type="text"
              value={syncConfig.path}
              onChange={(event) => handleSyncConfigChange('path', event.target.value)}
              placeholder={DEFAULT_SETTINGS_SYNC_FILENAME}
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Encryption Passphrase
            <input
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder={`At least ${MIN_PASSPHRASE_LENGTH} characters; never saved`}
              autoComplete="new-password"
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSaveSyncConfig}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            Save Sync Config
          </button>
          <button
            onClick={handleSyncToGitHub}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CloudUpload className="w-4 h-4" />
            Sync to GitHub
          </button>
          <button
            onClick={handleSyncFromGitHub}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CloudDownload className="w-4 h-4" />
            Sync from GitHub
          </button>
        </div>

        <p className="text-xs text-slate-500">
          The token is stored only in this browser and is not included in exported settings JSON. The passphrase is
          never stored; if you lose it, the synced file cannot be recovered. Sync refuses to use a public repository.
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
