'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import ApiConfigManager from './ApiConfigManager';
import AssistantPresetManager from './AssistantPresetManager';
import SettingsTransfer from './SettingsTransfer';
import FloatingStatus from './FloatingStatus';
import {
  FLOATING_STATUS_EVENT,
  type FloatingStatusDetail,
} from '@/lib/floatingStatus';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'api' | 'presets' | 'transfer'>('api');
  const [floatingStatus, setFloatingStatus] = useState<FloatingStatusDetail | null>(null);

  useEffect(() => {
    const handleFloatingStatus = (event: Event) => {
      const customEvent = event as CustomEvent<FloatingStatusDetail>;
      setFloatingStatus(customEvent.detail);
    };

    window.addEventListener(FLOATING_STATUS_EVENT, handleFloatingStatus);
    return () => {
      window.removeEventListener(FLOATING_STATUS_EVENT, handleFloatingStatus);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!floatingStatus) return;

    const timer = window.setTimeout(() => {
      setFloatingStatus(null);
    }, 6000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [floatingStatus]);

  if (!isOpen) return null;

  const tabs = [
    { id: 'api', label: 'API Configurations' },
    { id: 'presets', label: 'Assistant Presets' },
    { id: 'transfer', label: 'Import/Export' },
  ] as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-3 sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {floatingStatus && (
        <FloatingStatus
          kind={floatingStatus.kind}
          message={floatingStatus.message}
          onDismiss={() => setFloatingStatus(null)}
        />
      )}

      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 sm:px-6">
          <h2 id="settings-title" className="text-lg font-semibold text-slate-900">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="ui-icon-btn h-9 w-9"
            title="Close"
            aria-label="Close settings"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 pb-3 sm:px-6">
          <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto border-t border-slate-100 px-5 py-5 sm:px-6">
          {activeTab === 'api' && <ApiConfigManager />}
          {activeTab === 'presets' && <AssistantPresetManager />}
          {activeTab === 'transfer' && <SettingsTransfer />}
        </div>
      </div>
    </div>
  );
}
