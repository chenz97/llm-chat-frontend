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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3"
      onClick={handleBackdropClick}
    >
      <div className="flex max-h-[85vh] w-[min(94vw,980px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <div className="text-sm font-semibold text-slate-900">模型原始响应体</div>
          <button
            onClick={onClose}
            className="ui-icon-btn"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-50/60 px-4 py-3">
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
