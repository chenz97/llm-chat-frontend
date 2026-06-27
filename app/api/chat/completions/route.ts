import { NextRequest } from 'next/server';
import { ChatCompletionRequest, RequestApi, ResponsesRequest } from '@/types';
import { extractErrorMessage } from '@/lib/errorUtils';

interface ProxyRequestBody {
  baseUrl?: unknown;
  apiKey?: unknown;
  requestApi?: unknown;
  stream?: unknown;
  request?: unknown;
}

function resolveChatCompletionsEndpoint(baseUrl: string): string {
  let endpoint = baseUrl.replace(/\/$/, '');
  if (!endpoint.endsWith('/chat/completions')) {
    if (!endpoint.endsWith('/v1')) {
      endpoint += '/v1';
    }
    endpoint += '/chat/completions';
  }
  return endpoint;
}

function resolveResponsesEndpoint(baseUrl: string): string {
  let endpoint = baseUrl.replace(/\/$/, '');
  if (!endpoint.endsWith('/responses')) {
    endpoint += '/responses';
  }
  return endpoint;
}

function normalizeRequestApi(value: unknown): RequestApi {
  return value === 'responses' ? 'responses' : 'chat_completions';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(nextRequest: NextRequest): Promise<Response> {
  try {
    const payload = await nextRequest.json() as ProxyRequestBody;
    const baseUrl = typeof payload.baseUrl === 'string' ? payload.baseUrl.trim() : '';
    const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '';
    const requestApi = normalizeRequestApi(payload.requestApi);
    const chatRequest = payload.request;
    const shouldStream = payload.stream !== false;

    if (!baseUrl || !apiKey || !isRecord(chatRequest)) {
      return new Response('Missing required fields: baseUrl, apiKey, request', {
        status: 400,
      });
    }

    const upstreamResponse = await fetch(
      requestApi === 'responses'
        ? resolveResponsesEndpoint(baseUrl)
        : resolveChatCompletionsEndpoint(baseUrl),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          ...(chatRequest as ChatCompletionRequest | ResponsesRequest),
          stream: shouldStream,
        }),
        signal: nextRequest.signal,
      }
    );

    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text();
      return new Response(errorText, {
        status: upstreamResponse.status,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }

    if (!upstreamResponse.body) {
      return new Response('Upstream response body is not readable', {
        status: 502,
      });
    }

    const contentType = upstreamResponse.headers.get('content-type') || (
      shouldStream ? 'text/event-stream; charset=utf-8' : 'application/json; charset=utf-8'
    );
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: {
        'Content-Type': contentType,
        ...(shouldStream ? { 'Cache-Control': 'no-cache, no-transform' } : {}),
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return new Response('Request aborted', { status: 499 });
    }

    const message = extractErrorMessage(error);
    return new Response(message, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }
}
