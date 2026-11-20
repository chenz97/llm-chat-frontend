'use client';

import { useEffect, useRef, useState } from 'react';
import { AudioRecord, ChatMessage } from '@/types';
import { createAudioPlaybackBlob } from '@/lib/audioPlayback';
import { getMessageImageUrls } from '@/lib/imageUtils';
import { formatResponseCitations } from '@/lib/responseCitations';
import { finishWebSearchCalls } from '@/lib/webSearchActivity';
import WebSearchActivity from './WebSearchActivity';
import MarkdownRenderer from './MarkdownRenderer';
import ImageLightbox from './ImageLightbox';
import {
  Bot,
  Brain,
  ChevronDown,
  Copy,
  Check,
  Pencil,
  X,
  Save,
  RotateCw,
  Maximize2,
  FileText,
  Play,
  Pause,
  Volume2,
} from 'lucide-react';
import Image from 'next/image';
import RawResponseModal from './RawResponseModal';

interface MessageProps {
  message: ChatMessage;
  onEdit?: (id: string, newContent: string) => void;
  onRegenerate?: (id: string) => void;
  assistantName?: string;
  isStreaming?: boolean;
}

export default function Message({ message, onEdit, onRegenerate, assistantName, isStreaming = false }: MessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const [lightboxImageSrc, setLightboxImageSrc] = useState<string | null>(null);
  const [isRawOpen, setIsRawOpen] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [reasoningToggled, setReasoningToggled] = useState<boolean | null>(null);
  const reasoningContainerRef = useRef<HTMLDivElement>(null);
  const shouldStickReasoningScrollRef = useRef(true);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const canRegenerate = !isSystem && !!onRegenerate;
  const assistantLabel = assistantName?.trim() || 'Assistant';
  const reasoning = message.reasoning?.trim() ? message.reasoning : '';
  // Reasoning stays expanded while streaming and collapses afterwards unless the user toggled it.
  // Collapsed reasoning is not rendered, which keeps long conversations cheap to render.
  const isReasoningOpen = reasoningToggled ?? isStreaming;
  const displayContent = formatResponseCitations(message.content, message.urlCitations);
  const webSearchCalls = isStreaming ? message.webSearchCalls ?? [] : finishWebSearchCalls(
    message.webSearchCalls ?? [],
    message.streamState === 'error' ? 'failed' : message.streamState === 'stopped' ? 'stopped' : 'incomplete'
  );
  const promptTokens = message.usage?.prompt_tokens;
  const reasoningTokens = message.usage?.reasoning_tokens;
  const completionTokens = message.usage?.completion_tokens;
  const cachedTokens = message.usage?.cached_tokens;
  const cacheReadInputTokens = message.usage?.cache_read_input_tokens;
  const cacheCreationInputTokens = message.usage?.cache_creation_input_tokens;
  const latencySeconds = message.firstTokenTimestamp !== undefined
    && message.firstTokenTimestamp >= message.timestamp
    ? (message.firstTokenTimestamp - message.timestamp) / 1000
    : undefined;
  const canShowRawResponse = !isUser && !isSystem && !!message.rawResponse;
  const messageImageUrls = getMessageImageUrls(message);
  const audioRecords = message.audioRecords ?? [];
  const streamNotice = !isUser && !isSystem
    ? (
      message.streamState === 'error'
        ? (message.streamError || '流式输出已中断，已保留已生成内容。')
        : message.streamState === 'stopped'
          ? (message.streamError || '已停止生成，已保留已生成内容。')
          : null
    )
    : null;
  const showUsage = !isUser
    && !isSystem
    && (
      promptTokens !== undefined
      || reasoningTokens !== undefined
      || completionTokens !== undefined
      || cachedTokens !== undefined
      || cacheReadInputTokens !== undefined
      || cacheCreationInputTokens !== undefined
      || latencySeconds !== undefined
    );
  const usageParts = [
    `prompt ${promptTokens ?? '-'}`,
    ...(cachedTokens !== undefined ? [`cached ${cachedTokens}`] : []),
    ...(cacheReadInputTokens !== undefined ? [`cache read ${cacheReadInputTokens}`] : []),
    ...(cacheCreationInputTokens !== undefined ? [`cache write ${cacheCreationInputTokens}`] : []),
    `reasoning ${reasoningTokens ?? '-'}`,
    `completion ${completionTokens ?? '-'}`,
    ...(latencySeconds !== undefined ? [`latency ${latencySeconds.toFixed(1)}s`] : []),
  ];

  useEffect(() => {
    const container = reasoningContainerRef.current;
    if (!container || !reasoning || !shouldStickReasoningScrollRef.current) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [reasoning, isReasoningOpen]);

  const handleReasoningScroll = () => {
    const container = reasoningContainerRef.current;
    if (!container) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldStickReasoningScrollRef.current = distanceFromBottom <= 24;
  };

  const copyWithFallback = async (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.left = '-1000px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);

    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (!successful) {
      throw new Error('Copy command failed');
    }
  };

  const handleCopy = async () => {
    try {
      await copyWithFallback(displayContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleStartEdit = () => {
    setEditContent(displayContent);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditContent(displayContent);
    setIsEditing(false);
  };

  const handleSaveEdit = () => {
    if (onEdit && editContent.trim() !== message.content) {
      onEdit(message.id, editContent.trim());
    }
    setIsEditing(false);
  };

  const handleToggleAudio = (
    audioId: string,
    data: string,
    mimeType: string,
    format: AudioRecord['format']
  ) => {
    const currentAudio = audioElementRef.current;
    if (playingAudioId === audioId && currentAudio) {
      releaseAudio();
      setPlayingAudioId(null);
      return;
    }

    releaseAudio();
    const url = URL.createObjectURL(createAudioPlaybackBlob({ data, mimeType, format }));
    audioUrlRef.current = url;
    const audio = new Audio(url);
    audioElementRef.current = audio;
    setPlayingAudioId(audioId);
    const finish = () => {
      if (audioElementRef.current !== audio) return;
      releaseAudio();
      setPlayingAudioId(null);
    };
    audio.onended = finish;
    audio.onerror = finish;
    void audio.play().catch((error) => {
      console.error('Failed to play audio record:', error);
      finish();
    });
  };

  const releaseAudio = () => {
    const audio = audioElementRef.current;
    if (!audio) return;
    audioElementRef.current = null;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
  };

  useEffect(() => () => releaseAudio(), []);

  if (isSystem) {
    return (
      <div className="message-row flex justify-center">
        <div className="max-w-2xl rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span className="font-semibold">System:</span> {message.content}
        </div>
      </div>
    );
  }

  const actionButtonClass = 'ui-icon-btn h-7 w-7';
  const actionButtons = isEditing ? null : (
    <>
      <button
        type="button"
        onClick={handleCopy}
        className={actionButtonClass}
        title="Copy message"
        aria-label="Copy message"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      {onEdit && !isStreaming && (
        <button
          type="button"
          onClick={handleStartEdit}
          className={actionButtonClass}
          title="Edit message"
          aria-label="Edit message"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {canRegenerate && (
        <button
          type="button"
          onClick={() => onRegenerate?.(message.id)}
          className={actionButtonClass}
          title="重新生成"
          aria-label="重新生成"
        >
          <RotateCw className="h-3.5 w-3.5" />
        </button>
      )}
      {canShowRawResponse && (
        <button
          type="button"
          onClick={() => setIsRawOpen(true)}
          className={actionButtonClass}
          title="查看原始响应体"
          aria-label="查看原始响应体"
        >
          <FileText className="h-3.5 w-3.5" />
        </button>
      )}
    </>
  );

  const imageGallery = messageImageUrls.length > 0 && (
    <div className={`grid gap-2 ${
      messageImageUrls.length === 1 ? 'w-full max-w-xs grid-cols-1' : 'w-full max-w-md grid-cols-2'
    }`}>
      {messageImageUrls.map((imageUrl, index) => (
        <button
          type="button"
          key={`${imageUrl.slice(0, 32)}-${index}`}
          className={`group/image relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 ${
            messageImageUrls.length === 1 ? 'aspect-square w-full max-w-64' : 'aspect-square w-full'
          }`}
          onClick={() => setLightboxImageSrc(imageUrl)}
          aria-label={`View image ${index + 1}`}
        >
          <Image
            src={imageUrl}
            alt={`Uploaded image ${index + 1}`}
            fill
            className="object-cover"
            unoptimized
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover/image:bg-black/15">
            <span className="rounded-full bg-black/50 p-1.5 opacity-0 transition-opacity group-hover/image:opacity-100">
              <Maximize2 className="h-4 w-4 text-white" />
            </span>
          </span>
        </button>
      ))}
    </div>
  );

  const audioList = audioRecords.length > 0 && (
    <div className="flex flex-col gap-1.5">
      {audioRecords.map((audioRecord, index) => {
        const isPlaying = playingAudioId === audioRecord.id;
        const durationSeconds = audioRecord.durationMs
          ? Math.max(1, Math.round(audioRecord.durationMs / 1000))
          : null;
        return (
          <div
            key={audioRecord.id}
            className="flex w-64 max-w-full items-center gap-3 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-4 text-sm text-slate-700"
          >
            <button
              type="button"
              onClick={() => handleToggleAudio(
                audioRecord.id,
                audioRecord.data,
                audioRecord.mimeType,
                audioRecord.format
              )}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-700"
              title={isPlaying ? '暂停音频' : '播放音频'}
              aria-label={isPlaying ? '暂停音频' : '播放音频'}
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
            </button>
            <div className="min-w-0 flex-1 truncate font-medium text-slate-800">
              {audioRecord.role === 'user' ? '用户语音' : '模型语音'} {index + 1}
            </div>
            <div className="flex shrink-0 items-center gap-1 text-xs text-slate-400">
              <Volume2 className="h-3.5 w-3.5" />
              {audioRecord.format.toUpperCase()}
              {durationSeconds ? ` · ${durationSeconds}s` : ''}
            </div>
          </div>
        );
      })}
    </div>
  );

  const editor = (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-2 focus-within:border-blue-300">
      <textarea
        value={editContent}
        onChange={(e) => setEditContent(e.target.value)}
        className="min-h-[96px] w-full resize-none bg-transparent px-2 py-1.5 text-base text-slate-900 outline-none"
        rows={Math.max(3, editContent.split('\n').length)}
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={handleCancelEdit} className="ui-btn ui-btn-secondary h-8 px-3 text-[13px]">
          <X className="h-3.5 w-3.5" />
          Cancel
        </button>
        <button type="button" onClick={handleSaveEdit} className="ui-btn ui-btn-primary h-8 px-3 text-[13px]">
          <Save className="h-3.5 w-3.5" />
          Save
        </button>
      </div>
    </div>
  );

  const modals = (
    <>
      {lightboxImageSrc && (
        <ImageLightbox
          src={lightboxImageSrc}
          alt="Uploaded image"
          isOpen={lightboxImageSrc !== null}
          onClose={() => setLightboxImageSrc(null)}
        />
      )}
      {canShowRawResponse && (
        <RawResponseModal
          isOpen={isRawOpen}
          rawResponse={message.rawResponse ?? ''}
          onClose={() => setIsRawOpen(false)}
        />
      )}
    </>
  );

  if (isUser) {
    return (
      <div className="message-row flex flex-col items-end gap-1.5">
        {imageGallery && <div className="flex w-full justify-end">{imageGallery}</div>}
        {audioList}
        {isEditing ? editor : message.content && (
          <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl bg-blue-50 px-4 py-2.5 text-[15px] leading-relaxed text-slate-900 sm:max-w-[75%]">
            {message.content}
          </div>
        )}
        <div className="message-actions flex items-center gap-0.5 text-slate-400">{actionButtons}</div>
        {modals}
      </div>
    );
  }

  const hasContent = !!message.content.trim();
  const showTyping = isStreaming && !hasContent && !reasoning && webSearchCalls.length === 0;

  return (
    <div className="message-row">
      <div className="mb-1.5 flex items-center gap-2">
        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <Bot className="h-3.5 w-3.5" />
        </div>
        <div className="truncate text-sm font-medium text-slate-700">{assistantLabel}</div>
      </div>

      <div className="space-y-3">
        {imageGallery}
        {audioList}

        {isEditing ? editor : (
          <>
            {webSearchCalls.length > 0 && <WebSearchActivity calls={webSearchCalls} />}
            {reasoning && (
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70">
                <button
                  type="button"
                  onClick={() => setReasoningToggled(!isReasoningOpen)}
                  className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-800"
                  aria-expanded={isReasoningOpen}
                >
                  <Brain className="h-3.5 w-3.5" />
                  <span>{isStreaming && !hasContent ? 'Thinking…' : 'Reasoning'}</span>
                  {reasoningTokens !== undefined && (
                    <span className="font-normal text-slate-400">· {reasoningTokens} tokens</span>
                  )}
                  <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${isReasoningOpen ? 'rotate-180' : ''}`} />
                </button>
                {isReasoningOpen && (
                  <div
                    ref={reasoningContainerRef}
                    onScroll={handleReasoningScroll}
                    className="max-h-60 overflow-y-auto border-t border-slate-200/80 px-3 py-2"
                  >
                    <MarkdownRenderer
                      content={reasoning}
                      className="markdown-body-reasoning"
                    />
                  </div>
                )}
              </div>
            )}
            {hasContent ? (
              <MarkdownRenderer content={displayContent} />
            ) : showTyping ? (
              <div className="typing-dots" aria-label="Generating"><span /><span /><span /></div>
            ) : streamNotice || isStreaming || webSearchCalls.length > 0 ? null : (
              <div className="text-sm text-slate-400">No content</div>
            )}
            {streamNotice && (
              <div className={`rounded-xl border px-3 py-2 text-sm ${
                message.streamState === 'error'
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
              }`}>
                {streamNotice}
              </div>
            )}
          </>
        )}
      </div>

      {!isStreaming && (
        <div className="mt-1.5 -ml-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <div className="message-actions flex items-center gap-0.5">{actionButtons}</div>
          {showUsage && (
            <span className="ml-auto text-xs tabular-nums text-slate-400">
              {usageParts.join(' · ')}
            </span>
          )}
        </div>
      )}
      {modals}
    </div>
  );
}
