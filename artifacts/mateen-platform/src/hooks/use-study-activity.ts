import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/react';
import { finishStudyActivity, getStudyActivity, startStudyActivity, type StudyActivityFinishInput } from '@workspace/api-client-react';

export const activityKey = (userId: string | null) => ['study-activity', userId] as const;
export function useStudyActivity() {
  const { user, isLoaded } = useUser();
  const userId = isLoaded && user ? user.id : null;
  return useQuery({
    queryKey: activityKey(userId), enabled: !!userId,
    queryFn: ({ signal }) => getStudyActivity({ signal }),
    staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true,
    // Other devices and crossing local midnight both need fresh server dates.
    refetchInterval: 30_000,
  });
}

type Session = { id: string; page: number; since: number; words: number; done: boolean; timezone: string; completedDay?: string };
type Pending = { id: string; data: StudyActivityFinishInput };
const foreground = () => typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus();

/** Client-attested engagement, not an anti-cheat or mastery proof.
 * Opening, restoring position, revealing text, report CRUD and assistant use never finish a session.
 */
export function useReaderActivity(input: {
  userId: string | null; kind: 'reading' | 'recitation'; page: number;
  attemptId: string; enabled: boolean; spokenWords: number;
}) {
  const qc = useQueryClient();
  const [focused, setFocused] = useState(foreground);
  const [generation, setGeneration] = useState(0);
  const [error, setError] = useState(false);
  const session = useRef<Session | null>(null);
  const pending = useRef<Pending | null>(null);
  const busy = useRef(false);
  const alive = useRef(true);
  const current = useRef(input);
  current.current = input;
  useEffect(() => {
    alive.current = true;
    const update = () => {
      // Immediately invalidate on blur; don't rely on a later React render.
      if (!foreground()) session.current = null;
      setFocused(foreground());
    };
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    return () => {
      alive.current = false;
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
    };
  }, []);

  const send = async (payload: Pending) => {
    const owner = input.userId;
    if (!owner || busy.current) return;
    busy.current = true;
    pending.current = payload;
    try {
      const data = await finishStudyActivity(payload.id, payload.data);
      // Never display the previous account's results after an auth switch.
      if (alive.current && current.current.userId === owner) {
        pending.current = null; setError(false);
        if (session.current?.id === payload.id) session.current.completedDay = data.lastStudyDay ?? undefined;
        qc.setQueryData(activityKey(owner), data);
        void qc.invalidateQueries({ queryKey: activityKey(owner) });
      }
    } catch (err) {
      if (alive.current && current.current.userId === owner) {
        // Terminal session errors need a fresh session, not an endless retry.
        if (err && typeof err === 'object' && 'status' in err && (err.status === 404 || err.status === 409)) pending.current = null;
        setError(true);
      }
    } finally { busy.current = false; }
  };
  const sendRef = useRef(send);
  sendRef.current = send;
  const recite = (words: number) => {
    const s = session.current;
    if (input.kind !== 'recitation' || !s || s.done || !foreground() || busy.current || pending.current) return;
    const seconds = Math.floor((performance.now() - s.since) / 1000);
    const added = words - s.words;
    if (seconds < 5 || seconds > 7200 || added < 5) return;
    s.done = true;
    void sendRef.current({ id: s.id, data: { page: current.current.page, activeSeconds: seconds, spokenWords: Math.min(100000, added) } });
  };
  const reciteRef = useRef(recite);
  reciteRef.current = recite;

  // Automatic recitation page following must not replace the active attempt.
  const readingPage = input.kind === 'reading' ? input.page : 0;
  useEffect(() => {
    session.current = null;
    if (!input.userId || !input.enabled || !focused) return;
    const abort = new AbortController();
    let disposed = false;
    const page = current.current.page;
    const baseline = current.current.spokenWords;
    void startStudyActivity({
      requestId: crypto.randomUUID(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      kind: input.kind, page,
    }, { signal: abort.signal }).then(value => {
      if (disposed || !foreground()) return;
      session.current = { id: value.id, page, since: performance.now(), words: baseline, done: false, timezone: value.timezone };
      void qc.invalidateQueries({ queryKey: activityKey(input.userId) });
    }).catch(() => { if (!disposed) setError(true); });
    const timer = window.setInterval(() => {
      const s = session.current;
      if (!s || !foreground()) return;
      const seconds = Math.floor((performance.now() - s.since) / 1000);
      if (seconds >= 7100) { setGeneration(n => n + 1); return; }
      if (s.completedDay) {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: s.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts();
        const part = (type: string) => parts.find(p => p.type === type)!.value;
        // Refresh the baseline at midnight: old spoken words cannot count tomorrow.
        if (`${part('year')}-${part('month')}-${part('day')}` !== s.completedDay) setGeneration(n => n + 1);
      }
      reciteRef.current(current.current.spokenWords);
    }, 1000);
    return () => { disposed = true; abort.abort(); window.clearInterval(timer); session.current = null; };
  }, [input.userId, input.kind, input.enabled, input.attemptId, readingPage, focused, generation, qc]);
  useEffect(() => { if (input.enabled) reciteRef.current(input.spokenWords); }, [input.spokenWords, input.enabled]);

  const navigate = (targetPage: number) => {
    const s = session.current;
    if (input.kind !== 'reading' || !s || s.done || !foreground() || busy.current || pending.current) return;
    const seconds = Math.floor((performance.now() - s.since) / 1000);
    if (targetPage === s.page || seconds < 30 || seconds > 7200) return;
    s.done = true;
    void send({ id: s.id, data: { page: targetPage, activeSeconds: seconds, spokenWords: 0 } });
  };
  const retry = () => {
    if (pending.current) void send(pending.current);
    else { setError(false); setGeneration(n => n + 1); }
  };
  return { navigate, recite, error, retry };
}