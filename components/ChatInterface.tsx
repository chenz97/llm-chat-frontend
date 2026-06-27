'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import {
  AudioRecord,
  Conversation,
  ChatMessage,
  ApiConfig,
  AssistantPreset,
  ChatCompletionRequest,
  ModelParameters,
  ProviderMetadata,
  ReasoningDetail,
  RequestApi,
  ResponsesRequest,
  TokenUsage,
} from '@/types';
import {
  saveConversation,
  updateConversationMessages,
  generateId,
  getApiConfig,
  getAssistantPreset,
} from '@/lib/storage';
import {
  streamChatCompletion,
  convertToOpenAIMessages,
  convertToResponsesInput,
  mergeReasoningDetails,
} from '@/lib/api';
import {
  buildAudioChatCompletionRequest,
  buildTextAudioChatCompletionRequest,
  sendAudioChatCompletion,
} from '@/lib/audioChat';
import { parseChatDeepLinkAction } from '@/lib/chatDeepLink';
import { convertImagesToBase64, validateImageFile } from '@/lib/imageUtils';
import Message from './Message';
import { Send, Image as ImageIcon, Loader2, Square, ArrowDown, Phone, PhoneOff } from 'lucide-react';

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

const normalizeRequestApi = (value?: RequestApi): RequestApi => (
  value === 'responses' ? 'responses' : 'chat_completions'
);

type CallStatus = 'idle' | 'listening' | 'recording' | 'waiting_for_model' | 'playing_model_audio' | 'error';
type AudioContextWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

const SILENCE_SUBMIT_MS = 3000;
const AUDIO_LEVEL_INTERVAL_MS = 120;
const SPEECH_LEVEL_THRESHOLD = 0.035;

const isAudioModel = (model: string) => model.toLowerCase().includes('audio');

const normalizeRequestParameters = (
  requestApi: RequestApi,
  parameters?: ModelParameters
): Record<string, unknown> => {
  const normalized = normalizeModelParameters(parameters);

  if (requestApi !== 'responses') {
    return normalized;
  }

  const responseParameters = { ...normalized };
  if (
    responseParameters.max_output_tokens === undefined
    && responseParameters.max_tokens !== undefined
  ) {
    responseParameters.max_output_tokens = responseParameters.max_tokens;
  }

  const reasoningEffort = responseParameters.reasoning_effort;
  const reasoningConfig = (
    typeof responseParameters.reasoning === 'object'
    && responseParameters.reasoning !== null
    && !Array.isArray(responseParameters.reasoning)
  )
    ? { ...(responseParameters.reasoning as Record<string, unknown>) }
    : {};

  if (reasoningConfig.effort === undefined && reasoningEffort !== undefined) {
    reasoningConfig.effort = reasoningEffort;
  }

  if (Object.keys(reasoningConfig).length > 0) {
    responseParameters.reasoning = reasoningConfig;
  }

  delete responseParameters.max_tokens;
  delete responseParameters.reasoning_effort;
  delete responseParameters.stream_options;

  return responseParameters;
};

