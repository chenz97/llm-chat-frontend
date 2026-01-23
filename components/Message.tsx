'use client';

import { useState } from 'react';
import { ChatMessage } from '@/types';
import MarkdownRenderer from './MarkdownRenderer';
import { User, Bot, Copy, Check, Pencil, X, Save, RotateCw } from 'lucide-react';
import Image from 'next/image';

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

  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const canRegenerate = !isSystem && !!onRegenerate;
  const assistantLabel = assistantName?.trim() || 'Assistant';

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
        <div className="flex gap-2.5 sm:gap-3">
          <div className="flex-shrink-0">
            <div className={`w-9 h-9 rounded-md flex items-center justify-center ${
              isUser
                ? 'bg-blue-600'
                : 'bg-green-600'
            }`}>
              {isUser ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center justify-between">
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

            {message.imageUrl && (
              <div className="relative w-64 h-64 rounded-lg overflow-hidden border border-slate-300">
                <Image
                  src={message.imageUrl}
                  alt="Uploaded image"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
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
                <MarkdownRenderer content={message.content} />
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
