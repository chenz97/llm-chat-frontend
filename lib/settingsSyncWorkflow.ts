import { showFloatingStatus } from './floatingStatus';
import { pushSettingsToGist } from './githubGistSync';
import { getSettingsSyncConfig, setSettingsSyncConfig } from './storage';
import { buildExportData } from './settingsTransfer';
export {
  hasConfiguredGistSync,
  normalizeSettingsSyncConfig,
} from './settingsSyncWorkflowCore';
import {
  hasConfiguredGistSync,
  normalizeSettingsSyncConfig,
} from './settingsSyncWorkflowCore';

export const syncCurrentSettingsToConfiguredGist = async (): Promise<string> => {
  const config = normalizeSettingsSyncConfig(getSettingsSyncConfig());
  if (!hasConfiguredGistSync(config)) {
    throw new Error('GitHub Gist sync is not configured.');
  }

  const settings = await buildExportData();
  const result = await pushSettingsToGist({
    token: config.githubToken,
    gistId: config.gistId,
    filename: config.filename,
    settings,
  });

  if (result.gistId !== config.gistId) {
    setSettingsSyncConfig({
      ...config,
      gistId: result.gistId,
    });
  }

  return result.gistId;
};

export const promptSyncSettingsAfterLocalChange = async (
  changeLabel: string
): Promise<void> => {
  const config = getSettingsSyncConfig();
  if (!hasConfiguredGistSync(config)) {
    return;
  }

  const shouldSync = window.confirm(`${changeLabel} saved locally. Sync settings to GitHub Gist now?`);
  if (!shouldSync) {
    return;
  }

  try {
    await syncCurrentSettingsToConfiguredGist();
    showFloatingStatus({
      kind: 'success',
      message: 'Settings synced to GitHub Gist.',
    });
  } catch (error) {
    console.error('Failed to sync settings after local change:', error);
    showFloatingStatus({
      kind: 'error',
      message: error instanceof Error ? error.message : 'Failed to sync settings to GitHub Gist.',
    });
  }
};
