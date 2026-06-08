import assert from 'node:assert/strict';
import test from 'node:test';

import {
  pullSettingsFromGist,
  pushSettingsToGist,
} from './githubGistSync.ts';

const sampleSettings = {
  version: 1,
  exportedAt: 1710000000000,
  apiConfigs: [],
  assistantPresets: [],
  defaultPresetId: null,
};

const createResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 200 || status === 201 ? 'OK' : 'Error',
  json: async () => body,
  text: async () => JSON.stringify(body),
});

test('pushSettingsToGist creates a private gist when no gist id is configured', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return createResponse(201, { id: 'new-gist-id' });
  };

  const result = await pushSettingsToGist({
    token: 'ghp_test',
    gistId: '',
    filename: 'settings.json',
    settings: sampleSettings,
    fetcher,
  });

  assert.deepEqual(result, { gistId: 'new-gist-id', didCreate: true });
  assert.equal(calls[0].url, 'https://api.github.com/gists');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer ghp_test');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    description: 'llm-chat-frontend settings sync',
    public: false,
    files: {
      'settings.json': {
        content: JSON.stringify(sampleSettings, null, 2),
      },
    },
  });
});

test('pushSettingsToGist updates the configured gist when a gist id exists', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return createResponse(200, { id: 'existing-gist-id' });
  };

  const result = await pushSettingsToGist({
    token: 'ghp_test',
    gistId: 'existing-gist-id',
    filename: 'settings.json',
    settings: sampleSettings,
    fetcher,
  });

  assert.deepEqual(result, { gistId: 'existing-gist-id', didCreate: false });
  assert.equal(calls[0].url, 'https://api.github.com/gists/existing-gist-id');
  assert.equal(calls[0].init.method, 'PATCH');
});

test('pullSettingsFromGist reads and parses the configured settings file', async () => {
  const fetcher = async (url, init) => {
    assert.equal(url, 'https://api.github.com/gists/existing-gist-id');
    assert.equal(init.method, 'GET');
    return createResponse(200, {
      files: {
        'settings.json': {
          content: JSON.stringify(sampleSettings),
        },
      },
    });
  };

  const result = await pullSettingsFromGist({
    token: 'ghp_test',
    gistId: 'existing-gist-id',
    filename: 'settings.json',
    fetcher,
  });

  assert.deepEqual(result, sampleSettings);
});

test('pullSettingsFromGist reports a missing settings file', async () => {
  const fetcher = async () => createResponse(200, { files: {} });

  await assert.rejects(
    () => pullSettingsFromGist({
      token: 'ghp_test',
      gistId: 'existing-gist-id',
      filename: 'settings.json',
      fetcher,
    }),
    /Settings file not found/
  );
});
