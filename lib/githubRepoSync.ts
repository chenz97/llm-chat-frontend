// Settings sync via a file in a *private* GitHub repository (Contents API).
// Unlike secret Gists, private repositories are not reachable by URL alone,
// and fine-grained tokens can be scoped to that single repository.
// The payload stored remotely is always an encrypted envelope (see settingsCrypto).

import type { SettingsExport } from '@/types';
import { decryptSettingsPayload, encryptSettingsPayload } from './settingsCrypto.ts';

type Fetcher = typeof fetch;

interface RepoSyncTarget {
  token: string;
  repository: string;
  path: string;
  passphrase: string;
  fetcher?: Fetcher;
}

interface PushSettingsToRepoInput extends RepoSyncTarget {
  settings: SettingsExport;
}

interface PushSettingsToRepoResult {
  didCreate: boolean;
}

const GITHUB_API_URL = 'https://api.github.com';
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

class GitHubApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(`GitHub API request failed (${status}): ${message}`);
    this.status = status;
  }
}

const normalizeRequiredText = (value: string, fieldName: string): string => {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }
  return normalized;
};

export const normalizeRepository = (value: string): string => {
  const normalized = normalizeRequiredText(value, 'Repository')
    .replace(/^https:\/\/github\.com\//, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
  if (!REPOSITORY_PATTERN.test(normalized)) {
    throw new Error('Repository must be in "owner/repo" format.');
  }
  return normalized;
};

export const normalizeRepoPath = (value: string): string => {
  const normalized = normalizeRequiredText(value, 'File path').replace(/^\/+/, '');
  if (normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('File path is invalid.');
  }
  return normalized;
};

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const body = await response.json();
    if (typeof body?.message === 'string') return body.message;
  } catch {
    // Fall through.
  }
  return response.statusText || `HTTP ${response.status}`;
};

const requestJson = async (
  fetcher: Fetcher,
  url: string,
  init: RequestInit
): Promise<Record<string, unknown>> => {
  const response = await fetcher(url, init);
  if (!response.ok) {
    throw new GitHubApiError(response.status, await readErrorMessage(response));
  }
  const body = await response.json();
  if (typeof body !== 'object' || body === null) {
    throw new Error('GitHub API returned an unexpected response.');
  }
  return body as Record<string, unknown>;
};

const buildHeaders = (token: string) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'X-GitHub-Api-Version': '2022-11-28',
});

const utf8ToBase64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const base64ToUtf8 = (value: string): string => {
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

// Refuse to read or write unless GitHub confirms the repository is private.
const assertPrivateRepository = async (
  fetcher: Fetcher,
  token: string,
  repository: string
) => {
  const repo = await requestJson(fetcher, `${GITHUB_API_URL}/repos/${repository}`, {
    method: 'GET',
    headers: buildHeaders(token),
  });
  if (repo.private !== true) {
    throw new Error(`Repository ${repository} is not private. Settings sync only works with private repositories.`);
  }
};

const fetchExistingFile = async (
  fetcher: Fetcher,
  token: string,
  repository: string,
  path: string
): Promise<{ sha: string; content: string } | null> => {
  try {
    const file = await requestJson(
      fetcher,
      `${GITHUB_API_URL}/repos/${repository}/contents/${encodePath(path)}`,
      { method: 'GET', headers: buildHeaders(token), cache: 'no-store' }
    );
    if (typeof file.sha !== 'string' || typeof file.content !== 'string') {
      throw new Error(`${path} is not a regular file in ${repository}.`);
    }
    return { sha: file.sha, content: file.content };
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) return null;
    throw error;
  }
};

export const pushSettingsToRepo = async ({
  token,
  repository,
  path,
  passphrase,
  settings,
  fetcher = fetch,
}: PushSettingsToRepoInput): Promise<PushSettingsToRepoResult> => {
  const normalizedToken = normalizeRequiredText(token, 'GitHub token');
  const normalizedRepository = normalizeRepository(repository);
  const normalizedPath = normalizeRepoPath(path);

  const envelope = await encryptSettingsPayload(settings, passphrase);
  await assertPrivateRepository(fetcher, normalizedToken, normalizedRepository);
  const existing = await fetchExistingFile(fetcher, normalizedToken, normalizedRepository, normalizedPath);

  await requestJson(
    fetcher,
    `${GITHUB_API_URL}/repos/${normalizedRepository}/contents/${encodePath(normalizedPath)}`,
    {
      method: 'PUT',
      headers: buildHeaders(normalizedToken),
      body: JSON.stringify({
        message: 'Update encrypted llm-chat-frontend settings',
        content: utf8ToBase64(JSON.stringify(envelope, null, 2)),
        ...(existing ? { sha: existing.sha } : {}),
      }),
    }
  );

  return { didCreate: !existing };
};

export const pullSettingsFromRepo = async ({
  token,
  repository,
  path,
  passphrase,
  fetcher = fetch,
}: RepoSyncTarget): Promise<unknown> => {
  const normalizedToken = normalizeRequiredText(token, 'GitHub token');
  const normalizedRepository = normalizeRepository(repository);
  const normalizedPath = normalizeRepoPath(path);
  if (!passphrase) {
    throw new Error('Encryption passphrase is required.');
  }

  await assertPrivateRepository(fetcher, normalizedToken, normalizedRepository);
  const file = await fetchExistingFile(fetcher, normalizedToken, normalizedRepository, normalizedPath);
  if (!file) {
    throw new Error(`Settings file not found in ${normalizedRepository}: ${normalizedPath}`);
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(base64ToUtf8(file.content));
  } catch {
    throw new Error('Remote settings file contains invalid JSON.');
  }

  return decryptSettingsPayload(envelope, passphrase);
};
