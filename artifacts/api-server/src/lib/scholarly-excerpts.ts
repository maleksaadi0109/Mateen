import { parse, type DefaultTreeAdapterMap } from "parse5";
import { normalizeArabic } from "./scholarly";
import { selectNawawiHadithNumber } from "./scholarly-study-context";

// Viewer indexes, not printed pages. Printed-page labels come from the fetched
// page itself. Nothing here grants a source approval or indexes a full book.
const books = [
  {
    id: 21812,
    title: "شرح الأربعين النووية",
    author: "محمد بن صالح العثيمين",
    publisher: "دار الثريا للنشر",
    starts: [3, 17, 77, 81, 94, 103, 113, 123, 131, 139, 151, 156, 158, 163,
      174, 179, 183, 193, 198, 204, 210, 213, 218, 233, 249, 257, 265, 272,
      289, 307, 316, 323, 326, 331, 337, 353, 366, 374, 380, 388, 392, 395],
  },
  {
    id: 11325,
    title: "فتح القوي المتين في شرح الأربعين وتتمة الخمسين",
    author: "عبد المحسن العباد",
    publisher: "دار ابن القيم، الطبعة الأولى، ١٤٢٤هـ",
    starts: [4, 11, 26, 31, 36, 39, 43, 46, 50, 54, 56, 58, 60, 62, 64, 68,
      70, 73, 76, 80, 83, 85, 87, 90, 96, 98, 100, 104, 110, 118, 121,
      123, 126, 129, 131, 135, 140, 143, 145, 147, 150, 153],
  },
] as const;

export const EXCERPT_NOTICE =
  "مقتطف مرجعي قصير، وليس شرحاً مولّداً. النقل الإلكتروني لم يُعتمد علمياً داخل مَتِين، وقد لا يغطي سؤالك كاملاً؛ راجع موضعه الأصلي.";

export class ScholarlyExcerptUnavailableError extends Error {
  constructor() {
    super("The requested commentary excerpt could not be checked");
    this.name = "ScholarlyExcerptUnavailableError";
  }
}

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
type Page = { url: string; printedPage: string; paragraphs: string[]; headingNumber: number | null };

function elements(node: Node, predicate: (element: Element) => boolean): Element[] {
  const found = "tagName" in node && predicate(node) ? [node] : [];
  if ("childNodes" in node) {
    for (const child of node.childNodes) found.push(...elements(child, predicate));
  }
  return found;
}

function attr(element: Element, name: string): string | undefined {
  return element.attrs.find(attribute => attribute.name === name)?.value;
}

function text(node: Node): string {
  if (node.nodeName === "#text") return (node as DefaultTreeAdapterMap["textNode"]).value;
  if ("tagName" in node && ["script", "style", "noscript"].includes(node.tagName)) return "";
  if (node.nodeName === "br") return " ";
  if (!("childNodes" in node)) return "";
  return node.childNodes.map(text).join("");
}

