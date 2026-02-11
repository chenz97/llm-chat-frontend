'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Conversation,
  ChatMessage,
  ApiConfig,
  AssistantPreset,
  TokenUsage,
  ChatCompletionRequest,
  ModelParameters,
} from '@/types';
import {
  saveConversation,
  updateConversationMessages,
  generateId,
  getApiConfig,
  getAssistantPreset,
} from '@/lib/storage';
import { streamChatCompletion, convertToOpenAIMessages } from '@/lib/api';
import { convertImageToBase64, validateImageFile } from '@/lib/imageUtils';
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

export default function ChatInterface({
  conversation,
  onConversationUpdate,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [image, setImage] = useState<string | null>(null);
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
  const isStreamingRef = useRef(false);
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

  useEffect(() => {
    if (autoScrollEnabledRef.current) {
      scrollToBottom(isStreamingRef.current ? 'auto' : 'smooth');
    }
  }, [messages]);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const maxScrollTop = container.scrollHeight - container.clientHeight;
    container.scrollTo({ top: Math.max(0, maxScrollTop), behavior });
  };

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

  const clearPersistTimer = () => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    pendingPersistRef.current = null;
  };

  const stopStreaming = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    isStreamingRef.current = false;
    streamingConversationIdRef.current = null;
    clearPersistTimer();

    if (conversation) {
      const finalize = async () => {
        const didSave = await updateConversationMessages(conversation.id, messagesRef.current);
        if (didSave) {
          await onConversationUpdate(conversation.id);
        }
        window.dispatchEvent(new Event('conversationsUpdated'));
      };
      void finalize();
    }

    if (activeConversationIdRef.current === conversation?.id) {
      setIsLoading(false);
    }
  };

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
      timestamp: Date.now(),
    };

    let streamMessages = [...baseMessages, assistantMessage];
    let firstTokenTimestamp: number | null = null;

    setIsLoading(true);
    streamingConversationIdRef.current = conversationId;
    isStreamingRef.current = true;

    if (activeConversationIdRef.current === conversationId) {
      setMessages(streamMessages);
    }

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

    const apiMessages = convertToOpenAIMessages(baseMessages);

    if (resolvedPreset?.systemPrompt) {
      apiMessages.unshift({
        role: 'system',
        content: resolvedPreset.systemPrompt,
      });
    }

    let accumulatedContent = '';
    let latestUsage: TokenUsage | null = null;
    let rawResponseLines: string[] = [];

    const request: ChatCompletionRequest = {
      model: resolvedPreset?.modelId || resolvedApiConfig.models[0] || 'gpt-3.5-turbo',
      messages: apiMessages,
      ...normalizeModelParameters(resolvedPreset?.parameters),
    };

    const streamOptions = request.stream_options;
    request.stream_options = {
      ...(typeof streamOptions === 'object' && streamOptions !== null ? streamOptions : {}),
      include_usage: true,
    };

    try {
      await streamChatCompletion(
        resolvedApiConfig.baseUrl,
        resolvedApiConfig.apiKey,
        request,
        {
          onMessage: (chunk) => {
            accumulatedContent += chunk;
            if (firstTokenTimestamp === null && chunk.length > 0) {
              firstTokenTimestamp = Date.now();
            }
            streamMessages = streamMessages.map((msg) =>
              msg.id === assistantMessageId
                ? {
                  ...msg,
                  content: accumulatedContent,
                  ...(firstTokenTimestamp !== null ? { firstTokenTimestamp } : {}),
                }
                : msg
            );

            if (activeConversationIdRef.current === conversationId) {
              setMessages(streamMessages);
            }

            persistStreamMessages(conversationId, streamMessages);
          },
          onUsage: (usage) => {
            latestUsage = usage;
            streamMessages = streamMessages.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, usage }
                : msg
            );

            if (activeConversationIdRef.current === conversationId) {
              setMessages(streamMessages);
            }

            persistStreamMessages(conversationId, streamMessages);
          },
          onRawEvent: (rawLine) => {
            rawResponseLines.push(rawLine);
          },
          onError: (error) => {
            if (error.name === 'AbortError') {
              if (activeConversationIdRef.current === conversationId) {
                setIsLoading(false);
              }
              isStreamingRef.current = false;
              streamingConversationIdRef.current = null;
              abortControllerRef.current = null;
              clearPersistTimer();
              return;
            }

            console.error('Streaming error:', error);
            streamMessages = streamMessages.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: `Error: ${error.message}` }
                : msg
            );

            persistStreamMessages(conversationId, streamMessages);

            if (activeConversationIdRef.current === conversationId) {
              setMessages(streamMessages);
              setIsLoading(false);
            }

            isStreamingRef.current = false;
            streamingConversationIdRef.current = null;
            clearPersistTimer();
          },
          onComplete: () => {
            const rawResponse = rawResponseLines.length > 0
              ? rawResponseLines.join('\n')
              : undefined;
            const finalMessages = [
              ...baseMessages,
              {
                ...assistantMessage,
                content: accumulatedContent,
                rawResponse,
                usage: latestUsage || undefined,
                ...(firstTokenTimestamp !== null ? { firstTokenTimestamp } : {}),
              },
            ];

            const updatedConversation: Conversation = {
              ...conversation,
              messages: finalMessages,
              title: resolveTitle(baseMessages, titleSeed),
              updatedAt: Date.now(),
            };

            const finalize = async () => {
              if (activeConversationIdRef.current === conversationId) {
                setMessages(finalMessages);
                setIsLoading(false);
              }

              isStreamingRef.current = false;
              streamingConversationIdRef.current = null;
              abortControllerRef.current = null;
              clearPersistTimer();

              const didSaveFinal = await saveConversation(updatedConversation);
              if (didSaveFinal) {
                await onConversationUpdate(conversationId);
              }
              window.dispatchEvent(new Event('conversationsUpdated'));
            };
            void finalize();
          },
        },
        {
          signal: abortControllerRef.current?.signal,
          useVercelServerProxy: resolvedPreset?.useVercelServerProxy === true,
        }
      );
    } catch (error) {
      console.error('Error sending message:', error);
      if (activeConversationIdRef.current === conversationId) {
        setIsLoading(false);
      }
      isStreamingRef.current = false;
      streamingConversationIdRef.current = null;
      abortControllerRef.current = null;
      clearPersistTimer();
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!validateImageFile(file)) return;

    try {
      const base64 = await convertImageToBase64(file);
      setImage(base64);
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

    let imageFile: File | null = null;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        imageFile = item.getAsFile();
        break;
      }
    }

    if (!imageFile) return;
    if (!validateImageFile(imageFile)) return;

    try {
      const base64 = await convertImageToBase64(imageFile);
      setImage(base64);
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
      imageUrl: image || undefined,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setImage(null);
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
          {image && (
            <div className="mb-4 relative inline-block">
              <img
                src={image}
                alt="Upload preview"
                className="max-w-xs max-h-32 rounded-lg border border-slate-300"
              />
              <button
                onClick={() => setImage(null)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 shadow-sm transition-colors duration-200 text-sm"
              >
                ×
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex gap-3 items-center">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
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
                onClick={stopStreaming}
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
