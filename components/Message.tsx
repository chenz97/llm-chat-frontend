'use client';

import { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '@/types';
import MarkdownRenderer from './MarkdownRenderer';
import ImageLightbox from './ImageLightbox';
import { User, Bot, Copy, Check, Pencil, X, Save, RotateCw, Maximize2, FileText } from 'lucide-react';
import Image from 'next/image';
import RawResponseModal from './RawResponseModal';

interface MessageProps {
  message: ChatMessage;
  onEdit?: (id: string, newContent: string) => void;
  onRegenerate?: (id: string) => void;
  assistantName?: string;
}

export default function Message({ message, onEdit, onRegenerate, assistantName }: MessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isRawOpen, setIsRawOpen] = useState(false);
  const reasoningContainerRef = useRef<HTMLDivElement>(null);
  const shouldStickReasoningScrollRef = useRef(true);

  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const canRegenerate = !isSystem && !!onRegenerate;
  const assistantLabel = assistantName?.trim() || 'Assistant';
  const reasoning = message.reasoning?.trim() ? message.reasoning : '';
  const promptTokens = message.usage?.prompt_tokens;
  const reasoningTokens = message.usage?.reasoning_tokens;
  const completionTokens = message.usage?.completion_tokens;
  const latencySeconds = message.firstTokenTimestamp !== undefined
    && message.firstTokenTimestamp >= message.timestamp
    ? (message.firstTokenTimestamp - message.timestamp) / 1000
    : undefined;
  const canShowRawResponse = !isUser && !isSystem && !!message.rawResponse;
  const showUsage = !isUser
    && !isSystem
    && (
      promptTokens !== undefined
      || reasoningTokens !== undefined
      || completionTokens !== undefined
      || latencySeconds !== undefined
    );

  useEffect(() => {
    const container = reasoningContainerRef.current;
    if (!container || !reasoning || !shouldStickReasoningScrollRef.current) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [reasoning]);

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
      await copyWithFallback(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleStartEdit = () => {
    setEditContent(message.content);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditContent(message.content);
    setIsEditing(false);
  };

  const handleSaveEdit = () => {
    if (onEdit && editContent.trim() !== message.content) {
      onEdit(message.id, editContent.trim());
    }
    setIsEditing(false);
  };

  if (isSystem) {
    return (
      <div className="message-row flex justify-center px-3 sm:px-4">
        <div className="px-6 py-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 max-w-2xl">
          <span className="font-semibold">System:</span> {message.content}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`message-row border rounded-lg px-3 sm:px-4 py-3 ${
        isUser ? 'bg-slate-50/80 border-slate-200/60' : 'bg-white border-slate-200/80'
      }`}
    >
      <div className="w-full">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex-shrink-0">
              <div className={`w-9 h-9 rounded-md flex items-center justify-center ${
                isUser
                  ? 'bg-blue-600'
                  : 'bg-green-600'
              }`}>
                {isUser ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
              </div>
            </div>

            <div className="flex items-center justify-between min-w-0 flex-1">
              <div className="font-medium text-base text-slate-700">
                {isUser ? 'You' : assistantLabel}
              </div>
              <div className="flex items-center gap-2">
                {!isEditing && (
                  <>
                    <button
                      onClick={handleCopy}
                      className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                      title="Copy message"
                    >
                      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                    {onEdit && (
                      <button
                        onClick={handleStartEdit}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                        title="Edit message"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {canRegenerate && (
                      <button
                        onClick={() => onRegenerate?.(message.id)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                        title="重新生成"
                        aria-label="重新生成"
                      >
                        <RotateCw className="w-4 h-4" />
                      </button>
                    )}
                  </>
                )}
                {isEditing && (
                  <>
                    <button
                      onClick={handleSaveEdit}
                      className="p-1.5 text-green-500 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors"
                      title="Save changes"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="p-1.5 text-red-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                      title="Cancel editing"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {message.imageUrl && (
              <div
                className="relative w-64 h-64 rounded-lg overflow-hidden border border-slate-300 cursor-pointer group"
                onClick={() => setIsLightboxOpen(true)}
              >
                <Image
                  src={message.imageUrl}
                  alt="Uploaded image"
                  fill
                  className="object-contain transition-transform duration-200 group-hover:scale-105"
                  unoptimized
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full p-2">
                    <Maximize2 className="w-5 h-5 text-white" />
                  </div>
                </div>
              </div>
            )}

            {message.imageUrl && (
              <ImageLightbox
                src={message.imageUrl}
                alt="Uploaded image"
                isOpen={isLightboxOpen}
                onClose={() => setIsLightboxOpen(false)}
              />
            )}

            <div className="text-slate-800 leading-relaxed text-base">
              {isEditing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full px-4 py-3 bg-white text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none min-h-[100px]"
                  rows={Math.max(3, editContent.split('\n').length)}
                />
              ) : isUser ? (
                <div className="whitespace-pre-wrap">{message.content}</div>
              ) : (
                <div className="space-y-3">
                  {reasoning && (
                    <div className="rounded-lg border border-slate-300 bg-slate-100">
                      <div className="border-b border-slate-300 px-3 py-2 text-xs font-medium tracking-wide text-slate-950">
                        Reasoning
                      </div>
                      <div
                        ref={reasoningContainerRef}
                        onScroll={handleReasoningScroll}
                        className="max-h-44 overflow-y-auto px-3 py-2"
                      >
                        <MarkdownRenderer
                          content={reasoning}
                          className="markdown-body-reasoning"
                        />
                      </div>
                    </div>
                  )}
                  <MarkdownRenderer content={message.content} />
                </div>
              )}
              {(showUsage || canShowRawResponse) && (
                <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-xs text-slate-400">
                  {showUsage && (
                    <span>
                      prompt {promptTokens ?? '-'} | reasoning {reasoningTokens ?? '-'} | completion {completionTokens ?? '-'}
                      {latencySeconds !== undefined ? ` | latency ${latencySeconds.toFixed(1)}s` : ''}
                    </span>
                  )}
                  {canShowRawResponse && (
                    <button
                      type="button"
                      onClick={() => setIsRawOpen(true)}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                      title="查看原始响应体"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      原始响应
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {canShowRawResponse && (
        <RawResponseModal
          isOpen={isRawOpen}
          rawResponse={message.rawResponse ?? ''}
          onClose={() => setIsRawOpen(false)}
        />
      )}
    </div>
  );
}
