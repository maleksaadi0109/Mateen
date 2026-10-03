import { recitationWords } from './live-recitation';

export type BookHadith = {
  id: number;
  number: number;
  title: string;
  text: string;
  sourceUrl: string;
  sourcePage: number;
};

export type RecitationSegment = {
  hadithId: number;
  hadithNumber: number;
  title: string;
  start: number;
  end: number;
  continued: boolean;
  sourceUrl: string;
  sourcePage: number;
};

export type RecitationBookPage = {
  number: number;
  start: number;
  end: number;
  segments: RecitationSegment[];
};

// Digital pages deliberately do not claim to reproduce a printed edition.
// All ranges share one word stream so page turns never drop spoken words.
export function buildRecitationBook(hadiths: BookHadith[], wordsPerPage = 90) {
  if (!Number.isSafeInteger(wordsPerPage) || wordsPerPage < 1 || wordsPerPage > 300) {
    throw new Error('Invalid recitation page size.');
  }
  if (!Array.isArray(hadiths) || hadiths.length < 1 || hadiths.length > 42) {
    throw new Error('The recitation collection is unavailable.');
  }
  const words: string[] = [];
  const spans: RecitationSegment[] = [];
  const hadithStarts: Record<number, number> = {};
  const seen = new Set<number>();
  let previousNumber = 0;
  for (const hadith of hadiths) {
    if (!Number.isSafeInteger(hadith.id) || hadith.id < 1 || seen.has(hadith.id) ||
        !Number.isSafeInteger(hadith.number) || hadith.number <= previousNumber || hadith.number > 42 ||
        typeof hadith.text !== 'string' || !hadith.text.trim() || hadith.text.length > 20_000 ||
        typeof hadith.title !== 'string' || hadith.title.length > 500 ||
        typeof hadith.sourceUrl !== 'string' || hadith.sourceUrl.length > 2000 ||
        !Number.isSafeInteger(hadith.sourcePage) || hadith.sourcePage < 1) {
      throw new Error('Invalid source passage; recitation cannot begin.');
    }
    let source: URL;
    try { source = new URL(hadith.sourceUrl); }
    catch { throw new Error('Invalid source URL.'); }
    if (source.protocol !== 'https:' && source.protocol !== 'http:') {
      throw new Error('Invalid source URL protocol.');
    }
    seen.add(hadith.id);
    previousNumber = hadith.number;
    const start = words.length;
    words.push(...recitationWords(hadith.text));
    hadithStarts[hadith.id] = start;
    spans.push({
      hadithId: hadith.id, hadithNumber: hadith.number, title: hadith.title,
      start, end: words.length, continued: false,
      sourceUrl: hadith.sourceUrl, sourcePage: hadith.sourcePage,
    });
  }
  const text = words.join(' ');
  if (text.length > 200_000) throw new Error('The recitation collection exceeds the supported size.');
  const pages: RecitationBookPage[] = [];
  for (let start = 0; start < words.length; start += wordsPerPage) {
    const end = Math.min(start + wordsPerPage, words.length);
    pages.push({
      number: pages.length + 1, start, end,
      segments: spans.filter(span => span.start < end && span.end > start).map(span => ({
        ...span, start: Math.max(start, span.start), end: Math.min(end, span.end),
        continued: span.start < start,
      })),
    });
  }
  return { text, words, pages, hadithStarts };
}