import { useSyncExternalStore } from 'react';
import { EN } from './i18n-en';

export type Locale = 'ar' | 'en';
const KEY = 'mateen-locale';
const listeners = new Set<() => void>();

function initial(): Locale {
  try { if (typeof localStorage === 'undefined') return 'ar'; return localStorage.getItem(KEY) === 'en' ? 'en' : 'ar'; } catch { return 'ar'; }
}
let current: Locale = initial();

function apply(l: Locale) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  el.lang = l;
  el.dir = l === 'ar' ? 'rtl' : 'ltr';
}
apply(current);

export function getLocale(): Locale { return current; }
export function setLocale(l: Locale) {
  if (l === current) return;
  current = l;
  try { localStorage.setItem(KEY, l); } catch { /* storage unavailable */ }
  apply(l);
  listeners.forEach((f) => f());
}
function subscribe(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }

/** Subscribes the calling component to locale changes. */
export function useLocale() {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  return { locale, setLocale, isAr: locale === 'ar', dir: (locale === 'ar' ? 'rtl' : 'ltr') as 'rtl' | 'ltr' };
}

/** Translate a canonical Arabic UI string. Falls back to Arabic when no entry exists. */
export function tr(ar: string): string {
  if (current === 'ar') return ar;
  const hit = EN[ar];
  if (hit !== undefined) return hit;
  const t = ar.replace(/\s+/g, ' ').trim();
  return EN[t] ?? ar;
}

/** Inline bilingual pair for strings outside the extracted dictionary. */
/** Parameterized message: fills {name} placeholders so each language keeps its own word order. */
export function fmt(ar: string, en: string, vars: Record<string, string | number | null | undefined> = {}): string {
  const tpl = current === 'en' ? en : ar;
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k] ?? "") : `{${k}}`));
}

export function pick(ar: string, en: string): string { return current === 'en' ? en : ar; }

export const intlTag = () => (current === 'ar' ? 'ar-EG' : 'en-GB');
