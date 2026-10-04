export const STUDY_BOOKS = {
  nawawi: "الأربعون النووية",
  "usul-thalatha": "الأصول الثلاثة",
  tuhfa: "تحفة الأطفال",
} as const;

export type StudyBookId = keyof typeof STUDY_BOOKS;

// Book-identification metadata, not an imported/approved matn or commentary.
// Outline checked against https://takw.in/reader.php?matn=ثلاثة-الأصول
export const USUL_STUDY_CONTEXT =
  "تعريف مختصر بالكتاب المختار، غير معتمد للاقتباس أو التصحيح: الأصول الثلاثة (ثلاثة الأصول وأدلتها) لمحمد بن عبد الوهاب. " +
  "الأصل الأول: معرفة الله، أي معرفة العبد ربه. الأصل الثاني: معرفة دين الإسلام بالأدلة. " +
  "الأصل الثالث: معرفة النبي محمد صلى الله عليه وسلم. " +
  "هذا تعريف بالمحاور فقط، لا يحتوي النص الكامل أو شرحاً معتمداً. لا تختلق ألفاظ الكتاب عند طلب اقتباس؛ اطلب المقطع من الطالب.";

export function isStudyBookId(value: string): value is StudyBookId {
  return Object.hasOwn(STUDY_BOOKS, value);
}

export function studyBookId(value: string | null): StudyBookId {
  if (value === null) return "nawawi"; // Historical questions predate book selection.
  if (!isStudyBookId(value)) throw new Error("Unsupported study book");
  return value;
}