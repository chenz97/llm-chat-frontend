import type { SettingsExport } from '@/types';

type Fetcher = typeof fetch;

interface PushSettingsToGistInput {
  token: string;
  gistId: string;
  filename: string;
  settings: SettingsExport;
  fetcher?: Fetcher;
}

interface PullSettingsFromGistInput {
  token: string;
  gistId: string;
  filename: string;
  fetcher?: Fetcher;
}

interface PushSettingsToGistResult {
  gistId: string;
  didCreate: boolean;
}

const GITHUB_GISTS_API_URL = 'https://api.github.com/gists';

const normalizeRequiredText = (value: string, fieldName: string): string => {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }
  return normalized;
};

const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const body = await response.json();
    if (
      typeof body === 'object'
      && body !== null
      && 'message' in body
      && typeof body.message === 'string'
    ) {
      return body.message;
    }
  } catch {
    // Fall back to response text below.
  }

  try {
    const text = await response.text();
    if (text) return text;
  } catch {
    // Use status text below.
  }

  return response.statusText || `HTTP ${response.status}`;
};

const requestJson = async (
  fetcher: Fetcher,
  url: string,
  init: RequestInit
): Promise<unknown> => {
  const response = await fetcher(url, init);
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(`GitHub API request failed (${response.status}): ${message}`);
  }

  return response.json();
};

const buildHeaders = (token: string) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'X-GitHub-Api-Version': '2022-11-28',
});

export const pushSettingsToGist = async ({
  token,
  gistId,
  filename,
  settings,
  fetcher = fetch,
}: PushSettingsToGistInput): Promise<PushSettingsToGistResult> => {
  const normalizedToken = normalizeRequiredText(token, 'GitHub token');
  const normalizedFilename = normalizeRequiredText(filename, 'Gist filename');
  const normalizedGistId = gistId.trim();
  const content = JSON.stringify(settings, null, 2);
  const body = normalizedGistId
    ? {
        files: {
          [normalizedFilename]: { content },
        },
      }
    : {
        description: 'llm-chat-frontend settings sync',
        public: false,
        files: {
          [normalizedFilename]: { content },
        },
      };

  const result = await requestJson(
    fetcher,
    normalizedGistId ? `${GITHUB_GISTS_API_URL}/${normalizedGistId}` : GITHUB_GISTS_API_URL,
    {
      method: normalizedGistId ? 'PATCH' : 'POST',
      headers: buildHeaders(normalizedToken),
      body: JSON.stringify(body),
    }
  );

  if (
    typeof result !== 'object'
    || result === null
    || !('id' in result)
    || typeof result.id !== 'string'
  ) {
    throw new Error('GitHub API response did not include a Gist ID.');
  }

  return {
    gistId: result.id,
    didCreate: !normalizedGistId,
  };
};

export const pullSettingsFromGist = async ({
  token,
  gistId,
  filename,
  fetcher = fetch,
}: PullSettingsFromGistInput): Promise<unknown> => {
  const normalizedToken = normalizeRequiredText(token, 'GitHub token');
  const normalizedGistId = normalizeRequiredText(gistId, 'Gist ID');
  const normalizedFilename = normalizeRequiredText(filename, 'Gist filename');

  const result = await requestJson(
    fetcher,
    `${GITHUB_GISTS_API_URL}/${normalizedGistId}`,
    {
      method: 'GET',
      headers: buildHeaders(normalizedToken),
    }
  );

  if (
    typeof result !== 'object'
    || result === null
    || !('files' in result)
    || typeof result.files !== 'object'
    || result.files === null
  ) {
    throw new Error('GitHub API response did not include Gist files.');
  }

  const files = result.files as Record<string, unknown>;
  const file = files[normalizedFilename];
  if (
    typeof file !== 'object'
    || file === null
    || !('content' in file)
    || typeof file.content !== 'string'
  ) {
    throw new Error(`Settings file not found in Gist: ${normalizedFilename}`);
  }

  try {
    return JSON.parse(file.content);
  } catch {
    throw new Error('Settings file contains invalid JSON.');
  }
};
