import type { ReactNode } from 'react';
export function Notice({ title, children }: { title: string; children: ReactNode; tone?: string }) {
  return <aside><h2>{title}</h2>{children}</aside>;
}