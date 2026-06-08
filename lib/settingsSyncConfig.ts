import type { SettingsSyncConfig } from '@/types';
import { DEFAULT_SETTINGS_SYNC_FILENAME } from './settingsTransferCore';

export const normalizeSettingsSyncConfig = (
  config: SettingsSyncConfig
): SettingsSyncConfig => ({
  githubToken: config.githubToken.trim(),
  gistId: config.gistId.trim(),
  filename: config.filename.trim() || DEFAULT_SETTINGS_SYNC_FILENAME,
});
