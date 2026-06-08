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
    if (!floatingStatus) return;

    const timer = window.setTimeout(() => {
      setFloatingStatus(null);
    }, 6000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [floatingStatus]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
      {floatingStatus && (
        <FloatingStatus
          kind={floatingStatus.kind}
          message={floatingStatus.message}
          onDismiss={() => setFloatingStatus(null)}
        />
      )}

      <div className="app-panel max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200">
          <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
          <button
            onClick={onClose}
            className="p-2.5 hover:bg-slate-100 rounded-md text-slate-600 hover:text-slate-900"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-200 px-3 sm:px-5 py-1">
          <button
            onClick={() => setActiveTab('api')}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap sm:px-5 sm:py-3 sm:text-base ${
              activeTab === 'api'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            API Configurations
          </button>
          <button
            onClick={() => setActiveTab('presets')}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap sm:px-5 sm:py-3 sm:text-base ${
              activeTab === 'presets'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Assistant Presets
          </button>
          <button
            onClick={() => setActiveTab('transfer')}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap sm:px-5 sm:py-3 sm:text-base ${
              activeTab === 'transfer'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Import/Export
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {activeTab === 'api' && <ApiConfigManager />}
          {activeTab === 'presets' && <AssistantPresetManager />}
          {activeTab === 'transfer' && <SettingsTransfer />}
        </div>
      </div>
    </div>
  );
}
