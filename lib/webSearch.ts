import type { RequestApi } from '@/types';
import { getResponsesProvider } from './responsesRequest.ts';

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

  const provider = getResponsesProvider(baseUrl);
  if (!provider) {
    return request;
  }
  const toolType = provider === 'openrouter' ? 'openrouter:web_search' : 'web_search';

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
