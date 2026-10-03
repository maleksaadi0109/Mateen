import nawawiRecords from "../data/nawawi.json";

export type CanonicalMatnSourceRecord = {
  readonly id: number;
  readonly number: number;
  readonly title: string;
  readonly text: string;
  readonly sourcePage: number;
  readonly sourceUrl: string;
};

export type CanonicalMatnRecord = {
  id: number;
  number: number;
  title: string;
  text: string;
  sourcePage: number;
  sourceUrl: string;
};

type MatnBoundary = {
  readonly id: number;
  readonly start: string;
  readonly end: string;
  readonly selection: "primary-report" | "selected-primary-report";
};

/**
 * Explicit source-text boundaries, not phrase heuristics. Hadith 27 contains
 * two reports; this deliberately selects only the first report.
 */
export const canonicalMatnBoundaries: readonly MatnBoundary[] = Object.freeze([
  { id: 1, start: "إنما الأعمال بالنيات", end: "فهجرته إلى ما هاجر إليه", selection: "primary-report" },
  { id: 2, start: "بينما نحن جلوس عند رسول الله ﵌ ذات يوم", end: "فإنه جبريل أتاكم يعلمكم دينكم", selection: "primary-report" },
  { id: 3, start: "بني الإسلام على خمس", end: "وحج البيت، وصوم رمضان", selection: "primary-report" },
  { id: 4, start: "إن أحدكم يجمع خلقه", end: "فيعمل بعمل أهل الجنة فيدخلها", selection: "primary-report" },
  { id: 5, start: "من أحدث في أمرنا", end: "من أحدث في أمرنا هذا ما ليس منه فهو رد", selection: "primary-report" },
  { id: 6, start: "إن الحلال بين", end: "ألا وهي القلب", selection: "primary-report" },
  { id: 7, start: "الدين النصيحة", end: "ولأئمة المسلمين وعامتهم", selection: "primary-report" },
  { id: 8, start: "أمرت أن أقاتل الناس", end: "وحسابهم على الله تعالى", selection: "primary-report" },
  { id: 9, start: "مانهيتكم عنه فاجتنبوه", end: "واختلافهم على أنبيائهم", selection: "primary-report" },
  { id: 10, start: "إن الله تعالى طيب", end: "فأنى يستجاب له", selection: "primary-report" },
  { id: 11, start: "دع ما يريبك", end: "دع ما يريبك إلى ما لا يريبك", selection: "primary-report" },
  { id: 12, start: "من حسن إسلام المرء", end: "تركه ما لا يعنيه", selection: "primary-report" },
  { id: 13, start: "لا يؤمن أحدكم حتى يحب", end: "يحب لأخيه ما يحب لنفسه", selection: "primary-report" },
  { id: 14, start: "لا يحل دم امرئ مسلم", end: "والتارك لدينه المفارق للجماعة", selection: "primary-report" },
  { id: 15, start: "من كان يؤمن بالله واليوم الآخر فليقل", end: "فليكرم ضيفه", selection: "primary-report" },
  { id: 16, start: "أوصني، قال لا تغضب", end: "فردد مرارًا، قال لا تغضب", selection: "primary-report" },
  { id: 17, start: "إن الله كتب الإحسان", end: "وليرح ذبيحته", selection: "primary-report" },
  { id: 18, start: "إتق الله حيثما كنت", end: "وخالق الناس بخلق حسن", selection: "primary-report" },
  { id: 19, start: "يا غلام، إني أعلمك كلمات", end: "رفعت الأقلام وجفت الصحف", selection: "primary-report" },
  { id: 20, start: "إن مما أدرك الناس", end: "إذا لم تستح فاصنع ما شئت", selection: "primary-report" },
  { id: 21, start: "قلت يا رسول الله قل لي في الإسلام قولًا لا أسال عنه أحدًا غيرك", end: "قل آمنت بالله، ثم استقم", selection: "primary-report" },
  { id: 22, start: "أرأيت إذا صليت المكتوبات", end: "قال نعم", selection: "primary-report" },
  { id: 23, start: "الطهور شطر الإيمان", end: "فبائع نفسه فمعتقها أو موبقها", selection: "primary-report" },
  { id: 24, start: "إني حرمت الظلم", end: "فلا يلومن إلا نفسه", selection: "primary-report" },
  { id: 25, start: "يا رسول الله، ذهب أهل الدثور بالأجور", end: "فكذلك إذا وضعها في الحلال كان له أجر", selection: "primary-report" },
  { id: 26, start: "كل سلامى من الناس", end: "وتميط الأذى عن الطريق", selection: "primary-report" },
  { id: 27, start: "البر حسن الخلق", end: "وكرهت أن يطلع عليه الناس", selection: "selected-primary-report" },
  { id: 28, start: "أوصيكم بتقوى الله", end: "فإن كل بدعة ضلالة", selection: "primary-report" },
  { id: 29, start: "أخبرني بعمل يدخلني الجنة ويباعدني عن النار", end: "إلا حصائد ألسنتهم؟", selection: "primary-report" },
  { id: 30, start: "إن الله تعالى فرض فرائض", end: "فلا تبحثوا عنها", selection: "primary-report" },
  { id: 31, start: "يا رسول الله، دلني على عمل إذا عملته أحبني الله وأحبني الناس", end: "وازهد فيما عند الناس يحبك الناس", selection: "primary-report" },
  { id: 32, start: "لا ضرر", end: "ولا ضرار", selection: "primary-report" },
  { id: 33, start: "لو يعطى الناس بدعواهم", end: "واليمين على من أنكر", selection: "primary-report" },
  { id: 34, start: "من رأى منكم منكرًا", end: "وذلك أضعف الإيمان", selection: "primary-report" },
  { id: 35, start: "لا تحاسدوا", end: "دمه وماله وعرضه", selection: "primary-report" },
  { id: 36, start: "من نفس عن مؤمن", end: "ومن بطأ به عمله لم يسرع به نسبه", selection: "primary-report" },
  { id: 37, start: "إن الله كتب الحسنات", end: "وإن هم بها فعملها كتبها الله سيئة واحدة", selection: "primary-report" },
  { id: 38, start: "من عادى لي وليًا", end: "ولئن استعاذني لأعيذنه", selection: "primary-report" },
  { id: 39, start: "إن الله تجاوز لي", end: "وما اسكترهوا عليه", selection: "primary-report" },
  { id: 40, start: "كن في الدنيا", end: "غريب أو عابر سبيل", selection: "primary-report" },
  { id: 41, start: "لا يؤمن أحدكم حتى يكون هواه", end: "تبعًا لما جئت به", selection: "primary-report" },
  { id: 42, start: "يابن آدم، إنك ما دعوتني", end: "لأتيتك بقرابها مغفرة", selection: "primary-report" },
]);

