export interface ChatDeepLinkAction {
  prompt: string;
  autoSend: boolean;
}

function parseHashParams(hash: string): URLSearchParams {
  const normalizedHash = hash.startsWith('#') ? hash.slice(1) : hash;
  return new URLSearchParams(
    normalizedHash.startsWith('?') ? normalizedHash.slice(1) : normalizedHash
  );
}

export function parseChatDeepLinkAction(urlValue: string): ChatDeepLinkAction | null {
  let url: URL;

  try {
    url = new URL(urlValue);
  } catch {
    return null;
  }

  const searchPrompt = url.searchParams.get('prompt');
  const hashParams = parseHashParams(url.hash);
  const prompt = (searchPrompt ?? hashParams.get('prompt') ?? '').trim();

  if (!prompt) {
    return null;
  }

  const autoSendValue = searchPrompt !== null
    ? url.searchParams.get('autoSend')
    : hashParams.get('autoSend');

  return {
    prompt,
    autoSend: autoSendValue === '1',
  };
}
