'use client';

import { useState, useEffect, useCallback } from 'react';
import { Conversation } from '@/types';
import {
  getConversation,
  getConversationSummaries,
  getConversationSummary,
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
import { Menu, SquarePen } from 'lucide-react';

export default function Home() {
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedApiConfigId, setSelectedApiConfigId] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState<string | undefined>();
  const [selectedModelIdOverride, setSelectedModelIdOverride] = useState<string | undefined>();
  const [mounted, setMounted] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCompactLayout, setIsCompactLayout] = useState(false);
  const [isDraftConversation, setIsDraftConversation] = useState(false);

  const createConversation = useCallback((
    apiConfigId: string,
    presetId?: string,
    modelIdOverride?: string,
    options?: { persist?: boolean }
  ) => {
    const newConversation: Conversation = {
      id: generateId(),
      title: 'New Conversation',
      apiConfigId,
      assistantPresetId: presetId,
      modelIdOverride,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const shouldPersist = options?.persist !== false;

    const finalize = async () => {
      if (shouldPersist) {
        await saveConversation(newConversation);
        await setCurrentConversationId(newConversation.id);
        window.dispatchEvent(new Event('conversationsUpdated'));
      }

      setCurrentConversation(newConversation);
      setSelectedApiConfigId(apiConfigId);
      setSelectedPresetId(presetId);
      setSelectedModelIdOverride(modelIdOverride);
      setIsSidebarOpen(false);
      setIsDraftConversation(!shouldPersist);
    };

    void finalize();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const mountedTimer = window.setTimeout(() => {
      if (!cancelled) {
        setMounted(true);
      }
    }, 0);

    const initialize = async () => {
      const configs = await getApiConfigs();
      if (configs.length === 0) {
        if (!cancelled) {
          setIsSettingsOpen(true);
        }
        return;
      }

      const storedConversationId = await getCurrentConversationId();
      const storedConversation = storedConversationId
        ? await getConversationSummary(storedConversationId)
        : undefined;

      if (cancelled) return;

      let apiConfigIdToUse: string | undefined;
      let presetToUse: string | undefined;
      let modelIdOverrideToUse: string | undefined;

      const storedApiConfig = storedConversation
        ? await getApiConfig(storedConversation.apiConfigId)
        : undefined;
      if (storedConversation && storedApiConfig) {
        apiConfigIdToUse = storedConversation.apiConfigId;
        modelIdOverrideToUse = storedConversation.modelIdOverride;
        if (storedConversation.assistantPresetId) {
          const preset = await getAssistantPreset(storedConversation.assistantPresetId);
          if (preset) {
            presetToUse = storedConversation.assistantPresetId;
          }
        }
      } else if (storedConversationId) {
        await setCurrentConversationId(null);
      }

      if (!apiConfigIdToUse) {
        const existingConversations = await getConversationSummaries();
        if (cancelled) return;

        if (existingConversations.length > 0) {
          const latestConversation = existingConversations.sort(
            (a, b) => b.updatedAt - a.updatedAt
          )[0];
          const latestConfig = await getApiConfig(latestConversation.apiConfigId);
          if (latestConfig) {
            apiConfigIdToUse = latestConversation.apiConfigId;
            modelIdOverrideToUse = latestConversation.modelIdOverride;
          }
          if (latestConversation.assistantPresetId) {
            const preset = await getAssistantPreset(latestConversation.assistantPresetId);
            if (preset) {
              presetToUse = latestConversation.assistantPresetId;
            }
          }
        }
      }

      if (!apiConfigIdToUse) {
        const defaultPresetId = await getDefaultPresetId();
        const defaultPreset = defaultPresetId ? await getAssistantPreset(defaultPresetId) : undefined;
        let presetProviderId: string | undefined;
        if (defaultPreset?.apiConfigId) {
          const providerConfig = await getApiConfig(defaultPreset.apiConfigId);
          if (providerConfig) {
            presetProviderId = defaultPreset.apiConfigId;
          }
        }
        apiConfigIdToUse = presetProviderId || configs[0].id;
        presetToUse = defaultPresetId || undefined;
      }

      if (!cancelled) {
        createConversation(apiConfigIdToUse, presetToUse, modelIdOverrideToUse, { persist: false });
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      window.clearTimeout(mountedTimer);
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
      const timer = window.setTimeout(() => {
        setIsSidebarOpen(false);
      }, 0);

      return () => {
        window.clearTimeout(timer);
      };
    }
  }, [isCompactLayout]);

  if (!mounted) {
    return (
      <div className="app-shell" aria-busy="true" />
    );
  }

  const handleNewConversation = () => {
    const apiConfigIdToUse = currentConversation?.apiConfigId || selectedApiConfigId;
    const presetToUse = currentConversation?.assistantPresetId ?? selectedPresetId;
    const modelIdOverrideToUse = currentConversation?.modelIdOverride ?? selectedModelIdOverride;

    if (!apiConfigIdToUse) {
      alert('Please select an API configuration first');
      setIsSettingsOpen(true);
      return;
    }

    createConversation(apiConfigIdToUse, presetToUse, modelIdOverrideToUse, { persist: false });
  };

  const handleSelectConversation = (id: string | null) => {
    const selectConversation = async () => {
      if (!id) {
        await setCurrentConversationId(null);
        setCurrentConversation(null);
        setIsDraftConversation(false);
        return;
      }

      const conv = await getConversation(id);
      if (conv) {
        await setCurrentConversationId(conv.id);
        setCurrentConversation(conv);
        setSelectedApiConfigId(conv.apiConfigId);
        setSelectedPresetId(conv.assistantPresetId);
        setSelectedModelIdOverride(conv.modelIdOverride);
        setIsSidebarOpen(false);
        setIsDraftConversation(false);
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
      if (isDraftConversation) {
        await setCurrentConversationId(updated.id);
        setIsDraftConversation(false);
      }
      setCurrentConversation(updated);
      setSelectedApiConfigId(updated.apiConfigId);
      setSelectedPresetId(updated.assistantPresetId);
      setSelectedModelIdOverride(updated.modelIdOverride);
    }
  };

  const handleConversationRename = (id: string, title: string) => {
    setCurrentConversation((conversation) => conversation?.id === id
      ? { ...conversation, title, isTitleEdited: true }
      : conversation);
  };

  const handleApiConfigChange = (id: string) => {
    setSelectedApiConfigId(id);
    setSelectedModelIdOverride(undefined);

    if (currentConversation) {
      const updated = {
        ...currentConversation,
        apiConfigId: id,
        modelIdOverride: undefined,
      };
      setCurrentConversation(updated);
      if (!isDraftConversation) {
        void saveConversation(updated);
      }
    }
  };

  const handlePresetChange = (id: string | undefined) => {
    const updatePreset = async () => {
      const preset = id ? await getAssistantPreset(id) : undefined;
      let presetProviderId: string | undefined;
      if (preset?.apiConfigId) {
        const providerConfig = await getApiConfig(preset.apiConfigId);
        if (providerConfig) {
          presetProviderId = preset.apiConfigId;
        }
      }
      const currentApiConfigId = currentConversation?.apiConfigId || selectedApiConfigId;
      const nextApiConfigId = presetProviderId || currentApiConfigId;

      setSelectedPresetId(id);
      setSelectedModelIdOverride(undefined);

      if (presetProviderId) {
        setSelectedApiConfigId(presetProviderId);
      }

      if (currentConversation) {
        const updated = {
          ...currentConversation,
          assistantPresetId: id,
          apiConfigId: nextApiConfigId,
          modelIdOverride: undefined,
        };
        setCurrentConversation(updated);
        if (!isDraftConversation) {
          void saveConversation(updated);
        }
      }
    };

    void updatePreset();
  };

  const handleModelChange = (id: string | undefined) => {
    setSelectedModelIdOverride(id);

    if (currentConversation) {
      const updated = {
        ...currentConversation,
        modelIdOverride: id,
      };
      setCurrentConversation(updated);
      if (!isDraftConversation) {
        void saveConversation(updated);
      }
    }
  };

  const handleSettingsClose = () => {
    setIsSettingsOpen(false);

    if (!selectedApiConfigId) {
      const resolveConfig = async () => {
        const configs = await getApiConfigs();
        if (configs.length > 0) {
          setSelectedApiConfigId(configs[0].id);
        }
      };
      void resolveConfig();
    }
  };

  const sidebarContent = (
    <aside className="app-sidebar w-full">
      <ConversationSidebar
        currentConversationId={currentConversation?.id || null}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onRenameConversation={handleConversationRename}
      />

      {currentConversation && (
        <ConversationConfigSelector
          selectedApiConfigId={selectedApiConfigId}
          selectedPresetId={selectedPresetId}
          selectedModelIdOverride={selectedModelIdOverride}
          onApiConfigChange={handleApiConfigChange}
          onPresetChange={handlePresetChange}
          onModelChange={handleModelChange}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      )}
    </aside>
  );

  return (
    <>
      <div className="app-shell">
        {!isCompactLayout && <div className="w-[272px] flex-shrink-0">{sidebarContent}</div>}

        <main className="flex min-w-0 flex-1 flex-col">
          {isCompactLayout && (
            <header className="flex h-12 flex-shrink-0 items-center gap-1 border-b border-slate-200/80 px-2">
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="ui-icon-btn h-9 w-9"
                title="Open sidebar"
                aria-label="Open sidebar"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1 truncate px-1 text-center text-sm font-medium text-slate-800">
                {currentConversation?.title || 'New Conversation'}
              </div>
              <button
                type="button"
                onClick={handleNewConversation}
                className="ui-icon-btn h-9 w-9"
                title="New chat"
                aria-label="New chat"
              >
                <SquarePen className="h-5 w-5" />
              </button>
            </header>
          )}

          <ChatInterface
            conversation={currentConversation}
            onConversationUpdate={handleConversationUpdate}
          />
        </main>
      </div>

      {isCompactLayout && (
        <>
          <div
            className={`fixed inset-0 z-[60] bg-slate-900/25 transition-opacity duration-200 ${
              isSidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
            onClick={() => setIsSidebarOpen(false)}
            aria-hidden="true"
          />
          <div
            className={`fixed inset-y-0 left-0 z-[70] w-[288px] max-w-[85vw] shadow-xl transition-transform duration-200 ease-out ${
              isSidebarOpen ? 'translate-x-0' : '-translate-x-full shadow-none'
            }`}
            aria-hidden={!isSidebarOpen}
            inert={!isSidebarOpen}
          >
            {sidebarContent}
          </div>
        </>
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleSettingsClose}
      />
    </>
  );
}