function uniqueIndex(text: string, anchor: string, id: number, kind: string): number {
  if (!anchor) throw new Error(`Canonical matn ${id} has an empty ${kind} anchor.`);
  const index = text.indexOf(anchor);
  if (index < 0 || text.indexOf(anchor, index + 1) !== -1) {
    throw new Error(`Canonical matn ${id} has a missing or ambiguous ${kind} anchor.`);
  }
  return index;
}

export function extractCanonicalMatnRecords(
  rawRecords: readonly CanonicalMatnSourceRecord[],
  boundaries: readonly MatnBoundary[] = canonicalMatnBoundaries,
): CanonicalMatnRecord[] {
  if (rawRecords.length !== 42 || boundaries.length !== 42) {
    throw new Error("Canonical Nawawi source must contain exactly 42 explicitly bounded records.");
  }
  const sources = new Map<number, CanonicalMatnSourceRecord>();
  for (const raw of rawRecords) {
    if (!Number.isInteger(raw.id) || !Number.isInteger(raw.number) || sources.has(raw.id) ||
      raw.id !== raw.number || !raw.title || !raw.text || !Number.isInteger(raw.sourcePage) || !raw.sourceUrl) {
      throw new Error("Canonical Nawawi source record is malformed or duplicated.");
    }
    sources.set(raw.id, raw);
  }
  const seenBoundaries = new Set<number>();
  const records = boundaries.map((boundary) => {
    const raw = sources.get(boundary.id);
    if (!raw || seenBoundaries.has(boundary.id) ||
      (boundary.selection !== "primary-report" && boundary.selection !== "selected-primary-report")) {
      throw new Error("Canonical Nawawi boundary mapping is missing, duplicated, or malformed.");
    }
    seenBoundaries.add(boundary.id);
    const start = uniqueIndex(raw.text, boundary.start, boundary.id, "start");
    const end = uniqueIndex(raw.text, boundary.end, boundary.id, "end");
    if (end < start || end + boundary.end.length <= start) {
      throw new Error(`Canonical matn ${boundary.id} has reversed or empty boundaries.`);
    }
    return Object.freeze({
      id: raw.id,
      number: raw.number,
      title: raw.title,
      text: raw.text.slice(start, end + boundary.end.length),
      sourcePage: raw.sourcePage,
      sourceUrl: raw.sourceUrl,
    });
  });
  if (seenBoundaries.size !== sources.size) {
    throw new Error("Canonical Nawawi boundary mapping does not cover every source record.");
  }
  return records;
}

export const canonicalMatnRecords: readonly CanonicalMatnRecord[] = Object.freeze(
  extractCanonicalMatnRecords(nawawiRecords as readonly CanonicalMatnSourceRecord[]),
);