export { EXCERPT_NOTICE, ScholarlyExcerptUnavailableError } from "../../src/lib/scholarly-excerpts";
import { EXCERPT_NOTICE, ScholarlyExcerptUnavailableError } from "../../src/lib/scholarly-excerpts";
let unavailable = false;
let calls = 0;
export function getExcerptCallCount() { return calls; }
export function setExcerptUnavailable(value: boolean) { unavailable = value; }
export async function answerNawawiExcerpt(_question: string, number: number) {
  calls++;
  if (unavailable) throw new ScholarlyExcerptUnavailableError();
  return `${EXCERPT_NOTICE}\n\nمقتطف اصطناعي لاختبار النقل والحفظ فقط، الحديث رقم ${number}.\nرابط المرجع: https://shamela.ws/book/21812/5`;
}