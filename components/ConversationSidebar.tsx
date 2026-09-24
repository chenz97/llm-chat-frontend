'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ConversationSummary } from '@/types';
import { getConversationSummaries, deleteConversation, setCurrentConversationId } from '@/lib/storage';
import { MessageSquare, Trash2, Plus, Search } from 'lucide-react';

interface ConversationSidebarProps {
  currentConversationId: string | null;
  onSelectConversation: (id: string | null) => void;
  onNewConversation: () => void;
}

export default function ConversationSidebar({
  currentConversationId,
  onSelectConversation,
  onNewConversation,
}: ConversationSidebarProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isReady, setIsReady] = useState(false);
  const mountedRef = useRef(false);
  const loadSequenceRef = useRef(0);

  const loadConversations = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    const convs = await getConversationSummaries(searchQuery);
    if (!mountedRef.current || sequence !== loadSequenceRef.current) return;
    convs.sort((a, b) => b.updatedAt - a.updatedAt);
    setConversations(convs);
  }, [searchQuery]);

  useEffect(() => {
    mountedRef.current = true;

    const initialize = async () => {
      await loadConversations();
      if (mountedRef.current) {
        setIsReady(true);
      }
    };

    const timer = window.setTimeout(() => void initialize(), searchQuery ? 200 : 0);

    const handleStorageChange = () => {
      void loadConversations();
    };

    window.addEventListener('conversationsUpdated', handleStorageChange);
    return () => {
      mountedRef.current = false;
      loadSequenceRef.current += 1;
      window.clearTimeout(timer);
      window.removeEventListener('conversationsUpdated', handleStorageChange);
    };
  }, [loadConversations, searchQuery]);

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();

    if (confirm('Are you sure you want to delete this conversation?')) {
      const runDelete = async () => {
        await deleteConversation(id);
        await loadConversations();

        if (currentConversationId === id) {
          onSelectConversation(null);
        }
      };
      void runDelete();
    }
  };

  const handleSelect = (id: string) => {
    const selectConversation = async () => {
      await setCurrentConversationId(id);
      onSelectConversation(id);
    };
    void selectConversation();
  };

  if (!isReady) {
    return (
      <div className="app-panel w-full flex flex-1 flex-col overflow-hidden lg:h-full">
        <div className="p-4 border-b border-slate-200">
          <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-md shadow-sm font-medium text-base">
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-panel w-full flex flex-1 flex-col overflow-hidden lg:h-full">
      <div className="p-4 border-b border-slate-200">
        <button
          onClick={onNewConversation}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-sm transition-all duration-200 font-medium text-base"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations"
            className="w-full rounded-md border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none transition-colors duration-200 placeholder:text-slate-400 focus:border-blue-400"
            aria-label="Search conversations"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {conversations.length === 0 && !searchQuery.trim() ? (
          <div className="px-4 py-8 text-center text-slate-400 text-base">
            No conversations yet
          </div>
        ) : conversations.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-400 text-base">
            No matching conversations
          </div>
        ) : (
          <div className="space-y-1.5">
            {conversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => handleSelect(conv.id)}
                className={`group flex items-center gap-3 p-3 rounded-md cursor-pointer transition-all duration-200 ${
                  currentConversationId === conv.id
                    ? 'bg-blue-50 border border-blue-200'
                    : 'hover:bg-slate-50 border border-transparent'
                }`}
              >
                <div className={`p-2 rounded-md ${
                  currentConversationId === conv.id
                    ? 'bg-blue-600'
                    : 'bg-slate-300 group-hover:bg-slate-400'
                }`}>
                  <MessageSquare className={`w-4 h-4 ${
                    currentConversationId === conv.id ? 'text-white' : 'text-slate-700'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[15px] font-medium truncate ${
                    currentConversationId === conv.id ? 'text-slate-900' : 'text-slate-700'
                  }`}>
                    {conv.title}
                  </div>
                  <div className="text-sm text-slate-500 truncate mt-0.5">
                    {new Date(conv.updatedAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-100 text-slate-400 hover:text-red-600 rounded-md transition-all duration-200"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
