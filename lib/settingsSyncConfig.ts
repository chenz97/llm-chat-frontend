import type { SettingsSyncConfig } from '@/types';
import { DEFAULT_SETTINGS_SYNC_FILENAME } from './settingsTransferCore';

export const normalizeSettingsSyncConfig = (
  config: SettingsSyncConfig
): SettingsSyncConfig => ({
  githubToken: config.githubToken.trim(),
  repository: config.repository.trim(),
  path: config.path.trim().replace(/^\/+/, '') || DEFAULT_SETTINGS_SYNC_FILENAME,
});
