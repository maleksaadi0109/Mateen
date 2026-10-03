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
  const heard = recitationWords(transcript.slice(0, 250_000)).map(normalizeRecitationWord).filter(Boolean);
  const indices: number[] = [];
  let cursor = Math.max(0, start);
  let offset = 0;
  // On resume readers often repeat the last few already revealed words.
  // Accept that context only with two exact following words as an anchor;
  // never advance over an unheard source word.
  if (cursor > 0 && heard[0] !== target[cursor]) {
    for (let count = Math.min(cursor, 4); count > 0; count--) {
      if (heard.length >= count + 2 &&
          heard.slice(0, count).every((word, i) => word === target[cursor - count + i]) &&
          heard[count] === target[cursor] && heard[count + 1] === target[cursor + 1]) {
        offset = count;
        break;
      }
    }
  }
  for (let i = offset; i < heard.length && cursor < target.length; i++) {
    // Punctuation-only source tokens do not need to be spoken.
    while (cursor < target.length && !target[cursor]) indices.push(cursor++);
    if (cursor >= target.length) break;
    // Never jump over a word, even when a later phrase is recognizable.
    if (target[cursor] !== heard[i]) {
      // Arabic ASR may separate a clitic or join adjacent words. Accept only
      // exact concatenation, never fuzzy spelling or skipping a source word.
      if (heard[i + 1] && target[cursor] === heard[i] + heard[i + 1]) {
        indices.push(cursor++); i++; continue;
      }
      if (target[cursor + 1] && heard[i] === target[cursor] + target[cursor + 1]) {
        indices.push(cursor, cursor + 1); cursor += 2; continue;
      }
      return {indices, cursor, mismatchIndex:cursor};
    }
    indices.push(cursor);
    cursor++;
  }
  // Printed quotation marks and standalone punctuation are displayed with the
  // matched passage; they must not leave a completed page waiting for speech.
  while (cursor < target.length && !target[cursor]) indices.push(cursor++);
  return { indices, cursor, mismatchIndex:null };
}