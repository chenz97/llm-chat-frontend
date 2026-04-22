'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import {
  Conversation,
  ChatMessage,
  ApiConfig,
  AssistantPreset,
  TokenUsage,
  ChatCompletionRequest,
  ModelParameters,
  ProviderMetadata,
  ReasoningDetail,
} from '@/types';
import {
  saveConversation,
  updateConversationMessages,
  generateId,
  getApiConfig,
  getAssistantPreset,
} from '@/lib/storage';
import { streamChatCompletion, convertToOpenAIMessages } from '@/lib/api';
import { convertImagesToBase64, validateImageFile } from '@/lib/imageUtils';
import Message from './Message';
import { Send, Image as ImageIcon, Loader2, Square, ArrowDown } from 'lucide-react';

interface ChatInterfaceProps {
  conversation: Conversation | null;
  onConversationUpdate: (conversationId?: string) => void | Promise<void>;
}

const parseParameterValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const normalizeModelParameters = (parameters?: ModelParameters): ModelParameters => {
  if (!parameters) return {};

  return Object.fromEntries(
    Object.entries(parameters).map(([key, value]) => [key, parseParameterValue(value)])
  ) as ModelParameters;
};

const mergeProviderMetadata = (
  current: ProviderMetadata | undefined,
  next: Partial<ProviderMetadata>
): ProviderMetadata => {
  const usageDetails = {
    ...(current?.usageDetails ?? {}),
    ...(next.usageDetails ?? {}),
  };

  return {
    ...current,
    ...next,
    ...(Object.keys(usageDetails).length > 0 ? { usageDetails } : {}),
  };
};

