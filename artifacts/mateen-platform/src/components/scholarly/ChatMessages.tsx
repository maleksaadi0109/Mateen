import { useEffect, useRef } from 'react';
import type { ScholarlyMessage } from '@workspace/api-client-react';
import { fmtDate } from '@/lib/mateen';

const ROLE: Record<string, string> = { student: 'الطالب', assistant: 'المساعد الآلي', teacher: 'المعلم' };

export function ChatMessages({ messages, viewer }: { messages: ScholarlyMessage[]; viewer: 'student' | 'teacher' }) {
  const end = useRef<HTMLLIElement>(null);
  const last = messages[messages.length - 1]?.id;
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [last]);
  return (
    <ul className="space-y-3" data-testid="list-chat-messages">
      {messages.map((m) => {
        const mine = m.role === viewer;
        const tone = m.role === 'teacher' ? 'bg-muted' : m.role === 'assistant' ? 'border bg-background' : 'bg-card border border-secondary/30';
        return (
          <li key={m.id} className={`flex ${mine ? 'justify-start' : 'justify-end'}`} data-testid={`message-${m.id}`}>
            <div className={`max-w-[92%] min-w-0 rounded-2xl p-4 sm:max-w-[80%] ${tone}`}>
              <p className="font-ui text-xs font-bold text-secondary">{ROLE[m.role] ?? m.role} · <span className="font-normal text-muted-foreground">{fmtDate(m.createdAt)}</span></p>
               <p dir="rtl" className="mt-1 whitespace-pre-wrap break-words font-arabic text-lg leading-loose">{m.text}</p>
            </div>
          </li>
        );
      })}
       <li ref={end} aria-hidden="true" />
    </ul>
  );
}
