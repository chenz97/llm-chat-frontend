import type { SettingsSyncConfig } from '@/types';

const DEFAULT_SETTINGS_SYNC_FILENAME = 'llm-chat-settings.json';

export const normalizeSettingsSyncConfig = (
  config: SettingsSyncConfig
): SettingsSyncConfig => ({
  githubToken: config.githubToken.trim(),
  gistId: config.gistId.trim(),
  filename: config.filename.trim() || DEFAULT_SETTINGS_SYNC_FILENAME,
});

export const hasConfiguredGistSync = (config: SettingsSyncConfig): boolean => {
  const normalized = normalizeSettingsSyncConfig(config);
  return Boolean(normalized.githubToken && normalized.gistId);
};
