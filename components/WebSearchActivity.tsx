import { Check, CircleAlert, Globe, Loader2, Square } from 'lucide-react';
import type { WebSearchCall } from '@/types';

const STATUS_LABELS: Record<WebSearchCall['status'], string> = {
  in_progress: '准备中',
  searching: '进行中',
  completed: '已完成',
  failed: '失败',
  stopped: '已停止',
  incomplete: '未完成',
};

function safeWebUrl(value?: string): string | undefined {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export default function WebSearchActivity({ calls }: { calls: WebSearchCall[] }) {
  const isActive = calls.some((call) => call.status === 'in_progress' || call.status === 'searching');
  const allCompleted = calls.every((call) => call.status === 'completed');

  return (
    <section aria-label="网页搜索" className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2.5 text-sm">
      <div className="flex items-center gap-2 text-blue-900" role="status" aria-live="polite">
        <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="font-medium">网页搜索</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
          {isActive && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {isActive ? '正在搜索…' : allCompleted ? '已完成' : '已结束'}
        </span>
      </div>
      <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
        {calls.map((call) => {
          const active = call.status === 'in_progress' || call.status === 'searching';
          const StatusIcon = active ? Loader2 : call.status === 'completed' ? Check : call.status === 'stopped' ? Square : CircleAlert;
          const url = safeWebUrl(call.url);
          return (
            <li key={call.id} className="flex items-start gap-2 text-slate-700">
              <StatusIcon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${active ? 'animate-spin text-blue-600' : 'text-slate-500'}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span>{call.action === 'open_page' ? '阅读网页' : call.action === 'find_in_page' ? '查找网页内容' : '搜索网页'}</span>
                  <span className="shrink-0 text-xs text-slate-500">{STATUS_LABELS[call.status]}</span>
                </div>
                {call.queries?.map((query) => <p key={query} className="mt-0.5 break-words text-xs text-slate-600">{query}</p>)}
                {url && <a href={url} target="_blank" rel="noopener noreferrer" className="mt-0.5 block break-all text-xs text-blue-700 underline hover:text-blue-900">{url}</a>}
                {call.pattern && <p className="mt-0.5 break-words text-xs text-slate-600">{call.pattern}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
