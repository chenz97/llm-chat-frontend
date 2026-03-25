import { NextRequest } from 'next/server';
import { ChatCompletionRequest } from '@/types';
import { extractErrorMessage } from '@/lib/errorUtils';

interface ProxyRequestBody {
  baseUrl?: unknown;
  apiKey?: unknown;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(nextRequest: NextRequest): Promise<Response> {
  try {
    const payload = await nextRequest.json() as ProxyRequestBody;
    const baseUrl = typeof payload.baseUrl === 'string' ? payload.baseUrl.trim() : '';
    const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '';
    const chatRequest = payload.request;

    if (!baseUrl || !apiKey || !isRecord(chatRequest)) {
      return new Response('Missing required fields: baseUrl, apiKey, request', {
        status: 400,
      });
    }

    const upstreamResponse = await fetch(resolveChatCompletionsEndpoint(baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        ...(chatRequest as ChatCompletionRequest),
        stream: true,
      }),
      signal: nextRequest.signal,
    });

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

    const contentType = upstreamResponse.headers.get('content-type') || 'text/event-stream; charset=utf-8';
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-transform',
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