export default function ChatInterface({
  conversation,
  onConversationUpdate,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [draftImages, setDraftImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);
  const [assistantPreset, setAssistantPreset] = useState<AssistantPreset | null>(null);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollEnabledRef = useRef(true);
  const previousConversationIdRef = useRef<string | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const streamingConversationIdRef = useRef<string | null>(null);
  const streamingAssistantMessageIdRef = useRef<string | null>(null);
  const isStreamingRef = useRef(false);
  const streamWasBackgroundedRef = useRef(false);
  const lastPersistAtRef = useRef(0);
  const persistTimerRef = useRef<number | null>(null);
  const pendingPersistRef = useRef<{ id: string; messages: ChatMessage[] } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    let cancelled = false;

    if (conversation) {
      setMessages(conversation.messages);

      const loadConfig = async () => {
        const config = await getApiConfig(conversation.apiConfigId);
        if (!cancelled) {
          setApiConfig(config || null);
        }
      };
      void loadConfig();

      if (conversation.assistantPresetId) {
        const presetId = conversation.assistantPresetId;
        const loadPreset = async () => {
          const preset = await getAssistantPreset(presetId);
          if (!cancelled) {
            setAssistantPreset(preset || null);
          }
        };
        void loadPreset();
      } else {
        setAssistantPreset(null);
      }
    } else {
      setMessages([]);
      setApiConfig(null);
      setAssistantPreset(null);
    }

    const conversationId = conversation?.id ?? null;
    activeConversationIdRef.current = conversationId;

    if (!conversation) {
      setIsLoading(false);
      previousConversationIdRef.current = null;
      return () => {
        cancelled = true;
      };
    }

    if (conversationId !== previousConversationIdRef.current) {
      autoScrollEnabledRef.current = true;
      setIsAutoScrollEnabled(true);
      previousConversationIdRef.current = conversationId;
    }

    if (
      streamingConversationIdRef.current === conversation.id
      && isStreamingRef.current
    ) {
      setIsLoading(true);
    } else {
      setIsLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [conversation]);

  function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
    const container = scrollContainerRef.current;
    if (!container) return;

    const maxScrollTop = container.scrollHeight - container.clientHeight;
    container.scrollTo({ top: Math.max(0, maxScrollTop), behavior });
  }

  useEffect(() => {
    if (autoScrollEnabledRef.current) {
      scrollToBottom(isStreamingRef.current ? 'auto' : 'smooth');
    }
  }, [messages]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const shouldAutoScroll = distanceFromBottom <= 80;

    if (shouldAutoScroll !== autoScrollEnabledRef.current) {
      autoScrollEnabledRef.current = shouldAutoScroll;
      setIsAutoScrollEnabled(shouldAutoScroll);
    }
  };

  const handleJumpToBottom = () => {
    autoScrollEnabledRef.current = true;
    setIsAutoScrollEnabled(true);
    scrollToBottom('auto');
  };

  const appendDraftImages = async (files: File[]) => {
    const validFiles = files.filter((file) => validateImageFile(file));
    if (validFiles.length === 0) {
      return;
    }

    const base64Images = await convertImagesToBase64(validFiles);
    setDraftImages((currentImages) => currentImages.concat(base64Images));
  };

  const updateMessageById = (
    currentMessages: ChatMessage[],
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage
  ) => currentMessages.map((message) => (
    message.id === messageId ? updater(message) : message
  ));

  const flushPendingPersist = async () => {
    const pending = pendingPersistRef.current;
    if (!pending) {
      persistTimerRef.current = null;
      return;
    }

    pendingPersistRef.current = null;
    persistTimerRef.current = null;
    await updateConversationMessages(pending.id, pending.messages);
    lastPersistAtRef.current = Date.now();
  };

  const persistStreamMessages = (conversationId: string, messagesToPersist: ChatMessage[]) => {
    pendingPersistRef.current = { id: conversationId, messages: messagesToPersist };

    const now = Date.now();
    if (now - lastPersistAtRef.current > 400) {
      void flushPendingPersist();
      return;
    }

    if (persistTimerRef.current === null) {
      const delay = Math.max(120, 400 - (now - lastPersistAtRef.current));
      persistTimerRef.current = window.setTimeout(() => {
        void flushPendingPersist();
      }, delay);
    }
  };

  const clearPersistQueue = () => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    pendingPersistRef.current = null;
  };

  const resetStreamingState = () => {
    abortControllerRef.current = null;
    isStreamingRef.current = false;
    streamingConversationIdRef.current = null;
    streamingAssistantMessageIdRef.current = null;
    streamWasBackgroundedRef.current = false;
  };

  const persistFinalConversation = async (
    conversationToPersist: Conversation,
    conversationId: string
  ) => {
    const didSave = await saveConversation(conversationToPersist);
    if (didSave) {
      await onConversationUpdate(conversationId);
    }
    window.dispatchEvent(new Event('conversationsUpdated'));
  };

  const stopStreaming = (reason: 'stopped' | 'error' = 'stopped', streamError?: string) => {
    abortControllerRef.current?.abort();
    clearPersistQueue();

    if (conversation && streamingAssistantMessageIdRef.current) {
      const finalMessages = updateMessageById(
        messagesRef.current,
        streamingAssistantMessageIdRef.current,
        (message) => ({
          ...message,
          streamState: reason,
          streamError,
        })
      );

      messagesRef.current = finalMessages;
      if (activeConversationIdRef.current === conversation.id) {
        setMessages(finalMessages);
      }

      const updatedConversation: Conversation = {
        ...conversation,
        messages: finalMessages,
        updatedAt: Date.now(),
      };

      resetStreamingState();
      void persistFinalConversation(updatedConversation, conversation.id);
    } else {
      resetStreamingState();
    }

    if (activeConversationIdRef.current === conversation?.id) {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const flushForBackground = () => {
      if (!isStreamingRef.current) {
        return;
      }

      streamWasBackgroundedRef.current = true;
      void flushPendingPersist();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushForBackground();
      }
    };

    window.addEventListener('pagehide', flushForBackground);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', flushForBackground);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const resolveTitle = (baseMessages: ChatMessage[], titleSeed?: string) => {
    if (!conversation || conversation.title !== 'New Conversation') {
      return conversation?.title || 'New Conversation';
    }

    const candidate = titleSeed?.trim()
      || baseMessages.slice().reverse().find((msg) => msg.role === 'user')?.content;

    return candidate ? candidate.slice(0, 50) : conversation.title;
  };

  const startAssistantResponse = async (baseMessages: ChatMessage[], titleSeed?: string) => {
    if (!conversation) return;

    let resolvedApiConfig: ApiConfig | null = apiConfig;
    if (!resolvedApiConfig || resolvedApiConfig.id !== conversation.apiConfigId) {
      resolvedApiConfig = (await getApiConfig(conversation.apiConfigId)) || null;
    }
    if (!resolvedApiConfig) return;
    if (!apiConfig || apiConfig.id !== resolvedApiConfig.id) {
      setApiConfig(resolvedApiConfig);
    }

    const conversationId = conversation.id;
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const assistantMessageId = generateId();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      reasoning: '',
      providerMetadata: undefined,
      streamState: 'streaming',
      timestamp: Date.now(),
    };

    let streamMessages = [...baseMessages, assistantMessage];
    let firstTokenTimestamp: number | null = null;

    setIsLoading(true);
    streamingConversationIdRef.current = conversationId;
    streamingAssistantMessageIdRef.current = assistantMessageId;
    isStreamingRef.current = true;
    streamWasBackgroundedRef.current = false;

    if (activeConversationIdRef.current === conversationId) {
      setMessages(streamMessages);
    }

    messagesRef.current = streamMessages;

    const pendingConversation: Conversation = {
      ...conversation,
      messages: streamMessages,
      title: resolveTitle(baseMessages, titleSeed),
      updatedAt: Date.now(),
    };

    const didSavePending = await saveConversation(pendingConversation);
    if (didSavePending) {
      await onConversationUpdate(conversationId);
    }
    window.dispatchEvent(new Event('conversationsUpdated'));

    let resolvedPreset: AssistantPreset | null = assistantPreset;
    if (conversation.assistantPresetId) {
      if (!resolvedPreset || resolvedPreset.id !== conversation.assistantPresetId) {
        resolvedPreset = (await getAssistantPreset(conversation.assistantPresetId)) || null;
      }
    } else {
      resolvedPreset = null;
    }

    if (resolvedPreset && (!assistantPreset || assistantPreset.id !== resolvedPreset.id)) {
      setAssistantPreset(resolvedPreset);
    }

    if (
      !isStreamingRef.current
      || streamingConversationIdRef.current !== conversationId
      || streamingAssistantMessageIdRef.current !== assistantMessageId
    ) {
      return;
    }

    const apiMessages = convertToOpenAIMessages(baseMessages);

    if (resolvedPreset?.systemPrompt) {
      apiMessages.unshift({
        role: 'system',
        content: resolvedPreset.systemPrompt,
      });
    }

    let accumulatedContent = '';
    let accumulatedReasoning = '';
    let latestUsage: TokenUsage | null = null;
    const rawResponseLines: string[] = [];

    const request: ChatCompletionRequest = {
      model: conversation.modelIdOverride
        || resolvedPreset?.modelId
        || resolvedApiConfig.models[0]
        || 'gpt-3.5-turbo',
      messages: apiMessages,
      ...normalizeModelParameters(resolvedPreset?.parameters),
    };

    const streamOptions = request.stream_options;
    request.stream_options = {
      ...(typeof streamOptions === 'object' && streamOptions !== null ? streamOptions : {}),
      include_usage: true,
    };

    let accumulatedReasoningDetails: ReasoningDetail[] = [];
    let accumulatedProviderMetadata: ProviderMetadata | undefined = request.cache_control !== undefined
      ? { cacheControl: request.cache_control }
      : undefined;

    const rawResponse = () => rawResponseLines.length > 0
      ? rawResponseLines.join('\n')
      : undefined;

    const updateStreamingAssistant = (updater: (message: ChatMessage) => ChatMessage) => {
      streamMessages = updateMessageById(streamMessages, assistantMessageId, updater);
      messagesRef.current = streamMessages;

      if (activeConversationIdRef.current === conversationId) {
        setMessages(streamMessages);
      }

      persistStreamMessages(conversationId, streamMessages);
    };

    const buildFinalAssistantMessage = (
      streamState?: ChatMessage['streamState'],
      streamError?: string
    ): ChatMessage => ({
      ...assistantMessage,
      content: accumulatedContent,
      reasoning: accumulatedReasoning || undefined,
      reasoningDetails: accumulatedReasoningDetails.length > 0
        ? accumulatedReasoningDetails
        : undefined,
      rawResponse: rawResponse(),
      usage: latestUsage || undefined,
      providerMetadata: accumulatedProviderMetadata,
      ...(firstTokenTimestamp !== null ? { firstTokenTimestamp } : {}),
      ...(streamState ? { streamState } : {}),
      ...(streamError ? { streamError } : {}),
    });

    const finalizeStream = async (
      finalAssistantMessage: ChatMessage,
      shouldAbortActiveRequest = false
    ) => {
      if (shouldAbortActiveRequest) {
        abortControllerRef.current?.abort();
      }

      clearPersistQueue();

      const finalMessages = [
        ...baseMessages,
        finalAssistantMessage,
      ];
      messagesRef.current = finalMessages;

      if (activeConversationIdRef.current === conversationId) {
        setMessages(finalMessages);
        setIsLoading(false);
      }

      resetStreamingState();

      const updatedConversation: Conversation = {
        ...conversation,
        messages: finalMessages,
        title: resolveTitle(baseMessages, titleSeed),
        updatedAt: Date.now(),
      };

      await persistFinalConversation(updatedConversation, conversationId);
    };

    try {
      await streamChatCompletion(
        resolvedApiConfig.baseUrl,
        resolvedApiConfig.apiKey,
        request,
        {
          onReasoning: (chunk) => {
            accumulatedReasoning += chunk;
            if (firstTokenTimestamp === null && chunk.length > 0) {
              firstTokenTimestamp = Date.now();
            }
            updateStreamingAssistant((message) => ({
              ...message,
              reasoning: accumulatedReasoning,
              streamState: 'streaming',
              streamError: undefined,
              ...(firstTokenTimestamp !== null ? { firstTokenTimestamp } : {}),
            }));
          },
          onReasoningDetails: (details) => {
            accumulatedReasoningDetails = accumulatedReasoningDetails.concat(details);
            updateStreamingAssistant((message) => ({
              ...message,
              reasoningDetails: accumulatedReasoningDetails,
              streamState: 'streaming',
              streamError: undefined,
            }));
          },
          onMessage: (chunk) => {
            accumulatedContent += chunk;
            if (firstTokenTimestamp === null && chunk.length > 0) {
              firstTokenTimestamp = Date.now();
            }
            updateStreamingAssistant((message) => ({
              ...message,
              content: accumulatedContent,
              reasoning: accumulatedReasoning,
              reasoningDetails: accumulatedReasoningDetails,
              providerMetadata: accumulatedProviderMetadata,
              streamState: 'streaming',
              streamError: undefined,
              ...(firstTokenTimestamp !== null ? { firstTokenTimestamp } : {}),
            }));
          },
          onUsage: (usage) => {
            latestUsage = usage;
            updateStreamingAssistant((message) => ({
              ...message,
              reasoning: accumulatedReasoning,
              reasoningDetails: accumulatedReasoningDetails,
              usage,
              providerMetadata: accumulatedProviderMetadata,
              streamState: 'streaming',
              streamError: undefined,
            }));
          },
          onResponseMetadata: (metadata) => {
            accumulatedProviderMetadata = mergeProviderMetadata(accumulatedProviderMetadata, metadata);
            updateStreamingAssistant((message) => ({
              ...message,
              providerMetadata: accumulatedProviderMetadata,
              streamState: 'streaming',
              streamError: undefined,
            }));
          },
          onRawEvent: (rawLine) => {
            rawResponseLines.push(rawLine);
          },
          onError: (error) => {
            if (error.name === 'AbortError') {
              return;
            }

            console.error('Streaming error:', error);
            const streamError = streamWasBackgroundedRef.current
              ? '页面进入后台后，流式连接已中断，已保留已生成内容。'
              : `网络或流式连接已中断，已保留已生成内容。${error.message ? ` ${error.message}` : ''}`.trim();

            void finalizeStream(buildFinalAssistantMessage('error', streamError));
          },
          onComplete: () => {
            void finalizeStream(buildFinalAssistantMessage());
          },
        },
        {
          signal: abortControllerRef.current?.signal,
          useVercelServerProxy: resolvedPreset?.useVercelServerProxy === true,
        }
      );
    } catch (error) {
      console.error('Error sending message:', error);
      const normalizedError = error instanceof Error ? error : new Error('Unknown error');
      const streamError = streamWasBackgroundedRef.current
        ? '页面进入后台后，流式连接已中断，已保留已生成内容。'
        : `请求发送失败，已保留已生成内容。${normalizedError.message ? ` ${normalizedError.message}` : ''}`.trim();
      await finalizeStream(buildFinalAssistantMessage('error', streamError));
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    try {
      await appendDraftImages(files);
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePasteImage = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (isLoading) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const imageFile = item.getAsFile();
        if (imageFile) {
          imageFiles.push(imageFile);
        }
      }
    }

    if (imageFiles.length === 0) return;

    try {
      await appendDraftImages(imageFiles);
    } catch (error) {
      console.error('Error pasting image:', error);
      alert('Failed to paste image');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedInput = input.trim();
    if (!trimmedInput || !conversation || isLoading) return;

    if (!apiConfig) {
      const resolvedConfig = await getApiConfig(conversation.apiConfigId);
      if (!resolvedConfig) {
        alert('Please select an API configuration first');
        return;
      }
      setApiConfig(resolvedConfig);
    }

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmedInput,
      imageUrls: draftImages.length > 0 ? draftImages : undefined,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setDraftImages([]);
    await startAssistantResponse(newMessages, trimmedInput);
  };

  const handleRegenerate = async (messageId: string) => {
    if (!conversation || isLoading) return;

    if (!apiConfig) {
      const resolvedConfig = await getApiConfig(conversation.apiConfigId);
      if (!resolvedConfig) {
        alert('Please select an API configuration first');
        return;
      }
      setApiConfig(resolvedConfig);
    }

    const targetIndex = messages.findIndex((msg) => msg.id === messageId);
    if (targetIndex === -1) return;

    const targetMessage = messages[targetIndex];
    if (targetMessage.role === 'system') return;

    const baseMessages = targetMessage.role === 'assistant'
      ? messages.slice(0, targetIndex)
      : messages.slice(0, targetIndex + 1);

    if (baseMessages.length === 0) return;

    await startAssistantResponse(baseMessages);
  };

  const handleEditMessage = (id: string, newContent: string) => {
    if (!conversation) return;

    const updatedMessages = messages.map((msg) =>
      msg.id === id ? { ...msg, content: newContent } : msg
    );

    setMessages(updatedMessages);

    const updatedConversation: Conversation = {
      ...conversation,
      messages: updatedMessages,
      updatedAt: Date.now(),
    };

    const saveEdit = async () => {
      const didSaveEdit = await saveConversation(updatedConversation);
      if (didSaveEdit) {
        await onConversationUpdate(conversation.id);
      }
      window.dispatchEvent(new Event('conversationsUpdated'));
    };
    void saveEdit();
  };

  if (!conversation) {
    return (
      <div className="app-panel flex-1 flex items-center justify-center text-slate-500 px-8 py-6">
        <p className="text-center">Select a conversation or create a new one to start chatting</p>
      </div>
    );
  }

  if (!apiConfig) {
    return (
      <div className="app-panel flex-1 flex items-center justify-center px-8 py-6">
        <div className="text-center">
          <p className="text-red-400 mb-3">API configuration not found</p>
          <p className="text-gray-500 text-sm">
            Please set up an API configuration in Settings
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-panel flex-1 min-h-0 flex flex-col overflow-hidden relative">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 pt-3 pb-3"
      >
        <div className="space-y-2.5">
          {messages.map((message) => (
            <Message
              key={message.id}
              message={message}
              onEdit={handleEditMessage}
              onRegenerate={handleRegenerate}
              assistantName={assistantPreset?.name}
            />
          ))}
        </div>
      </div>

      {!isAutoScrollEnabled && (
        <button
          type="button"
          onClick={handleJumpToBottom}
          className="absolute right-4 bottom-24 z-20 w-9 h-9 bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-full shadow-md transition-all duration-200 flex items-center justify-center"
          aria-label="跳到底部"
          title="跳到底部"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      <div className="flex-shrink-0 border-t border-slate-200/70 bg-slate-50/95 backdrop-blur-sm px-3 sm:px-4 py-3 shadow-lg">
        <div className="w-full">
          {draftImages.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 text-xs font-medium text-slate-500">
                已附加 {draftImages.length} 张图片
              </div>
              <div className="grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-3">
                {draftImages.map((imageUrl, index) => (
                  <div
                    key={`${imageUrl.slice(0, 32)}-${index}`}
                    className="relative h-28 overflow-hidden rounded-lg border border-slate-300 bg-white"
                  >
                    <Image
                      src={imageUrl}
                      alt={`Upload preview ${index + 1}`}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    <button
                      type="button"
                      onClick={() => setDraftImages((currentImages) => (
                        currentImages.filter((_, currentIndex) => currentIndex !== index)
                      ))}
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-sm text-white shadow-sm transition-colors duration-200 hover:bg-red-600"
                      title="移除图片"
                      aria-label={`移除第 ${index + 1} 张图片`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex gap-3 items-center">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="w-11 h-11 flex items-center justify-center bg-white text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              title="Upload image"
            >
              <ImageIcon className="w-5 h-5" />
            </button>

            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={handlePasteImage}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder="Type your message... (Shift+Enter for new line)"
                disabled={isLoading}
                rows={1}
                className="w-full px-4 py-2 bg-white text-slate-900 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 resize-none min-h-[44px] max-h-32 text-base"
                style={{
                  height: 'auto',
                  overflowY: input.split('\n').length > 3 ? 'auto' : 'hidden'
                }}
                onInput={(e) => {
                  e.currentTarget.style.height = 'auto';
                  e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                }}
              />
            </div>

            {isLoading ? (
              <button
                type="button"
                onClick={() => stopStreaming()}
                className="w-11 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center transition-all duration-200 relative"
                title="停止生成"
                aria-label="停止生成"
              >
                <Loader2 className="absolute w-6 h-6 animate-spin text-white/80" />
                <Square className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="w-11 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-200"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
