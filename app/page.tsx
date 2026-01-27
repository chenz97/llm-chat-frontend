'use client';

import { useState, useEffect, useCallback } from 'react';
import { Conversation } from '@/types';
import {
  getConversation,
  getConversations,
  saveConversation,
  generateId,
  setCurrentConversationId,
  getCurrentConversationId,
  getApiConfigs,
  getDefaultPresetId,
  getAssistantPreset,
  getApiConfig,
} from '@/lib/storage';
import ConversationSidebar from '@/components/ConversationSidebar';
import ChatInterface from '@/components/ChatInterface';
import SettingsModal from '@/components/SettingsModal';
import ConversationConfigSelector from '@/components/ConversationConfigSelector';
import { Menu, X } from 'lucide-react';

export default function Home() {
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedApiConfigId, setSelectedApiConfigId] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState<string | undefined>();
  const [mounted, setMounted] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCompactLayout, setIsCompactLayout] = useState(false);

  const createConversation = useCallback(async (apiConfigId: string, presetId?: string) => {
    const newConversation: Conversation = {
      id: generateId(),
      title: 'New Conversation',
      apiConfigId,
      assistantPresetId: presetId,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveConversation(newConversation);
    await setCurrentConversationId(newConversation.id);
    setCurrentConversation(newConversation);
    setSelectedApiConfigId(apiConfigId);
    setSelectedPresetId(presetId);
    setIsSidebarOpen(false);
    window.dispatchEvent(new Event('conversationsUpdated'));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMounted(true);

    const initialize = async () => {
      const configs = getApiConfigs();
      if (configs.length === 0) {
        if (!cancelled) {
          setIsSettingsOpen(true);
        }
        return;
      }

      const storedConversationId = await getCurrentConversationId();
      const storedConversation = storedConversationId
        ? await getConversation(storedConversationId)
        : undefined;

      if (cancelled) return;

      if (storedConversation) {
        await setCurrentConversationId(storedConversation.id);
        setCurrentConversation(storedConversation);
        setSelectedApiConfigId(storedConversation.apiConfigId);
        setSelectedPresetId(storedConversation.assistantPresetId);
        return;
      }

      if (storedConversationId) {
        await setCurrentConversationId(null);
      }

      const existingConversations = await getConversations();
      if (cancelled) return;

      if (existingConversations.length > 0) {
        const latestConversation = existingConversations.sort(
          (a, b) => b.updatedAt - a.updatedAt
        )[0];
        await setCurrentConversationId(latestConversation.id);
        setCurrentConversation(latestConversation);
        setSelectedApiConfigId(latestConversation.apiConfigId);
        setSelectedPresetId(latestConversation.assistantPresetId);
        return;
      }

      const defaultPresetId = getDefaultPresetId();
      const defaultPreset = defaultPresetId ? getAssistantPreset(defaultPresetId) : undefined;
      const presetProviderId = defaultPreset?.apiConfigId && getApiConfig(defaultPreset.apiConfigId)
        ? defaultPreset.apiConfigId
        : undefined;
      const apiConfigIdToUse = presetProviderId || configs[0].id;
      const presetToUse = defaultPresetId || undefined;

      if (!cancelled) {
        await createConversation(apiConfigIdToUse, presetToUse);
      }
    };

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [createConversation]);

  useEffect(() => {
    const portraitQuery = window.matchMedia('(orientation: portrait)');
    const narrowQuery = window.matchMedia('(max-width: 1023px)');

    const updateLayout = () => {
      setIsCompactLayout(portraitQuery.matches || narrowQuery.matches);
    };

    updateLayout();

    const addListener = (query: MediaQueryList, handler: () => void) => {
      if (query.addEventListener) {
        query.addEventListener('change', handler);
      } else {
        query.addListener(handler);
      }
    };

    const removeListener = (query: MediaQueryList, handler: () => void) => {
      if (query.removeEventListener) {
        query.removeEventListener('change', handler);
      } else {
        query.removeListener(handler);
      }
    };

    addListener(portraitQuery, updateLayout);
    addListener(narrowQuery, updateLayout);

    return () => {
      removeListener(portraitQuery, updateLayout);
      removeListener(narrowQuery, updateLayout);
    };
  }, []);

  useEffect(() => {
    if (!isCompactLayout) {
      setIsSidebarOpen(false);
    }
  }, [isCompactLayout]);

  if (!mounted) {
    return (
      <div className="app-shell items-center justify-center">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  const handleNewConversation = () => {
    const apiConfigIdToUse = currentConversation?.apiConfigId || selectedApiConfigId;
    const presetToUse = currentConversation?.assistantPresetId ?? selectedPresetId;

    if (!apiConfigIdToUse) {
      alert('Please select an API configuration first');
      setIsSettingsOpen(true);
      return;
    }

    void createConversation(apiConfigIdToUse, presetToUse);
  };

  const handleSelectConversation = (id: string | null) => {
    const selectConversation = async () => {
      if (!id) {
        await setCurrentConversationId(null);
        setCurrentConversation(null);
        return;
      }

      const conv = await getConversation(id);
      if (conv) {
        await setCurrentConversationId(conv.id);
        setCurrentConversation(conv);
        setSelectedApiConfigId(conv.apiConfigId);
        setSelectedPresetId(conv.assistantPresetId);
        setIsSidebarOpen(false);
      }
    };
    void selectConversation();
  };

  const handleConversationUpdate = async (conversationId?: string) => {
    const targetId = conversationId ?? currentConversation?.id;
    if (!targetId) return;
    if (currentConversation && targetId !== currentConversation.id) return;

    const updated = await getConversation(targetId);
    if (updated) {
      setCurrentConversation(updated);
    }
  };

  const handleApiConfigChange = (id: string) => {
    setSelectedApiConfigId(id);

    if (currentConversation) {
      const updated = {
        ...currentConversation,
        apiConfigId: id,
      };
      void saveConversation(updated);
      setCurrentConversation(updated);
    }
  };

  const handlePresetChange = (id: string | undefined) => {
    const preset = id ? getAssistantPreset(id) : undefined;
    const presetProviderId = preset?.apiConfigId && getApiConfig(preset.apiConfigId)
      ? preset.apiConfigId
      : undefined;
    const currentApiConfigId = currentConversation?.apiConfigId || selectedApiConfigId;
    const nextApiConfigId = presetProviderId || currentApiConfigId;

    setSelectedPresetId(id);

    if (presetProviderId) {
      setSelectedApiConfigId(presetProviderId);
    }

    if (currentConversation) {
      const updated = {
        ...currentConversation,
        assistantPresetId: id,
        apiConfigId: nextApiConfigId,
      };
      void saveConversation(updated);
      setCurrentConversation(updated);
    }
  };

  const handleSettingsClose = () => {
    setIsSettingsOpen(false);

    if (!selectedApiConfigId) {
      const configs = getApiConfigs();
      if (configs.length > 0) {
        setSelectedApiConfigId(configs[0].id);
      }
    }
  };

  return (
    <>
      <div className="app-shell">
        {!isCompactLayout && (
          <div className="w-full lg:w-64 flex-shrink-0">
            <div className="h-full flex flex-col gap-2">
              <ConversationSidebar
                currentConversationId={currentConversation?.id || null}
                onSelectConversation={handleSelectConversation}
                onNewConversation={handleNewConversation}
              />

              {currentConversation && (
                <ConversationConfigSelector
                  selectedApiConfigId={selectedApiConfigId}
                  selectedPresetId={selectedPresetId}
                  onApiConfigChange={handleApiConfigChange}
                  onPresetChange={handlePresetChange}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                />
              )}
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
          <ChatInterface
            conversation={currentConversation}
            onConversationUpdate={handleConversationUpdate}
          />
        </div>
      </div>

      {isCompactLayout && (
        <div
          className={`fixed inset-y-0 left-0 z-[70] w-[260px] max-w-[85vw] transform transition-transform duration-200 ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="h-full flex flex-col gap-2">
            <ConversationSidebar
              currentConversationId={currentConversation?.id || null}
              onSelectConversation={handleSelectConversation}
              onNewConversation={handleNewConversation}
            />

            {currentConversation && (
              <ConversationConfigSelector
                selectedApiConfigId={selectedApiConfigId}
                selectedPresetId={selectedPresetId}
                onApiConfigChange={handleApiConfigChange}
                onPresetChange={handlePresetChange}
                onOpenSettings={() => setIsSettingsOpen(true)}
              />
            )}
          </div>
        </div>
      )}

      {isCompactLayout && isSidebarOpen && (
        <button
          type="button"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-[60] bg-slate-900/30"
          aria-label="Close sidebar"
        />
      )}

      {isCompactLayout && (
        <button
          onClick={() => setIsSidebarOpen((prev) => !prev)}
          className="fixed top-3 left-3 z-[80] p-2 bg-white border border-slate-200 text-slate-700 hover:text-slate-900 rounded-full shadow-md hover:bg-slate-50 transition-all duration-200"
          title={isSidebarOpen ? 'Close' : 'Open'}
          aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleSettingsClose}
      />
    </>
  );
}
