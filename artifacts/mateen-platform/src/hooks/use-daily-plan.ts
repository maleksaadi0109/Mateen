import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/react';
import {
  getGetDailyPlanQueryKey, useActOnDailyPlanTask, useGetDailyPlan, useRedistributeDailyPlan,
} from '@workspace/api-client-react';
import type { DailyPlan, DailyPlanTask } from '@workspace/api-client-react';

export function planTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
}

export function errorStatus(e: unknown): number | null {
  const s = (e as { status?: number } | null)?.status;
  return typeof s === 'number' ? s : null;
}

export function withTaskParams(href: string, planId: string, taskId: string) {
  const [pathAndQuery, hash] = href.split('#');
  const [path, query = ''] = pathAndQuery.split('?');
  const p = new URLSearchParams(query);
  p.set('planId', planId); p.set('taskId', taskId);
  return `${path}?${p.toString()}${hash ? `#${hash}` : ''}`;
}

export function useDailyPlanData(planId?: string | null, enabled = true) {
  const { user, isLoaded } = useUser();
  const userId = isLoaded && user ? user.id : null;
  const params = { timezone: planTimezone(), ...(planId ? { planId } : {}) };
  const baseKey = getGetDailyPlanQueryKey(params);
  const query = useGetDailyPlan(params, {
    query: {
      queryKey: [...baseKey, userId] as unknown as ReturnType<typeof getGetDailyPlanQueryKey>,
      enabled: !!userId && enabled, refetchInterval: 30_000, refetchOnWindowFocus: true, staleTime: 0,
    },
  });
  return { query, userId };
}

export function useDailyPlanWrites() {
  const qc = useQueryClient();
  const refresh = (_plan?: DailyPlan) => {
    // Never write an old-day response into today's plan or another account's cache.
    return qc.invalidateQueries({ queryKey: getGetDailyPlanQueryKey() });
  };
  return { act: useActOnDailyPlanTask(), redistribute: useRedistributeDailyPlan(), refresh };
}

export type { DailyPlan, DailyPlanTask };
