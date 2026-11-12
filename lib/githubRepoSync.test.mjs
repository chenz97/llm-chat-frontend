import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeRepository,
  pullSettingsFromRepo,
  pushSettingsToRepo,
} from './githubRepoSync.ts';

const passphrase = 'correct horse battery staple';
const sampleSettings = {
  version: 1,
  exportedAt: 1710000000000,
  apiConfigs: [{ id: 'a', name: 'OpenAI', apiKey: 'sk-secret-value' }],
  assistantPresets: [],
  defaultPresetId: null,
};

const createResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status < 300 ? 'OK' : 'Error',
  json: async () => body,
});

const createFakeGitHub = ({ isPrivate = true } = {}) => {
  const calls = [];
  const files = new Map();
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (url === 'https://api.github.com/repos/me/vault') {
      return createResponse(200, { private: isPrivate });
    }
    const match = url.match(/^https:\/\/api\.github\.com\/repos\/me\/vault\/contents\/(.+)$/);
    if (!match) return createResponse(404, { message: 'Not Found' });
    const path = decodeURIComponent(match[1]);
    if (init.method === 'GET') {
      const file = files.get(path);
      return file ? createResponse(200, file) : createResponse(404, { message: 'Not Found' });
    }
    if (init.method === 'PUT') {
      const body = JSON.parse(init.body);
      const existing = files.get(path);
      if (existing && body.sha !== existing.sha) return createResponse(409, { message: 'sha mismatch' });
      files.set(path, { sha: `sha-${calls.length}`, content: body.content.replace(/(.{60})/g, '$1\n') });
      return createResponse(existing ? 200 : 201, { content: {} });
    }
    return createResponse(405, { message: 'Method not allowed' });
  };
  return { calls, files, fetcher };
};

test('push stores only ciphertext and pull round-trips the settings', async () => {
  const github = createFakeGitHub();
  const target = { token: 'github_pat_x', repository: 'me/vault', path: 'sync/settings.enc.json', passphrase, fetcher: github.fetcher };

  assert.deepEqual(await pushSettingsToRepo({ ...target, settings: sampleSettings }), { didCreate: true });
  assert.deepEqual(await pushSettingsToRepo({ ...target, settings: sampleSettings }), { didCreate: false });

  const stored = Buffer.from(github.files.get('sync/settings.enc.json').content, 'base64').toString('utf8');
  assert.equal(stored.includes('sk-secret-value'), false);
  assert.equal(JSON.parse(stored).format, 'llm-chat-encrypted-settings');
  assert.equal(github.calls[0].init.headers.Authorization, 'Bearer github_pat_x');

  assert.deepEqual(await pullSettingsFromRepo(target), sampleSettings);
});

test('push refuses to write to a public repository', async () => {
  const github = createFakeGitHub({ isPrivate: false });
  await assert.rejects(
    pushSettingsToRepo({ token: 't', repository: 'me/vault', path: 'a.json', passphrase, settings: sampleSettings, fetcher: github.fetcher }),
    /is not private/
  );
  assert.equal(github.calls.some((call) => call.init.method === 'PUT'), false);
});

test('pull fails with a wrong passphrase', async () => {
  const github = createFakeGitHub();
  const target = { token: 't', repository: 'me/vault', path: 'a.json', fetcher: github.fetcher };
  await pushSettingsToRepo({ ...target, passphrase, settings: sampleSettings });
  await assert.rejects(
    pullSettingsFromRepo({ ...target, passphrase: 'not the right one' }),
    /Failed to decrypt settings/
  );
});

test('pull reports a missing file', async () => {
  const github = createFakeGitHub();
  await assert.rejects(
    pullSettingsFromRepo({ token: 't', repository: 'me/vault', path: 'missing.json', passphrase, fetcher: github.fetcher }),
    /Settings file not found/
  );
});

test('normalizeRepository accepts URLs and rejects malformed input', () => {
  assert.equal(normalizeRepository(' https://github.com/me/vault.git '), 'me/vault');
  assert.throws(() => normalizeRepository('me'), /owner\/repo/);
  assert.throws(() => normalizeRepository('me/vault/../x'), /owner\/repo/);
});
