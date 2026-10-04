import { useState } from 'react';
import { useUser } from '@clerk/react';
import StageAssistant from '@/components/mateen/stage-assistant';
import StudyPage from './study';

type Chat = { cid: string | null; draft: string };

/** Reader route: the study page with the contextual assistant docked on the desktop left. */
export default function StudyReaderPage() {
  const { user } = useUser();
  const [chats, setChats] = useState<Record<string, Chat>>({});
  return (
    <StudyPage assistant={({ textId, hadith, selected, wordRequest, onBusyChange }) => {
      // Conversations are scoped to the signed-in user, the book and the visible hadith.
      const key = `${user?.id ?? 'guest'}:${textId}:${hadith.number}`;
      const chat = chats[key] ?? { cid: null, draft: '' };
      const patch = (p: Partial<Chat>) => setChats(c => ({ ...c, [key]: { ...(c[key] ?? { cid: null, draft: '' }), ...p } }));
      return (
        <StageAssistant key={key} hadith={hadith} selectedWord={selected} wordRequest={wordRequest} onBusyChange={onBusyChange}
          conversationId={chat.cid} onConversationId={id => patch({ cid: id })} draft={chat.draft} onDraft={v => patch({ draft: v })} />
      );
    }} />
  );
}
