import { useSyncExternalStore } from 'react';
import { messageDrafts } from '@/lib/message-drafts';

export function useMessageDraft(owner: string, thread: string) {
  const draft = useSyncExternalStore(
    messageDrafts.subscribe,
    () => messageDrafts.read(owner, thread),
  );
  return { ...draft, setText: (text: string) => messageDrafts.write(owner, thread, text) };
}