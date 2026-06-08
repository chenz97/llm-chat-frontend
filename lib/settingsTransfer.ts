import type {
  NormalizedSettingsImport,
  SettingsExport,
} from '@/types';
import {
  getApiConfigs,
  getAssistantPresets,
  getDefaultPresetId,
  setApiConfigs,
  setAssistantPresets,
  setDefaultPresetId,
} from './storage';
export {
  DEFAULT_SETTINGS_SYNC_FILENAME,
  normalizeImportData,
  SETTINGS_UPDATED_EVENT,
} from './settingsTransferCore';

export const buildExportData = async (): Promise<SettingsExport> => ({
  version: 1,
  exportedAt: Date.now(),
  apiConfigs: await getApiConfigs(),
  assistantPresets: await getAssistantPresets(),
  defaultPresetId: await getDefaultPresetId(),
});

export const saveImportedSettings = async (
  normalized: NormalizedSettingsImport
): Promise<void> => {
  const didSaveConfigs = await setApiConfigs(normalized.apiConfigs);
  if (!didSaveConfigs) {
    throw new Error('Failed to save API configurations.');
  }

  const didSavePresets = await setAssistantPresets(normalized.assistantPresets);
  if (!didSavePresets) {
    throw new Error('Failed to save assistant presets.');
  }

  await setDefaultPresetId(normalized.defaultPresetId);
};
