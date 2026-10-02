import { Redirect } from 'wouter';
import { useAuth } from '@clerk/react';
import { getGetProfileQueryKey, useGetProfile } from '@workspace/api-client-react';
import { MateenLanding } from '@/components/MateenLanding';
import { ErrorState, SkeletonBlock } from '@/components/mateen/bits';

function SignedInRedirect() {
  const p = useGetProfile({ query: { enabled: true, queryKey: getGetProfileQueryKey() } });
  if (p.isLoading) return <div className="mx-auto max-w-2xl space-y-4 p-10 pt-32"><SkeletonBlock className="h-14" /><SkeletonBlock className="h-40" /></div>;
  if (p.isError || !p.data) return <div className="grid min-h-[100dvh] place-items-center p-6"><ErrorState message="تعذّر تحميل حسابك." onRetry={() => p.refetch()} /></div>;
  if (!p.data.onboarded) return <Redirect to="/onboarding" />;
  return <Redirect to={p.data.role === 'teacher' ? '/teacher' : '/student'} />;
}

export default function HomeGate() {
  const { isLoaded, isSignedIn } = useAuth();
  if (isLoaded && isSignedIn) return <SignedInRedirect />;
  return <MateenLanding />;
}
