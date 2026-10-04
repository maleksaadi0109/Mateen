// Deliberately tab/session scoped: never use localStorage for private message text.
const PREFIX = 'mateen:message-draft:v1:';
export const draftOwner = (userId: string, sessionId: string) => JSON.stringify([userId, sessionId]);
export type MessageDraft = { text: string; requestId: string; saved: boolean };
const EMPTY: MessageDraft = { text: '', requestId: '', saved: true };

export function createMessageDraftStore(storage: () => Storage) {
  let owner: string | null = null;
  let epoch = 0;
  const cache = new Map<string, MessageDraft>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const prefix = (scope: string) => `${PREFIX}${encodeURIComponent(scope)}:`;
  const key = (scope: string, thread: string) => `${prefix(scope)}${encodeURIComponent(thread)}`;
  const active = (scope: string, generation = epoch) => owner === scope && epoch === generation;
  function claim(scope: string | null) {
    if (owner !== scope) {
      owner = scope;
      epoch++;
      cache.clear();
    }
    try {
      const store = storage();
      for (let i = store.length - 1; i >= 0; i--) {
        const k = store.key(i);
        if (k?.startsWith(PREFIX) && (!scope || !k.startsWith(prefix(scope)))) store.removeItem(k);
      }
    } catch { /* Unavailable storage is reported by read/write, never logged with text. */ }
    notify();
  }
  function read(scope: string, thread: string): MessageDraft {
    if (!active(scope)) return EMPTY;
    const k = key(scope, thread);
    const cached = cache.get(k);
    if (cached) return cached;
    let draft = EMPTY;
    try {
      const raw = storage().getItem(k);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.text !== 'string' || parsed.text.length > 8000 ||
            typeof parsed.requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(parsed.requestId)) {
          throw new Error('Invalid draft');
        }
        draft = { text: parsed.text, requestId: parsed.requestId, saved: true };
      }
    } catch {
      try { storage().removeItem(k); } catch { /* Storage may be disabled. */ }
      draft = { ...EMPTY, saved: false };
    }
    cache.set(k, draft);
    return draft;
  }
  function write(scope: string, thread: string, text: string) {
    if (!active(scope)) return;
    const k = key(scope, thread);
    const draft = { text: text.slice(0, 8000), requestId: crypto.randomUUID(), saved: true };
    try {
      if (text) storage().setItem(k, JSON.stringify({ text: draft.text, requestId: draft.requestId }));
      else storage().removeItem(k);
    } catch { draft.saved = false; }
    cache.set(k, draft);
    notify();
  }
  function acknowledge(scope: string, thread: string, requestId: string, generation: number) {
    // A late send must not erase a newer edit, or touch a different login session.
    if (!active(scope, generation) || read(scope, thread).requestId !== requestId) return;
    write(scope, thread, '');
  }
  return {
    claim, read, write, acknowledge, active,
    generation: () => epoch,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

export const messageDrafts = createMessageDraftStore(() => window.sessionStorage);