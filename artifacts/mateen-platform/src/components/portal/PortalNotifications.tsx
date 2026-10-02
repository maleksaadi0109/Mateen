import { getGetMateenNotificationsQueryKey, useGetMateenNotifications } from '@workspace/api-client-react';
import { Bell } from 'lucide-react';
import { Link } from 'wouter';
import { fmtDate } from '@/lib/mateen';

/** Participant-scoped updates; finite polling also refreshes other sessions. */
export function PortalNotifications({ teacher }: { teacher: boolean }) {
  const notifications = useGetMateenNotifications({
    query: { queryKey: getGetMateenNotificationsQueryKey(), refetchInterval: 30_000, staleTime: 10_000 },
  });
  if (!notifications.data?.length) return null;
  return (
    <details className="paper-card mb-6 px-5 py-3 font-ui text-sm">
      <summary className="flex cursor-pointer items-center gap-2 font-bold">
        <Bell size={16} aria-hidden="true" /> آخر تحديثات الإحالات والردود
      </summary>
      <ul className="mt-3 space-y-3">
        {notifications.data.slice(0, 3).map((notification) => (
          <li key={notification.id} className="border-t pt-3">
            <Link
              href={`${teacher ? '/teacher' : '/student'}/messages?conversation=${encodeURIComponent(notification.conversationId)}`}
              className="text-secondary underline underline-offset-4"
            >
              {notification.text}
            </Link>
            <p className="mt-1 text-xs text-muted-foreground">{fmtDate(notification.createdAt)}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}