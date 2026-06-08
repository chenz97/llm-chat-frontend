import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SETTINGS_SYNC_FILENAME,
  normalizeImportData,
} from './settingsTransferCore.ts';

test('normalizeImportData keeps valid settings and clears stale preset references', () => {
  const normalized = normalizeImportData({
    version: 1,
    exportedAt: 1710000000000,
    apiConfigs: [
      {
        id: 'api-1',
        name: 'Provider',
        baseUrl: 'https://example.com/v1',
        apiKey: 'secret',
        models: ['model-a', 42],
        createdAt: 1700000000000,
      },
    ],
    assistantPresets: [
      {
        id: 'preset-1',
        name: 'Visible preset',
        apiConfigId: 'api-1',
        modelId: 'model-a',
        systemPrompt: 'Be helpful.',
        parameters: { temperature: 0.2 },
        requestApi: 'responses',
        useVercelServerProxy: true,
        createdAt: 1700000000001,
      },
      {
        id: 'preset-2',
        name: 'Stale provider preset',
        apiConfigId: 'missing-api',
        modelId: 'model-b',
        systemPrompt: '',
        parameters: {},
        requestApi: 'unknown',
        isVisible: false,
        createdAt: 1700000000002,
      },
    ],
    defaultPresetId: 'preset-2',
  });

  assert.equal(DEFAULT_SETTINGS_SYNC_FILENAME, 'llm-chat-settings.json');
  assert.deepEqual(normalized.apiConfigs, [
    {
      id: 'api-1',
      name: 'Provider',
      baseUrl: 'https://example.com/v1',
      apiKey: 'secret',
      models: ['model-a'],
      createdAt: 1700000000000,
    },
  ]);
  assert.equal(normalized.assistantPresets[0].requestApi, 'responses');
  assert.equal(normalized.assistantPresets[0].isVisible, true);
  assert.equal(normalized.assistantPresets[1].apiConfigId, undefined);
  assert.equal(normalized.assistantPresets[1].requestApi, 'chat_completions');
  assert.equal(normalized.assistantPresets[1].isVisible, false);
  assert.equal(normalized.defaultPresetId, 'preset-2');
});

test('normalizeImportData rejects unsupported settings versions', () => {
  assert.throws(
    () => normalizeImportData({ version: 99, apiConfigs: [], assistantPresets: [] }),
    /Unsupported settings version/
  );
});
