import { tr } from '@/lib/i18n';
import { useEffect, useRef } from 'react';
import type { ScholarlyMessage } from '@workspace/api-client-react';
import { fmtDate } from '@/lib/mateen';
import { SourceCard } from './SourceCard';

const ROLE: Record<string, string> = { get student() { return tr("الطالب"); }, get assistant() { return tr("المساعد الآلي"); }, get teacher() { return tr("المعلم"); } };

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
              {m.role === 'assistant' && <p className="mt-2 font-ui text-xs text-muted-foreground" data-testid={`answer-mode-${m.id}`}>
                {m.answerMode === 'sources' ? (m.citations.length ? tr("الإجابة من المصادر · اقتباسات متحقق من مطابقتها، لا شرح بشري معتمد") : tr("الإجابة من المصادر · لم تُنتج إجابة موثقة")) :
                  m.answerMode === 'study' ? tr("شرح تعليمي · غير مراجع علمياً") : tr("إجابة سابقة · لم تُصنّف ضمن وضع المصادر")}
              </p>}
              {m.role === 'assistant' && m.answerMode !== 'sources' && <p className="mt-2 inline-block rounded-full bg-muted px-2.5 py-0.5 font-ui text-xs font-bold text-muted-foreground">{tr("شرح آلي غير مراجع")}</p>}
               <p dir="auto" className="mt-1 whitespace-pre-wrap break-words font-arabic text-lg leading-loose">{m.text}</p>
              <SourceCard messageId={m.id} citations={m.citations} />
            </div>
          </li>
        );
      })}
       <li ref={end} aria-hidden="true" />
    </ul>
  );
}
