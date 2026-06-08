import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasConfiguredGistSync,
  normalizeSettingsSyncConfig,
} from './settingsSyncWorkflowCore.ts';

test('normalizeSettingsSyncConfig trims values and restores the default filename', () => {
  assert.deepEqual(
    normalizeSettingsSyncConfig({
      githubToken: '  token  ',
      gistId: '  gist-id  ',
      filename: '   ',
    }),
    {
      githubToken: 'token',
      gistId: 'gist-id',
      filename: 'llm-chat-settings.json',
    }
  );
});

test('hasConfiguredGistSync requires both token and gist id', () => {
  assert.equal(hasConfiguredGistSync({
    githubToken: 'token',
    gistId: 'gist-id',
    filename: 'settings.json',
  }), true);

  assert.equal(hasConfiguredGistSync({
    githubToken: 'token',
    gistId: '',
    filename: 'settings.json',
  }), false);

  assert.equal(hasConfiguredGistSync({
    githubToken: '',
    gistId: 'gist-id',
    filename: 'settings.json',
  }), false);
});
