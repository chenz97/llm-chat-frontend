'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ChatMessage } from '@/types';
import Message from './Message';

const PAGE_SIZE = 40;

interface MessageListProps {
  messages: ChatMessage[];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onEdit: (id: string, content: string) => void;
  onRegenerate: (id: string) => void;
  assistantName?: string;
}

export default function MessageList({ messages, scrollContainerRef, ...messageProps }: MessageListProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const anchorRef = useRef<{ height: number; top: number } | null>(null);
  const hiddenCount = Math.max(0, messages.length - visibleCount);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const anchor = anchorRef.current;
    if (container && anchor) {
      container.scrollTop = anchor.top + container.scrollHeight - anchor.height;
    }
    anchorRef.current = null;
  }, [visibleCount, scrollContainerRef]);

  const showEarlier = () => {
    const container = scrollContainerRef.current;
    if (container) {
      anchorRef.current = { height: container.scrollHeight, top: container.scrollTop };
    }
    setVisibleCount(count => count + PAGE_SIZE);
  };

  return (
    <div className="space-y-2.5">
      {hiddenCount > 0 && (
        <button type="button" onClick={showEarlier} className="w-full py-2 text-sm text-blue-600 hover:text-blue-800">
          查看更早的消息（还有 {hiddenCount} 条）
        </button>
      )}
      {messages.slice(hiddenCount).map(message => (
        <Message key={message.id} message={message} {...messageProps} />
      ))}
    </div>
  );
}
