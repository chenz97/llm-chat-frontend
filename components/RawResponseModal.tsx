'use client';

import { useCallback, useEffect, type MouseEvent } from 'react';
import { X } from 'lucide-react';

interface RawResponseModalProps {
  isOpen: boolean;
  rawResponse: string;
  onClose: () => void;
}

export default function RawResponseModal({
  isOpen,
  rawResponse,
  onClose,
}: RawResponseModalProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="w-[min(92vw,980px)] max-h-[85vh] bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-slate-50">
          <div className="text-sm font-semibold text-slate-700">模型原始响应体</div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
          {rawResponse.trim() ? (
            <pre className="text-xs text-slate-700 whitespace-pre font-mono leading-relaxed">
              {rawResponse}
            </pre>
          ) : (
            <div className="text-sm text-slate-500">暂无原始响应数据</div>
          )}
        </div>
      </div>
    </div>
  );
}
