import type { WebSearchCall } from '@/types';

const STREAM_STATUSES = new Map<string, WebSearchCall['status']>([
  ['response.web_search_call.in_progress', 'in_progress'],
  ['response.web_search_call.searching', 'searching'],
  ['response.web_search_call.completed', 'completed'],
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isActive(status: WebSearchCall['status']): boolean {
  return status === 'in_progress' || status === 'searching';
}

export function finishWebSearchCalls(
  calls: WebSearchCall[],
  status: 'failed' | 'stopped' | 'incomplete' = 'incomplete'
): WebSearchCall[] {
  return calls.some((call) => isActive(call.status))
    ? calls.map((call) => isActive(call.status) ? { ...call, status } : call)
    : calls;
}

function mergeCall(calls: WebSearchCall[], item: Record<string, unknown>): WebSearchCall[] {
  if (typeof item.id !== 'string' || !item.id.trim()) return calls;
  const index = calls.findIndex((call) => call.id === item.id);
  const previous = calls[index];
  const next: WebSearchCall = { ...previous, id: item.id, status: previous?.status ?? 'in_progress' };

  if (['in_progress', 'searching', 'completed', 'failed', 'incomplete'].includes(String(item.status))) {
    const status = item.status as WebSearchCall['status'];
    const regresses = previous && (
      (!isActive(previous.status) && isActive(status))
      || (previous.status === 'searching' && status === 'in_progress')
    );
    if (!regresses) next.status = status;
  }

  const action = isRecord(item.action) ? item.action : null;
  if (action && ['search', 'open_page', 'find_in_page'].includes(String(action.type))) {
    next.action = action.type as WebSearchCall['action'];
    const queries = [action.query, ...(Array.isArray(action.queries) ? action.queries : [])]
      .filter((query): query is string => typeof query === 'string' && query.trim().length > 0)
      .map((query) => query.trim());
    if (queries.length > 0) next.queries = [...new Set(queries)];
    if (typeof action.url === 'string') next.url = action.url;
    if (typeof action.pattern === 'string') next.pattern = action.pattern;
  }

  if (previous && JSON.stringify(previous) === JSON.stringify(next)) return calls;
  return index === -1 ? [...calls, next] : calls.map((call, callIndex) => callIndex === index ? next : call);
}

export function updateWebSearchCalls(calls: WebSearchCall[], event: unknown): WebSearchCall[] {
  if (!isRecord(event)) return calls;

  const status = STREAM_STATUSES.get(String(event.type));
  if (status) return mergeCall(calls, { id: event.item_id, status });

  if (event.type === 'response.output_item.added' || event.type === 'response.output_item.done') {
    return isRecord(event.item) && event.item.type === 'web_search_call'
      ? mergeCall(calls, event.item)
      : calls;
  }

  if (['response.completed', 'response.incomplete', 'response.failed'].includes(String(event.type))) {
    const output = isRecord(event.response) && Array.isArray(event.response.output) ? event.response.output : [];
    const updated = output.reduce<WebSearchCall[]>((current, item) => (
      isRecord(item) && item.type === 'web_search_call' ? mergeCall(current, item) : current
    ), calls);
    return finishWebSearchCalls(updated, event.type === 'response.failed' ? 'failed' : 'incomplete');
  }

  return calls;
}
