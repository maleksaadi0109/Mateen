// i18n-canonical: Arabic search normalisation
export function normalizeArabic(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
export type Availability = 'all' | 'available' | 'unavailable';
export function filterScholars<T extends { name: string; specialties: string; available: boolean }>(list: T[], query: string, availability: Availability): T[] {
  const terms = normalizeArabic(query).split(' ').filter(Boolean);
  return list.filter((s) => {
    if (availability === 'available' && !s.available) return false;
    if (availability === 'unavailable' && s.available) return false;
    const hay = normalizeArabic(`${s.name} ${s.specialties}`);
    return terms.every((t) => hay.includes(t));
  });
}
