import { Message, ChatCompletionRequest } from '@/types';

export interface StreamCallbacks {
  onMessage: (chunk: string) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
}

export async function streamChatCompletion(
  baseUrl: string,
  apiKey: string,
  request: ChatCompletionRequest,
  callbacks: StreamCallbacks,
  options?: { signal?: AbortSignal }
): Promise<void> {
  const { onMessage, onError, onComplete } = callbacks;

  try {
    // Ensure baseUrl ends with /v1 or /v1/chat/completions
    let endpoint = baseUrl.replace(/\/$/, '');
    if (!endpoint.endsWith('/chat/completions')) {
      if (!endpoint.endsWith('/v1')) {
        endpoint += '/v1';
      }
      endpoint += '/chat/completions';
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        ...request,
        stream: true,
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        onComplete();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine === 'data: [DONE]') {
          continue;
        }

        if (trimmedLine.startsWith('data: ')) {
          try {
            const jsonStr = trimmedLine.slice(6);
            const data = JSON.parse(jsonStr);

            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              onMessage(content);
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e, trimmedLine);
          }
        }
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      onError(error);
      return;
    }

    onError(error instanceof Error ? error : new Error(String(error)));
  }
}

export function convertToOpenAIMessages(
  messages: Array<{ role: string; content: string; imageUrl?: string }>
): Message[] {
  return messages.map(msg => {
    if (msg.role === 'user' && msg.imageUrl) {
      return {
        role: 'user',
        content: [
          { type: 'text' as const, text: msg.content },
          {
            type: 'image_url' as const,
            image_url: { url: msg.imageUrl }
          }
        ]
      };
    }

    return {
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content
    };
  });
}
