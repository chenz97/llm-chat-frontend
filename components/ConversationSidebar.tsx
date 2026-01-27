'use client';

import { useState, useEffect, useCallback } from 'react';
import { Conversation } from '@/types';
import { getConversations, deleteConversation, setCurrentConversationId } from '@/lib/storage';
import { MessageSquare, Trash2, Plus } from 'lucide-react';

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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [mounted, setMounted] = useState(false);

  const loadConversations = useCallback(() => {
    const convs = getConversations().sort((a, b) => b.updatedAt - a.updatedAt);
    setConversations(convs);
  }, []);

  useEffect(() => {
    setMounted(true);
    loadConversations();

    const handleStorageChange = () => {
      loadConversations();
    };

    window.addEventListener('conversationsUpdated', handleStorageChange);
    return () => {
      window.removeEventListener('conversationsUpdated', handleStorageChange);
    };
  }, []);

  useEffect(() => {
    if (mounted) {
      loadConversations();
    }
  }, [currentConversationId, loadConversations, mounted]);

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();

    if (confirm('Are you sure you want to delete this conversation?')) {
      deleteConversation(id);
      loadConversations();

      if (currentConversationId === id) {
        onSelectConversation(null);
      }
    }
  };

  const handleSelect = (id: string) => {
    setCurrentConversationId(id);
    onSelectConversation(id);
  };

  if (!mounted) {
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
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {conversations.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-400 text-base">
            No conversations yet
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
