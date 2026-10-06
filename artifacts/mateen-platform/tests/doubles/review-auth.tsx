import { useSyncExternalStore } from 'react';
type Access = { contentReviewer: boolean; qualificationReviewer: boolean; verifiedEmail: boolean; mfaEnabled: boolean; secureSession: boolean };
export const state = {
  signedIn: true, loaded: true, sessionId: 'fixture-session', enrollment: false,
  verify: 'complete' as 'complete' | 'cancel' | 'fail',
  access: { contentReviewer: false, qualificationReviewer: true, verifiedEmail: true, mfaEnabled: false, secureSession: false } as Access,
  queue: 'data' as 'data' | 'empty' | 'error',
  requests: [] as string[], fresh: [] as string[], signOutUrl: '', hint: null as unknown,
};
const listeners = new Set<() => void>();
let version = 0;
export function emit() { version++; for (const listener of listeners) listener(); }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function useVersion() { useSyncExternalStore(subscribe, () => version); }
const user = {
  id: 'fixture-reviewer', get twoFactorEnabled() { return state.access.mfaEnabled; },
  primaryEmailAddress: { verification: { status: 'verified' } },
  reload: async () => { state.fresh.push('user'); return user; },
};
const session = {
  get id() { return state.sessionId; },
  get factorVerificationAge() { return [0, state.access.secureSession ? 0 : -1]; },
  reload: async () => { state.fresh.push('session'); return session; },
  getToken: async (options: { skipCache?: boolean }) => { if (!options.skipCache) throw new Error('must refresh token'); state.fresh.push('token'); return 'not-a-real-token'; },
};
const clerk = {
  addListener(callback: (resources: { user: typeof user; session: typeof session }) => void) {
    const listener = () => callback({ user, session });
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  async signOut({ redirectUrl }: { redirectUrl: string }) { state.signOutUrl = redirectUrl; },
};
export function useAuth() { useVersion(); return { isLoaded: state.loaded, isSignedIn: state.signedIn }; }
export function useUser() { useVersion(); return { user }; }
export function useSession() { useVersion(); return { session }; }
export function useClerk() { return clerk; }
export function useReverification(fetcher: () => Promise<unknown>) {
  return async () => {
    const result = await fetcher();
    if (result && typeof result === 'object' && 'clerk_error' in result) {
      state.hint = result;
      if (state.verify === 'cancel') throw { code: 'reverification_cancelled' };
      if (state.verify === 'fail') throw new Error('fixture provider failure');
      state.access.secureSession = true;
      emit();
      return fetcher();
    }
    return result;
  };
}
export function UserProfile() {
  return <button data-testid="fixture-enroll" onClick={() => { state.access.mfaEnabled = true; emit(); }}>fixture enrollment</button>;
}
export function isReverificationCancelledError(error: unknown) {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'reverification_cancelled';
}
