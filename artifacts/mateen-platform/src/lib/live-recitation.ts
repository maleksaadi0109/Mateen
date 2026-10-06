// Matching aids practice, not grading. A gap stays blank rather than becoming
// an asserted learner error, and arbitrary ASR output is never rendered as matn.
// i18n-canonical: Arabic normalisation tables and honorific expansions (matching logic, not UI)
export function normalizeRecitationWord(word: string): string {
  const normalized = word.normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06EDـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]/gu, '');
  return normalized === 'ابن' ? 'بن' : normalized;
}

export type RecitationIssue = {
  index: number;
  expected: string;
  heard: string;
  kind: 'substitution' | 'omission' | 'extra';
};

/** Practice alignment, not assessment: retain ASR differences without blocking. */
export function matchContinuousRecitation(words: string[], transcript: string, start = 0, previouslyMatched: readonly boolean[] = []) {
  const target = words.map(normalizeRecitationWord);
  const raw = recitationWords(transcript.slice(0, 250_000)).filter(w => normalizeRecitationWord(w));
  const heard = raw.map(normalizeRecitationWord);
  const indices: number[] = [];
  const issues: RecitationIssue[] = [];
  let cursor = Math.max(0, start);
  let offset = 0;
  if (cursor > 0 && heard[0] !== target[cursor]) {
    for (let n = Math.min(cursor, 4); n > 0; n--) {
      if (heard.length >= n + 2 && heard.slice(0, n).every((w, i) => w === target[cursor - n + i]) &&
          heard[n] === target[cursor] && heard[n + 1] === target[cursor + 1]) { offset = n; break; }
    }
  }
  for (let i = offset; i < heard.length && cursor < target.length; i++) {
    while (cursor < target.length && !target[cursor]) indices.push(cursor++);
    if (cursor >= target.length) break;
    if (heard[i] === target[cursor]) { indices.push(cursor++); continue; }
    // A reader can pause and repeat already matched context, including within
    // one cumulative browser result. Do not advance or penalize that rehearsal.
    // Only exact, actually matched words qualify; merely seeking past text does not.
    let repeated = 0;
    for (let n = Math.min(cursor, 32); n > 0; n--) {
      const count = Math.min(n, heard.length - i);
      if (count && Array.from({ length: count }, (_, k) => cursor - n + k).every((at, k) =>
        target[at] && heard[i + k] === target[at] &&
        (previouslyMatched[at] || indices.includes(at))) &&
        (count < n || i + count === heard.length || heard[i + count] === target[cursor])) {
        repeated = count; break;
      }
    }
    if (repeated) { i += repeated - 1; continue; }
    if (heard[i + 1] && heard[i] + heard[i + 1] === target[cursor]) {
      indices.push(cursor++); i++; continue;
    }
    if (target[cursor + 1] && heard[i] === target[cursor] + target[cursor + 1]) {
      indices.push(cursor, cursor + 1); cursor += 2; continue;
    }
    // An omission needs an observed two-word continuation, never just silence.
    let jump = 0;
    for (let n = 1; n <= 5 && cursor + n + 1 < target.length; n++) {
      if (heard[i] === target[cursor + n] && heard[i + 1] === target[cursor + n + 1]) { jump = n; break; }
    }
    if (jump) {
      for (let n = 0; n < jump; n++, cursor++) {
        if (target[cursor]) issues.push({ index: cursor, expected: words[cursor], heard: '', kind: 'omission' });
      }
      indices.push(cursor++); continue;
    }
    if (heard[i + 1] === target[cursor] && heard[i + 2] && heard[i + 2] === target[cursor + 1]) {
      issues.push({ index: cursor, expected: words[cursor], heard: raw[i], kind: 'extra' });
      continue;
    }
    issues.push({ index: cursor, expected: words[cursor], heard: raw[i], kind: 'substitution' });
    cursor++;
  }
  while (cursor < target.length && !target[cursor]) indices.push(cursor++);
  return { indices, cursor, issues, mismatchIndex: issues[0]?.index ?? null };
}

// i18n-canonical: canonical honorific text used for matching
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