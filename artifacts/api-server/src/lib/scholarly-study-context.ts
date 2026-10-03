import { normalizeArabic } from "./scholarly";

const units = ["الحادي", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع"];
const ordinals = [
  "الاول", ...units.slice(1), "العاشر", "الحادي عشر", "الثاني عشر", "الثالث عشر",
  "الرابع عشر", "الخامس عشر", "السادس عشر", "السابع عشر", "الثامن عشر", "التاسع عشر", "العشرون",
  ...units.map(word => `${word} والعشرون`), "الثلاثون",
  ...units.map(word => `${word} والثلاثون`), "الاربعون",
  "الحادي والاربعون", "الثاني والاربعون",
];

function normalizedReference(question: string): string {
  return normalizeArabic(question)
    .replace(/العشرين/g, "العشرون").replace(/الثلاثين/g, "الثلاثون").replace(/الاربعين/g, "الاربعون")
    .replace(/الواحد(?=\s+(?:و)?(?:العشرون|الثلاثون|الاربعون))/g, "الحادي")
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/#/g, " ");
}

function numberedReferences(question: string): number[] {
  const normalized = normalizedReference(question);
  const numbers = [
    ...normalized.matchAll(/(?:^|\s)و?(?:ال)?حديث\s*(?:رقم\s*)?(\d+(?:\s+و?\s*\d+)*)(?=\s|$)/g),
    ...normalized.matchAll(/(?:^|\s)و?(?:رقم\s*)?(\d+)\s*(?:ال)?حديث(?=\s|$)/g),
  ].flatMap(match => [...match[1]!.matchAll(/\d+/g)].map(number => Number(number[0])));
  if (/^(?:اشرح|شرح|وضح)\s+(?:لي\s+)?\d+(?:\s+و?\s*\d+)*$/.test(normalized) || /^\d+$/.test(normalized) ||
    (/(?:الاربعون|الاربيعن|الارعين)\s+النوويه/.test(normalized) && /اشرح|شرح|وضح|معني/.test(normalized))) {
    numbers.push(...[...normalized.matchAll(/(?:^|\s)و?(\d+)(?=\s|$)/g)].map(match => Number(match[1])));
  }
  // Longest ordinal first; consume the entire compound before shorter forms.
  const ordered = ordinals.map((word, index) => ({ word, number: index + 1 }))
    .sort((a, b) => b.word.length - a.word.length);
  const ordinalPattern = ordered.map(({ word }) => word).join("|");
  for (const match of normalized.matchAll(new RegExp(`(?:^|\\s)و?(?:ال)?حديث\\s+(${ordinalPattern})(?=\\s|$)`, "g"))) {
    numbers.push(ordered.find(item => item.word === match[1])!.number);
  }
  const beforePattern = ordered.map(({ word }) => word.replace(/^ال/, "")).join("|");
  for (const match of normalized.matchAll(new RegExp(`(?:^|\\s)(?:ال)?(${beforePattern})\\s+(?:ال)?حديث(?=\\s|$)`, "g"))) {
    numbers.push(ordered.find(item => item.word.replace(/^ال/, "") === match[1])!.number);
  }
  return [...new Set(numbers)];
}

export function selectNawawiHadithNumber(question: string): number | null {
  const numbers = numberedReferences(question);
  return numbers.length === 1 && numbers[0]! >= 1 && numbers[0]! <= 42 ? numbers[0]! : null;
}

type StudyRecord = { number: number; text: string };
const commonWords = new Set(normalizeArabic(
  "اشرح شرح وضح تفسير معنى لي هذا هذه ذلك النص الحديث حديث رقم في من ما هو هي عن قال يقول رسول الله صلى عليه وسلم رضي تعالى عنه عنها رواه البخاري مسلم بن ابن أبي أبو"
).split(" "));

function namedReferences(question: string): string[] {
  const normalized = normalizeArabic(question);
  const matches = [...normalized.matchAll(/(?:^|\s)و?(?:ال)?حديث\s+(?:ال)?(نيه|نيات|جبريل|نصيحه)(?=\s|$)/g)];
  if (matches.length) {
    matches.push(...normalized.matchAll(/(?:^|\s)و\s*(?:ال)?(نيه|نيات|جبريل|نصيحه)(?=\s|$)/g));
  }
  return [...new Set(matches.map(match =>
    /نيه|نيات/.test(match[1]!) ? "النيات" : match[1] === "نصيحه" ? "النصيحه" : "جبريل"))];
}

function namedTextNumbers(question: string, records: readonly StudyRecord[]): number[] {
  const terms = namedReferences(question);
  return [...new Set(records.filter(record => record.number >= 1 && record.number <= 42 &&
    terms.some(term => normalizeArabic(record.text).includes(term))).map(record => record.number))];
}

function matchingTextNumbers(question: string, records: readonly StudyRecord[]): number[] {
  const named = namedTextNumbers(question, records);
  if (named.length > 1) return named;
  const words = normalizeArabic(question).split(/\s+/);
  const corpus = records.filter(record => record.number >= 1 && record.number <= 42)
    .map(record => ({ number: record.number, text: ` ${normalizeArabic(record.text)} ` }));
  for (let size = Math.min(8, words.length); size >= 2; size--) {
    const phrases = new Set<string>();
    for (let start = 0; start + size <= words.length; start++) {
      const phrase = words.slice(start, start + size);
      if (!phrase.some(word => word.length > 2 && !commonWords.has(word))) continue;
      phrases.add(` ${phrase.join(" ")} `);
    }
    const scores = corpus.map(record => ({
      number: record.number,
      score: [...phrases].filter(phrase => record.text.includes(phrase)).length,
    })).filter(record => record.score > 0).sort((a, b) => b.score - a.score);
    if (scores.length) {
      // A full pasted matn also contains shared narration/attribution phrases.
      // Require a clear lead rather than letting one shared phrase veto it,
      // or picking a slightly better match from two genuinely plausible texts.
      if (scores.length === 1 || scores[0]!.score >= scores[1]!.score * 2) {
        return [...new Set([...named, scores[0]!.number])];
      }
      return [...new Set([...named, ...scores.map(record => record.number)])];
    }
  }
  // Recognized titles still require evidence in the corresponding matn; these
  // aliases identify an entry, not a generated interpretation of its content.
  return named;
}

/** Resolve against actual study text, never a model's recollection. Invalid or
 * conflicting explicit numbers and ambiguous phrases cannot silently select
 * another entry, even when a context field mentions one. */
export function identifyNawawiHadith(
  question: string, records: readonly StudyRecord[], textContext: string | null = null,
): number | null {
  return resolveNawawiHadith(question, records, textContext).number;
}

export function resolveNawawiHadith(
  question: string, records: readonly StudyRecord[], textContext: string | null = null,
): { number: number | null; requested: boolean } {
  const numbers = numberedReferences(question);
  if (numbers.length) {
    const combined = new Set([...numbers, ...matchingTextNumbers(question, records)]);
    return {
      number: combined.size === 1 ? selectNawawiHadithNumber(question) : null,
      requested: true,
    };
  }
  const matches = matchingTextNumbers(question, records);
  if (matches.length) return { number: matches.length === 1 ? matches[0]! : null, requested: true };
  const requested = wantsNawawiExcerpt(question);
  if (!textContext) return { number: null, requested };
  if (numberedReferences(textContext).length) {
    return resolveNawawiHadith(textContext, records);
  }
  const contextMatches = matchingTextNumbers(textContext, records);
  return {
    number: contextMatches.length === 1 ? contextMatches[0]! : null,
    requested: requested || contextMatches.length > 0 || /اشرح|شرح|وضح|معني/.test(normalizeArabic(question)),
  };
}

export function wantsNawawiExcerpt(question: string): boolean {
  if (numberedReferences(question).length || namedReferences(question).length) return true;
  const normalized = normalizeArabic(question);
  return /(?:اشرح|شرح|معني|معنى|وضح).*(?:حديث|الاربعين)|(?:حديث|الاربعين).*(?:اشرح|شرح|معني|معنى|وضح)/.test(normalized);
}

export function selectNawawiReference(
  question: string,
  records: readonly { number: number; text: string }[],
): string | null {
  const number = identifyNawawiHadith(question, records);
  const record = records.find(item => item.number === number);
  if (!record) return null;
  return `نص الحديث رقم ${record.number} كما يظهر في قارئ الأربعين النووية (مرجع دراسة غير معتمد للتصحيح):\n${record.text}`;
}