export function parseCommentaryPage(html: string, bookId: number, viewerPage: number): Page {
  if (![21812, 11325].includes(bookId) || !Number.isInteger(viewerPage) || viewerPage < 1 || viewerPage > 403) {
    throw new ScholarlyExcerptUnavailableError();
  }
  const document = parse(html);
  const matches = elements(document, element => (attr(element, "class") ?? "").split(/\s+/).includes("nass"));
  const content = matches[0];
  const printedPage = content && attr(content, "data-page-num");
  if (matches.length !== 1 || !content || attr(content, "data-page-id") !== String(viewerPage) ||
      !printedPage || !/^\d{1,4}$/.test(printedPage)) throw new ScholarlyExcerptUnavailableError();
  const lines = elements(content, element => element.tagName === "p")
    .map(element => text(element).replace(/\s+/g, " ").trim());
  const heading = lines.find(line => /^\[?الحديث\s/.test(line));
  const paragraphs = lines
    .filter(value => value.length >= 30 && /[\u0621-\u064a]/.test(value) && !/^\([٠-٩\d]+\)/.test(value));
  if (!paragraphs.length) throw new ScholarlyExcerptUnavailableError();
  return { url: `https://shamela.ws/book/${bookId}/${viewerPage}`, printedPage, paragraphs,
    headingNumber: heading ? selectNawawiHadithNumber(heading) : null };
}

const pageCache = new Map<string, { expires: number; page: Promise<Page> }>();

async function fetchPage(bookId: number, viewerPage: number): Promise<Page> {
  const key = `${bookId}/${viewerPage}`;
  const cached = pageCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.page;
  if (pageCache.size >= 256) pageCache.delete(pageCache.keys().next().value!);
  const entry = { expires: Date.now() + 5 * 60_000, page: fetchFreshPage(bookId, viewerPage) };
  pageCache.set(key, entry);
  try {
    return await entry.page;
  } catch (error) {
    // A brief failure cache avoids repeated external fetches while the source
    // is unavailable. It never serves an older quotation as a new response.
    entry.expires = Date.now() + 15_000;
    throw error;
  }
}

async function fetchFreshPage(bookId: number, viewerPage: number): Promise<Page> {
  // URL components are server-owned allowlisted constants. Never fetch a URL
  // supplied by a student, and refuse redirects (including off-host redirects).
  const response = await fetch(`https://shamela.ws/book/${bookId}/${viewerPage}`, {
    redirect: "error", signal: AbortSignal.timeout(8000),
    headers: { "User-Agent": "Mateen-short-reference/1.0" },
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html") || !response.body) {
    throw new ScholarlyExcerptUnavailableError();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 750_000) throw new ScholarlyExcerptUnavailableError();
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return parseCommentaryPage(Buffer.concat(chunks).toString("utf8"), bookId, viewerPage);
}

const stopWords = new Set(normalizeArabic(
  "اشرح شرح معنى الحديث حديث الأول اول الثاني الثالث الرابع الخامس السادس السابع الثامن التاسع العاشر في من على هذا ما هو لي رقم الأربعين النووية"
).split(" "));

export function chooseShortExcerpt(question: string, number: number, pages: Page[]) {
  const terms = normalizeArabic(question).split(/\s+/).filter(term => term.length > 2 && !stopWords.has(term));
  if (number === 1) terms.push("النيه", "النيات", "القصد");
  const candidates = pages.flatMap(page => page.paragraphs.map(paragraph => {
    const normalized = normalizeArabic(paragraph);
    const score = terms.reduce((sum, term) => sum + (normalized.includes(term) ? 3 : 0), 0) +
      (/معني|المراد|القصد|وشرعا/.test(normalized) ? 8 : 0) +
      (/النيه|النيات/.test(normalized) ? 2 : 0);
    return { page, paragraph, score };
  })).filter(({ paragraph }) =>
    !/^[[(（]/.test(paragraph) && !/^رواه |^عن |^عَنْ |^عَن |^الحديث /.test(paragraph) &&
    !paragraph.includes("الشرح]") && !paragraph.includes("الحديث الأول]"));
  const chosen = candidates.sort((a, b) => b.score - a.score)[0];
  if (!chosen) throw new ScholarlyExcerptUnavailableError();
  // At most 70 words per book, never a whole chapter or a generated paraphrase.
  const words = chosen.paragraph.split(/\s+/);
  const quote = words.slice(0, 70).join(" ") + (words.length > 70 ? " …" : "");
  return { quote, url: chosen.page.url, printedPage: chosen.page.printedPage };
}

export async function answerNawawiExcerpt(question: string, number: number): Promise<string> {
  if (!Number.isInteger(number) || number < 1 || number > 42) throw new ScholarlyExcerptUnavailableError();
  try {
    const excerpts = await Promise.all(books.map(async book => {
      const start = book.starts[number - 1];
      if (!start) throw new ScholarlyExcerptUnavailableError();
      const end = book.starts[number] ?? (book.id === 21812 ? 404 : 156);
      const indexes = book.id === 11325 && number === 1
        ? [start, start + 2, start + 3]
        : Array.from({ length: Math.min(3, end - start) }, (_, offset) => start + offset);
      const pages = await Promise.all(indexes.map(index => fetchPage(book.id, index)));
      // Page order and chapter mapping can change on the external site. Refuse
      // a chapter whose opening page no longer identifies a hadith at all.
      if (pages[0]?.headingNumber !== number) {
        throw new ScholarlyExcerptUnavailableError();
      }
      const excerpt = chooseShortExcerpt(question, number, pages);
      return [
        `من شرح الحديث رقم ${number}:`,
        `«${excerpt.quote}»`,
        `المرجع: ${book.title} — ${book.author}`,
        `الطبعة: ${book.publisher} · الصفحة المطبوعة: ${excerpt.printedPage}`,
        `رابط المرجع: ${excerpt.url}`,
      ].join("\n");
    }));
    return `${EXCERPT_NOTICE}\n\n${excerpts.join("\n\n")}`;
  } catch {
    // Never silently replace an unavailable quotation with model prose.
    throw new ScholarlyExcerptUnavailableError();
  }
}