import { normalizeArabic } from "./scholarly";

const units = ["الحادي", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع"];
const ordinals = [
  "الاول", ...units.slice(1), "العاشر", "الحادي عشر", "الثاني عشر", "الثالث عشر",
  "الرابع عشر", "الخامس عشر", "السادس عشر", "السابع عشر", "الثامن عشر", "التاسع عشر", "العشرون",
  ...units.map(word => `${word} والعشرون`), "الثلاثون",
  ...units.map(word => `${word} والثلاثون`), "الاربعون",
  "الحادي والاربعون", "الثاني والاربعون",
];

export function selectNawawiReference(
  question: string,
  records: readonly { number: number; text: string }[],
): string | null {
  const normalized = normalizeArabic(question)
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const numeric = normalized.match(/(?:^|\s)(?:ال)?حديث\s*(?:رقم\s*)?(\d{1,2})(?=\s|$)/);
  let number = numeric ? Number(numeric[1]) : null;
  if (number === null) {
    const match = ordinals.map((word, index) => ({ word, number: index + 1 }))
      .sort((a, b) => b.word.length - a.word.length)
      .find(({ word }) => new RegExp(`(?:^|\\s)(?:ال)?حديث\\s+${word}(?=\\s|$)`).test(normalized));
    number = match?.number ?? (/(?:^|\s)اول\s+حديث(?=\s|$)/.test(normalized) ? 1 : null);
  }
  const record = records.find(item => item.number === number);
  if (!record) return null;
  return `نص الحديث رقم ${record.number} كما يظهر في قارئ الأربعين النووية (مرجع دراسة غير معتمد للتصحيح):\n${record.text}`;
}