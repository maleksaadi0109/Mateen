// Matching aids practice, not grading. A gap stays blank rather than becoming
// an asserted learner error, and arbitrary ASR output is never rendered as matn.
export function normalizeRecitationWord(word: string): string {
  return word.normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06EDـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export function recitationWords(text: string): string[] {
  // Expand the source's honorific ligatures into their written words so the
  // recognizer can match speech to them (Unicode normalization misses FD4C).
  return text.replace(/﵌/g, 'صلى الله عليه وآله وسلم')
    .replace(/﵁/g, 'رضي الله عنه').replace(/﵂/g, 'رضي الله عنها')
    .normalize('NFKC').trim().split(/\s+/u).filter(Boolean);
}

export function matchRecitation(
  words: string[],
  transcript: string,
  start = 0,
): { indices: number[]; cursor: number; mismatchIndex: number | null } {
  const target = words.map(normalizeRecitationWord);
  const heard = recitationWords(transcript.slice(0, 30_000)).map(normalizeRecitationWord).filter(Boolean);
  const indices: number[] = [];
  let cursor = Math.max(0, start);
  for (let i = 0; i < heard.length && cursor < target.length; i++) {
    // Punctuation-only source tokens do not need to be spoken.
    while (cursor < target.length && !target[cursor]) cursor++;
    if (cursor >= target.length) break;
    // Never jump over a word, even when a later phrase is recognizable.
    if (target[cursor] !== heard[i]) return {indices, cursor, mismatchIndex:cursor};
    indices.push(cursor);
    cursor++;
  }
  return { indices, cursor, mismatchIndex:null };
}