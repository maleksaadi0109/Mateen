import type { AnchorHTMLAttributes, ReactNode } from 'react';

/** Prototype boundary: navigation stays inside this preview; no account/data mutations. */
export function Link({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode }) {
  return <a {...props} href={href} onClick={(event) => {
    event.preventDefault();
    if (href?.startsWith('#')) document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
    if (onClick) onClick(event);
  }} />;
}
export const getGetCatalogQueryKey = () => ['prototype-catalog'];
export const getGetStudyTextQueryKey = (_id: string) => ['prototype-study'];

// Snapshot of the real public catalog. No invented quotes, grades or scholarly approvals.
const catalog = [
  { id: 'nawawi', title: 'الأربعون النووية', track: 'الحديث', level: 'التمهيدي', status: 'available', description: 'الأربعون النووية للإمام النووي', hadithCount: 42 },
  { id: 'nawaqid', title: 'نواقض الإسلام', track: 'العقيدة', level: 'التمهيدي', status: 'coming_soon', description: 'هذا المتن مغلق حتى نشره في إصدار لاحق.', hadithCount: 0 },
  { id: 'qawaid', title: 'القواعد الأربع', track: 'العقيدة', level: 'الأول', status: 'coming_soon', description: 'هذا المتن مغلق حتى نشره في إصدار لاحق.', hadithCount: 0 },
  { id: 'tuhfa', title: 'تحفة الأطفال', track: 'التجويد والقراءات', level: 'التمهيدي', status: 'available', description: 'منظومة سليمان الجمزوري في التجويد؛ مراحل بحسب الأبواب.', hadithCount: 61 },
];
export function useGetCatalog(_options?: unknown) { return { data: catalog, isLoading: false, isError: false, refetch: () => {} }; }
type TextSnapshot = { title: string; sourceStatus: string; hadiths: { id: string; number: number; title: string; text: string; sourcePage: number; sourceUrl: string; reviewStatus: string }[] };
export function useGetStudyText(_id: string, _options?: unknown) {
  return { data: undefined as TextSnapshot | undefined, isLoading: false, isError: true, refetch: () => {} };
}