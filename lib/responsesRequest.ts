import type { ChatMessage, ResponsesInputMessage, ResponsesRequest } from '@/types';
import { getMessageImageUrls } from './imageUtils.ts';

export function getResponsesProvider(baseUrl: string): 'openai' | 'openrouter' | null {
  try {
    const url = new URL(baseUrl.trim());
    const path = url.pathname.replace(/\/$/, '');
    if (url.username || url.password || url.search || url.hash) {
      return null;
    }

    if (url.origin === 'https://api.openai.com' && (path === '/v1' || path === '/v1/responses')) {
      return 'openai';
    }
    if (url.origin === 'https://openrouter.ai' && (path === '/api/v1' || path === '/api/v1/responses')) {
      return 'openrouter';
    }
  } catch {
    return null;
  }
  return null;
}

function toInputMessage(message: ChatMessage): ResponsesInputMessage {
  const imageUrls = message.role === 'user' ? getMessageImageUrls(message) : [];

  return {
    role: message.role,
    content: imageUrls.length > 0 ? [
      { type: 'input_text', text: message.content },
      ...imageUrls.map((imageUrl) => ({ type: 'input_image' as const, image_url: imageUrl })),
    ] : message.content,
  };
}

function hasReplayableContent(message: ChatMessage): boolean {
  return message.role !== 'assistant' || message.content.trim().length > 0;
}

function buildStatelessInput(messages: ChatMessage[]): ResponsesRequest['input'] {
  return messages.filter(hasReplayableContent).map((message) => {
    if (message.role !== 'assistant') {
      return toInputMessage(message);
    }

    return {
      type: 'message',
      role: 'assistant',
      id: `msg_${message.id}`,
      status: 'completed',
      content: [{ type: 'output_text', text: message.content, annotations: [] }],
    };
  });
}

function findLatestAssistantResponseId(
  messages: ChatMessage[]
): { responseId: string; assistantIndex: number } | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant') {
      continue;
    }

    if (typeof message.responseId === 'string' && message.responseId.trim()) {
      return { responseId: message.responseId, assistantIndex: index };
    }

    return null;
  }

  return null;
}

interface ResponsesRequestOptions {
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  parameters: Record<string, unknown>;
  replayHistory?: boolean;
}

export function buildResponsesRequest({
  baseUrl,
  model,
  messages,
  systemPrompt,
  parameters,
  replayHistory,
}: ResponsesRequestOptions): ResponsesRequest {
  const requestOptions = { model, ...(systemPrompt ? { instructions: systemPrompt } : {}) };
  const isOpenRouter = getResponsesProvider(baseUrl) === 'openrouter';

  if (isOpenRouter || replayHistory) {
    const request: ResponsesRequest = {
      ...requestOptions,
      ...parameters,
      input: buildStatelessInput(messages),
    };
    delete request.previous_response_id;
    if (isOpenRouter && request.store === true) {
      delete request.store;
    }
    return request;
  }

  const previousResponse = findLatestAssistantResponseId(messages);
  const inputMessages = previousResponse
    ? messages.slice(previousResponse.assistantIndex + 1)
    : messages.filter(hasReplayableContent);

  return {
    ...requestOptions,
    input: inputMessages.map(toInputMessage),
    ...(previousResponse ? { previous_response_id: previousResponse.responseId } : {}),
    ...parameters,
  };
}
