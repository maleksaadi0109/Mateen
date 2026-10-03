export const identity = {
  isLoaded: true, isSignedIn: true,
  userId: 'synthetic-reviewer-a', sessionId: 'synthetic-session-a',
};
// Only used by the temporary test bundle, never by the app build.
export function useAuth() { return identity; }
export function useUser() { return { isLoaded: identity.isLoaded, user: identity.isSignedIn ? { id: identity.userId } : null }; }