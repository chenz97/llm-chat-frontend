'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ConversationSummary } from '@/types';
import { getConversationSummaries, deleteConversation, setCurrentConversationId } from '@/lib/storage';
import { Search, Sparkles, SquarePen, Trash2 } from 'lucide-react';

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

  const groups = groupConversations(conversations);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <div className="flex min-w-0 items-center gap-2 px-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="truncate text-[15px] font-semibold text-slate-900">LLM Chat</span>
        </div>
        <button
          type="button"
          onClick={onNewConversation}
          className="ui-icon-btn h-9 w-9"
          title="New chat"
          aria-label="New chat"
        >
          <SquarePen className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search"
            className="ui-input h-9 border-transparent bg-slate-200/50 py-0 pl-8 hover:border-transparent focus:bg-white"
            aria-label="Search conversations"
          />
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Conversations">
        {!isReady ? null : conversations.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm text-slate-400">
            {searchQuery.trim() ? 'No matching conversations' : 'No conversations yet'}
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mt-3 first:mt-1">
              <div className="px-2.5 pb-1 text-xs font-medium text-slate-400">{group.label}</div>
              <ul className="space-y-px">
                {group.items.map((conv) => {
                  const isActive = currentConversationId === conv.id;
                  return (
                    <li key={conv.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => handleSelect(conv.id)}
                        className={`block w-full truncate rounded-lg py-2 pl-2.5 pr-9 text-left text-sm transition-colors ${
                          isActive
                            ? 'bg-slate-200/70 font-medium text-slate-900'
                            : 'text-slate-600 hover:bg-slate-200/40 hover:text-slate-900'
                        }`}
                        title={conv.title}
                        aria-current={isActive ? 'true' : undefined}
                      >
                        {conv.title}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, conv.id)}
                        className={`ui-icon-btn ui-icon-btn-danger absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100 ${
                          isActive ? '[@media(hover:hover)]:opacity-100' : ''
                        }`}
                        title="Delete conversation"
                        aria-label={`Delete ${conv.title}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </nav>
    </div>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

function groupConversations(conversations: ConversationSummary[]) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  const buckets: { label: string; since: number; items: ConversationSummary[] }[] = [
    { label: 'Today', since: today, items: [] },
    { label: 'Yesterday', since: today - DAY_MS, items: [] },
    { label: 'Previous 7 days', since: today - 7 * DAY_MS, items: [] },
    { label: 'Previous 30 days', since: today - 30 * DAY_MS, items: [] },
    { label: 'Older', since: -Infinity, items: [] },
  ];

  for (const conv of conversations) {
    const bucket = buckets.find((candidate) => conv.updatedAt >= candidate.since) ?? buckets[buckets.length - 1];
    bucket.items.push(conv);
  }

  return buckets.filter((bucket) => bucket.items.length > 0);
}
