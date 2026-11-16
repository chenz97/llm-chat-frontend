import type { RequestApi } from '@/types';

interface WebSearchOptions {
  baseUrl: string;
  requestApi?: RequestApi;
  enabled?: boolean;
}

export function withWebSearch<T extends Record<string, unknown>>(
  request: T,
  { baseUrl, requestApi, enabled }: WebSearchOptions
): T {
  if (enabled !== true || requestApi !== 'responses') {
    return request;
  }

  let toolType: 'web_search' | 'openrouter:web_search';
  try {
    const url = new URL(baseUrl);
    const path = url.pathname.replace(/\/$/, '');
    if (url.username || url.password || url.search || url.hash) {
      return request;
    }

    if (url.origin === 'https://api.openai.com' && (path === '/v1' || path === '/v1/responses')) {
      toolType = 'web_search';
    } else if (url.origin === 'https://openrouter.ai' && (path === '/api/v1' || path === '/api/v1/responses')) {
      toolType = 'openrouter:web_search';
    } else {
      return request;
    }
  } catch {
    return request;
  }

  const tools = Array.isArray(request.tools) ? request.tools : [];
  if (tools.some((tool) => (
    tool?.type === toolType
    || (toolType === 'web_search' && (
      tool?.type === 'web_search_preview'
      || tool?.type === 'web_search_preview_2025_03_11'
    ))
  ))) {
    return request;
  }

  return { ...request, tools: [...tools, { type: toolType }] };
}