const findLatestAssistantResponseId = (
  messages: ChatMessage[]
): { responseId: string; assistantIndex: number } | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant') {
      continue;
    }

    if (typeof message.responseId === 'string' && message.responseId.trim()) {
      return {
        responseId: message.responseId,
        assistantIndex: index,
      };
    }

    return null;
  }

  return null;
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
  const [isCallMode, setIsCallMode] = useState(false);
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [callStatusMessage, setCallStatusMessage] = useState('');

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
  const deepLinkActionHandledRef = useRef(false);
  const submitPromptRef = useRef<(promptText: string) => Promise<void>>(async () => {});
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioLevelTimerRef = useRef<number | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const silenceStartedAtRef = useRef<number | null>(null);
  const isCallModeRef = useRef(false);
  const callStatusRef = useRef<CallStatus>('idle');
  const callAbortControllerRef = useRef<AbortController | null>(null);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const releaseCallResourcesRef = useRef<() => void>(() => {});

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    isCallModeRef.current = isCallMode;
  }, [isCallMode]);

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  useEffect(() => {
    let cancelled = false;
    const stateSyncTimers: number[] = [];
    const scheduleStateSync = (syncState: () => void) => {
      const timer = window.setTimeout(() => {
        if (!cancelled) {
          syncState();
        }
      }, 0);
      stateSyncTimers.push(timer);
    };

    if (conversation) {
      scheduleStateSync(() => {
        setMessages(conversation.messages);
      });

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
        scheduleStateSync(() => {
          setAssistantPreset(null);
        });
      }
    } else {
      scheduleStateSync(() => {
        setMessages([]);
        setApiConfig(null);
        setAssistantPreset(null);
      });
    }

    const conversationId = conversation?.id ?? null;
    activeConversationIdRef.current = conversationId;

    if (!conversation) {
      scheduleStateSync(() => {
        setMessages([]);
        setApiConfig(null);
        setAssistantPreset(null);
        setIsLoading(false);
      });
      previousConversationIdRef.current = null;
      return () => {
        cancelled = true;
        stateSyncTimers.forEach((timer) => window.clearTimeout(timer));
      };
    }

    if (conversationId !== previousConversationIdRef.current) {
      autoScrollEnabledRef.current = true;
      scheduleStateSync(() => {
        setIsAutoScrollEnabled(true);
      });
      previousConversationIdRef.current = conversationId;
    }

    if (
      streamingConversationIdRef.current === conversation.id
      && isStreamingRef.current
    ) {
      scheduleStateSync(() => {
        setIsLoading(true);
      });
    } else {
      scheduleStateSync(() => {
        setIsLoading(false);
      });
    }
    return () => {
      cancelled = true;
      stateSyncTimers.forEach((timer) => window.clearTimeout(timer));
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

  const callStatusLabel = (() => {
    switch (callStatus) {
      case 'listening':
        return '正在听用户说话';
      case 'recording':
        return '正在录制用户语音';
      case 'waiting_for_model':
        return '正在等待模型回复';
      case 'playing_model_audio':
        return '正在播放模型回复';
      case 'error':
        return '通话出错';
      default:
        return '';
    }
  })();

  const callStatusHint = callStatusMessage || callStatusLabel;

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

  const playAssistantAudioAndResume = async (audioRecord?: AudioRecord) => {
    if (!audioRecord) {
      if (isCallModeRef.current) {
        setCallState('listening', '正在听用户说话');
      }
      return;
    }

    if (isCallModeRef.current) {
      setCallState('playing_model_audio', '正在播放模型回复');
    }
    stopPlaybackAudio();

    await new Promise<void>((resolve) => {
      const audio = new Audio(buildAudioSource(audioRecord));
      playbackAudioRef.current = audio;
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      void audio.play().catch((error) => {
        console.error('Failed to play assistant audio:', error);
        resolve();
      });
    });

    playbackAudioRef.current = null;
    if (isCallModeRef.current) {
      setCallState('listening', '正在听用户说话');
    }
  };

  const submitAudioTurn = async (audioRecord: AudioRecord) => {
    if (!conversation || !isCallModeRef.current) return;

    let resolvedApiConfig: ApiConfig | null = apiConfig;
    if (!resolvedApiConfig || resolvedApiConfig.id !== conversation.apiConfigId) {
      resolvedApiConfig = (await getApiConfig(conversation.apiConfigId)) || null;
    }
    if (!resolvedApiConfig) {
      setCallState('error', 'API configuration not found');
      return;
    }

    let resolvedPreset: AssistantPreset | null = assistantPreset;
    if (conversation.assistantPresetId) {
      if (!resolvedPreset || resolvedPreset.id !== conversation.assistantPresetId) {
        resolvedPreset = (await getAssistantPreset(conversation.assistantPresetId)) || null;
      }
    } else {
      resolvedPreset = null;
    }

    const conversationId = conversation.id;
    const baseMessages = messagesRef.current;
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: '',
      audioRecords: [audioRecord],
      timestamp: Date.now(),
    };
    const messagesWithUser = [...baseMessages, userMessage];
    const pendingConversation: Conversation = {
      ...conversation,
      messages: messagesWithUser,
      title: resolveTitle(messagesWithUser, 'Voice call'),
      updatedAt: Date.now(),
    };

    messagesRef.current = messagesWithUser;
    if (activeConversationIdRef.current === conversationId) {
      setMessages(messagesWithUser);
    }
    await persistFinalConversation(pendingConversation, conversationId);

    if (!isCallModeRef.current) return;

    setCallState('waiting_for_model', '正在等待模型回复');
    callAbortControllerRef.current = new AbortController();

    const model = conversation.modelIdOverride
      || resolvedPreset?.modelId
      || resolvedApiConfig.models[0]
      || 'gpt-3.5-turbo';

    const request = buildAudioChatCompletionRequest({
      model,
      messages: baseMessages,
      currentUserAudio: audioRecord,
      systemPrompt: resolvedPreset?.systemPrompt,
      parameters: normalizeModelParameters(resolvedPreset?.parameters),
    });

    try {
      const response = await sendAudioChatCompletion(
        resolvedApiConfig.baseUrl,
        resolvedApiConfig.apiKey,
        request,
        {
          signal: callAbortControllerRef.current.signal,
          useVercelServerProxy: resolvedPreset?.useVercelServerProxy === true,
        }
      );

      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: response.content,
        audioRecords: response.audio ? [response.audio] : undefined,
        rawResponse: response.rawResponse,
        usage: response.usage,
        timestamp: Date.now(),
      };
      const finalMessages = [...messagesWithUser, assistantMessage];
      messagesRef.current = finalMessages;
      if (activeConversationIdRef.current === conversationId) {
        setMessages(finalMessages);
      }

      await persistFinalConversation({
        ...conversation,
        messages: finalMessages,
        title: resolveTitle(finalMessages, 'Voice call'),
        updatedAt: Date.now(),
      }, conversationId);

      await playAssistantAudioAndResume(response.audio);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      const normalizedError = error instanceof Error ? error : new Error('Unknown audio request error');
      console.error('Audio call error:', normalizedError);
      setCallState('error', normalizedError.message);
    } finally {
      callAbortControllerRef.current = null;
    }
  };

  const startTextAudioResponse = async (baseMessages: ChatMessage[], titleSeed?: string) => {
    if (!conversation) return;

    let resolvedApiConfig: ApiConfig | null = apiConfig;
    if (!resolvedApiConfig || resolvedApiConfig.id !== conversation.apiConfigId) {
      resolvedApiConfig = (await getApiConfig(conversation.apiConfigId)) || null;
    }
    if (!resolvedApiConfig) return;

    let resolvedPreset: AssistantPreset | null = assistantPreset;
    if (conversation.assistantPresetId) {
      if (!resolvedPreset || resolvedPreset.id !== conversation.assistantPresetId) {
        resolvedPreset = (await getAssistantPreset(conversation.assistantPresetId)) || null;
      }
    } else {
      resolvedPreset = null;
    }

    const conversationId = conversation.id;
    const model = conversation.modelIdOverride
      || resolvedPreset?.modelId
      || resolvedApiConfig.models[0]
      || 'gpt-3.5-turbo';
    const request = buildTextAudioChatCompletionRequest({
      model,
      messages: baseMessages,
      systemPrompt: resolvedPreset?.systemPrompt,
      parameters: normalizeModelParameters(resolvedPreset?.parameters),
    });

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    setIsLoading(true);

    try {
      const response = await sendAudioChatCompletion(
        resolvedApiConfig.baseUrl,
        resolvedApiConfig.apiKey,
        request,
        {
          signal: abortControllerRef.current.signal,
          useVercelServerProxy: resolvedPreset?.useVercelServerProxy === true,
        }
      );

      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: response.content,
        audioRecords: response.audio ? [response.audio] : undefined,
        rawResponse: response.rawResponse,
        usage: response.usage,
        providerMetadata: response.provider ? { provider: response.provider } : undefined,
        timestamp: Date.now(),
      };
      const finalMessages = [...baseMessages, assistantMessage];
      messagesRef.current = finalMessages;
      if (activeConversationIdRef.current === conversationId) {
        setMessages(finalMessages);
      }
      await persistFinalConversation({
        ...conversation,
        messages: finalMessages,
        title: resolveTitle(finalMessages, titleSeed),
        updatedAt: Date.now(),
      }, conversationId);

      if (response.audio) {
        await playAssistantAudioAndResume(response.audio);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      const normalizedError = error instanceof Error ? error : new Error('Unknown audio request error');
      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: '',
        streamState: 'error',
        streamError: `请求发送失败。${normalizedError.message}`,
        timestamp: Date.now(),
      };
      const finalMessages = [...baseMessages, assistantMessage];
      messagesRef.current = finalMessages;
      if (activeConversationIdRef.current === conversationId) {
        setMessages(finalMessages);
      }
      await persistFinalConversation({
        ...conversation,
        messages: finalMessages,
        title: resolveTitle(finalMessages, titleSeed),
        updatedAt: Date.now(),
      }, conversationId);
    } finally {
      abortControllerRef.current = null;
      if (activeConversationIdRef.current === conversationId) {
        setIsLoading(false);
      }
    }
  };

  const startRecordingSegment = () => {
    const stream = mediaStreamRef.current;
    if (!stream || callStatusRef.current !== 'listening') return;

    recordedChunksRef.current = [];
    recordingStartedAtRef.current = Date.now();
    silenceStartedAtRef.current = null;

    const mimeType = MediaRecorder.isTypeSupported('audio/wav')
      ? 'audio/wav'
      : (MediaRecorder.isTypeSupported('audio/mpeg') ? 'audio/mpeg' : '');
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      const chunks = recordedChunksRef.current;
      recordedChunksRef.current = [];
      const startedAt = recordingStartedAtRef.current ?? Date.now();
      recordingStartedAtRef.current = null;
      silenceStartedAtRef.current = null;

      if (!isCallModeRef.current || chunks.length === 0) {
        return;
      }

      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/wav' });
      if (blob.size === 0) {
        setCallState('listening', '正在听用户说话');
        return;
      }

      void createUserAudioRecord(blob, Date.now() - startedAt)
        .then((record) => submitAudioTurn(record))
        .catch((error) => {
          console.error('Failed to create user audio record:', error);
          setCallState('error', '录音保存失败');
        });
    };

    recorder.start();
    setCallState('recording', '正在录制用户语音');
  };

  const finishRecordingSegment = () => {
    if (callStatusRef.current !== 'recording') return;
    setCallState('waiting_for_model', '正在等待模型回复');
    stopRecorder();
  };

  const readAudioLevel = () => {
    const analyser = analyserRef.current;
    if (!analyser || !isCallModeRef.current) return;

    const samples = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) {
      const centered = (sample - 128) / 128;
      sum += centered * centered;
    }
    const rms = Math.sqrt(sum / samples.length);

    if (callStatusRef.current === 'listening' && rms >= SPEECH_LEVEL_THRESHOLD) {
      startRecordingSegment();
      return;
    }

    if (callStatusRef.current !== 'recording') {
      return;
    }

    if (rms >= SPEECH_LEVEL_THRESHOLD) {
      silenceStartedAtRef.current = null;
      return;
    }

    if (silenceStartedAtRef.current === null) {
      silenceStartedAtRef.current = Date.now();
      return;
    }

    if (Date.now() - silenceStartedAtRef.current >= SILENCE_SUBMIT_MS) {
      finishRecordingSegment();
    }
  };

  const startCallMode = async () => {
    if (isCallModeRef.current || !conversation || isLoading) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioWindow = window as AudioContextWindow;
      const AudioContextClass = audioWindow.AudioContext || audioWindow.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('AudioContext is not available');
      }
      const audioContext = new AudioContextClass();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);

      mediaStreamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      setIsCallMode(true);
      setCallState('listening', '正在听用户说话');
      audioLevelTimerRef.current = window.setInterval(readAudioLevel, AUDIO_LEVEL_INTERVAL_MS);
    } catch (error) {
      console.error('Failed to start call mode:', error);
      setIsCallMode(true);
      setCallState('error', '无法访问麦克风，请检查浏览器权限');
    }
  };

  const stopCallMode = () => {
    releaseCallResources();
    setIsCallMode(false);
    setCallState('idle', '');
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

  const setCallState = (status: CallStatus, message = '') => {
    callStatusRef.current = status;
    setCallStatus(status);
    setCallStatusMessage(message);
  };

  const stopAudioLevelTimer = () => {
    if (audioLevelTimerRef.current !== null) {
      window.clearInterval(audioLevelTimerRef.current);
      audioLevelTimerRef.current = null;
    }
  };

  const stopPlaybackAudio = () => {
    if (playbackAudioRef.current) {
      playbackAudioRef.current.pause();
      playbackAudioRef.current = null;
    }
  };

  const stopRecorder = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    mediaRecorderRef.current = null;
  };

  const releaseCallResources = () => {
    stopAudioLevelTimer();
    stopPlaybackAudio();
    callAbortControllerRef.current?.abort();
    callAbortControllerRef.current = null;

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    mediaRecorderRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    analyserRef.current = null;
    recordedChunksRef.current = [];
    recordingStartedAtRef.current = null;
    silenceStartedAtRef.current = null;
  };

  useEffect(() => {
    releaseCallResourcesRef.current = releaseCallResources;
  });

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return window.btoa(binary);
  };

  const writeString = (view: DataView, offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  const base64ToBytes = (data: string): Uint8Array => {
    const raw = window.atob(data.includes(',') ? data.split(',')[1] : data);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) {
      bytes[index] = raw.charCodeAt(index);
    }
    return bytes;
  };

  const wrapPcm16AsWavBuffer = (data: string, sampleRate = 24000): ArrayBuffer => {
    const pcmBytes = base64ToBytes(data);
    const buffer = new ArrayBuffer(44 + pcmBytes.byteLength);
    const view = new DataView(buffer);
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmBytes.byteLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, pcmBytes.byteLength, true);
    new Uint8Array(buffer, 44).set(pcmBytes);
    return buffer;
  };

  const encodeAudioBufferToWav = (audioBuffer: AudioBuffer): ArrayBuffer => {
    const channelCount = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const bytesPerSample = 2;
    const frameCount = audioBuffer.length;
    const dataSize = frameCount * channelCount * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channelCount, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
    view.setUint16(32, channelCount * bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let frame = 0; frame < frameCount; frame += 1) {
      for (let channel = 0; channel < channelCount; channel += 1) {
        const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[frame]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += bytesPerSample;
      }
    }

    return buffer;
  };

  const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read audio blob'));
    reader.readAsDataURL(blob);
  });

  const resolveAudioFormat = (mimeType: string): AudioRecord['format'] => (
    mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3' : 'wav'
  );

  const buildAudioSource = (audioRecord: AudioRecord) => (
    audioRecord.format === 'pcm16'
      ? `data:audio/wav;base64,${arrayBufferToBase64(wrapPcm16AsWavBuffer(audioRecord.data))}`
      : (audioRecord.data.startsWith('data:')
      ? audioRecord.data
      : `data:${audioRecord.mimeType};base64,${audioRecord.data}`)
  );

  const createUserAudioRecord = async (
    blob: Blob,
    durationMs: number
  ): Promise<AudioRecord> => {
    let data: string;
    let mimeType = blob.type || 'audio/wav';
    let format = resolveAudioFormat(mimeType);

    if (format === 'wav' && !mimeType.includes('wav')) {
      const decodeContext = new AudioContext();
      const audioBuffer = await decodeContext.decodeAudioData(await blob.arrayBuffer());
      const wavBuffer = encodeAudioBufferToWav(audioBuffer);
      await decodeContext.close();
      data = arrayBufferToBase64(wavBuffer);
      mimeType = 'audio/wav';
      format = 'wav';
    } else {
      data = await blobToBase64(blob);
    }

    return {
      id: generateId(),
      role: 'user',
      mimeType,
      format,
      data,
      durationMs,
      createdAt: Date.now(),
    };
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

  useEffect(() => () => {
    releaseCallResourcesRef.current();
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

    let accumulatedContent = '';
    let accumulatedReasoning = '';
    let latestUsage: TokenUsage | null = null;
    let responseId: string | undefined;
    const rawResponseLines: string[] = [];

    const requestApi = normalizeRequestApi(resolvedPreset?.requestApi);
    const model = conversation.modelIdOverride
      || resolvedPreset?.modelId
      || resolvedApiConfig.models[0]
      || 'gpt-3.5-turbo';
    const requestParameters = normalizeRequestParameters(requestApi, resolvedPreset?.parameters);
    let request: ChatCompletionRequest | ResponsesRequest;

    if (requestApi === 'responses') {
      const latestAssistantResponse = findLatestAssistantResponseId(baseMessages);
      const incrementalMessages = latestAssistantResponse
        ? baseMessages.slice(latestAssistantResponse.assistantIndex + 1)
        : baseMessages;

      request = {
        model,
        input: convertToResponsesInput(incrementalMessages),
        ...(resolvedPreset?.systemPrompt ? { instructions: resolvedPreset.systemPrompt } : {}),
        ...(latestAssistantResponse ? { previous_response_id: latestAssistantResponse.responseId } : {}),
        ...requestParameters,
      };
    } else {
      const apiMessages = convertToOpenAIMessages(baseMessages);

      if (resolvedPreset?.systemPrompt) {
        apiMessages.unshift({
          role: 'system',
          content: resolvedPreset.systemPrompt,
        });
      }

      const chatRequest: ChatCompletionRequest = {
        model,
        messages: apiMessages,
        ...requestParameters,
      };

      const streamOptions = chatRequest.stream_options;
      chatRequest.stream_options = {
        ...(typeof streamOptions === 'object' && streamOptions !== null ? streamOptions : {}),
        include_usage: true,
      };

      request = chatRequest;
    }

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
      responseId,
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
          onResponseId: (nextResponseId) => {
            responseId = nextResponseId;
            updateStreamingAssistant((message) => ({
              ...message,
              responseId: nextResponseId,
              streamState: 'streaming',
              streamError: undefined,
            }));
          },
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
            accumulatedReasoningDetails = mergeReasoningDetails(
              accumulatedReasoningDetails,
              details
            );
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
          requestApi,
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

  const submitPrompt = async (promptText: string) => {
    const trimmedInput = promptText.trim();
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

    const newMessages = [...messagesRef.current, userMessage];
    setMessages(newMessages);
    setInput('');
    setDraftImages([]);

    const model = conversation.modelIdOverride
      || assistantPreset?.modelId
      || apiConfig?.models[0]
      || '';
    if (isAudioModel(model) && draftImages.length === 0) {
      await startTextAudioResponse(newMessages, trimmedInput);
      return;
    }

    await startAssistantResponse(newMessages, trimmedInput);
  };

  useEffect(() => {
    submitPromptRef.current = submitPrompt;
  });

  useEffect(() => {
    if (deepLinkActionHandledRef.current || !conversation || !apiConfig) {
      return;
    }

    const action = parseChatDeepLinkAction(window.location.href);
    if (!action) {
      return;
    }

    deepLinkActionHandledRef.current = true;
    const timer = window.setTimeout(() => {
      setInput(action.prompt);

      if (action.autoSend) {
        void submitPromptRef.current(action.prompt);
      }
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [apiConfig, conversation]);

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
    await submitPrompt(input);
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
          {isCallMode && (
            <div className={`mb-3 rounded-lg border px-3 py-2 ${
              callStatus === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-blue-200 bg-blue-50 text-blue-900'
            }`}>
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`call-status-pulse call-status-pulse-${callStatus}`} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{callStatusLabel}</div>
                    {callStatusHint && callStatusHint !== callStatusLabel && (
                      <div className="truncate text-xs opacity-80">{callStatusHint}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

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

          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3"
          >
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
              className="flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-all duration-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              title="Upload image"
            >
              <ImageIcon className="w-5 h-5" />
            </button>

            <div className="relative flex min-w-0 items-center self-center">
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
                className="min-h-11 max-h-32 w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-[10px] text-base text-slate-900 leading-6 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
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
                className="relative flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-lg bg-blue-600 text-white transition-all duration-200 hover:bg-blue-700"
                title="停止生成"
                aria-label="停止生成"
              >
                <Loader2 className="absolute w-6 h-6 animate-spin text-white/80" />
                <Square className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || isCallMode}
                className="flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-lg bg-blue-600 text-white transition-all duration-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={isCallMode ? stopCallMode : startCallMode}
              disabled={isLoading}
              className={`flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-lg transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
                isCallMode
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
              title={isCallMode ? '退出语音通话' : '开始语音通话'}
              aria-label={isCallMode ? '退出语音通话' : '开始语音通话'}
            >
              {isCallMode ? <PhoneOff className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
