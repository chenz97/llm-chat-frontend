'use client';

import { CheckCircle2, X, XCircle } from 'lucide-react';

interface FloatingStatusProps {
  kind: 'success' | 'error';
  message: string;
  onDismiss: () => void;
}

export default function FloatingStatus({ kind, message, onDismiss }: FloatingStatusProps) {
  const isSuccess = kind === 'success';

  return (
    <div className="fixed right-4 top-4 z-[70] max-w-sm rounded-xl border border-slate-200 bg-white px-4 py-3 text-base shadow-xl">
      <div className="flex items-start gap-3">
        {isSuccess ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
        ) : (
          <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
        )}
        <div className="min-w-0 flex-1">
          <p className={isSuccess ? 'font-medium text-emerald-700' : 'font-medium text-red-700'}>
            {isSuccess ? 'Success' : 'Error'}
          </p>
          <p className="mt-0.5 text-slate-700">{message}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="ui-icon-btn -mr-1.5 -mt-1 h-7 w-7"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
