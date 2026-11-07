import type { RequestApi } from '@/types';

interface WebSearchOptions {
  baseUrl: string;
  requestApi?: RequestApi;
  enabled?: boolean;
}

export function withOpenAIWebSearch<T extends Record<string, unknown>>(
  request: T,
  { baseUrl, requestApi, enabled }: WebSearchOptions
): T {
  if (enabled !== true || requestApi !== 'responses') {
    return request;
  }

  try {
    const url = new URL(baseUrl);
    const path = url.pathname.replace(/\/$/, '');
    if (
      url.origin !== 'https://api.openai.com'
      || (path !== '/v1' && path !== '/v1/responses')
      || url.username || url.password || url.search || url.hash
    ) {
      return request;
    }
  } catch {
    return request;
  }

  const tools = Array.isArray(request.tools) ? request.tools : [];
  if (tools.some((tool) => (
    tool?.type === 'web_search'
    || tool?.type === 'web_search_preview'
    || tool?.type === 'web_search_preview_2025_03_11'
  ))) {
    return request;
  }

  return { ...request, tools: [...tools, { type: 'web_search' }] };
}
