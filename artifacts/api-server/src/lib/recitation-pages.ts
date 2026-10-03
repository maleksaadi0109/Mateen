import { createHash } from "node:crypto";
import { z } from "zod/v4";

const regionSchema = z.object({
  page: z.number().int().min(1).max(32),
  wordIndices: z.array(z.number().int().nonnegative()).min(1),
  x: z.number().nonnegative(), y: z.number().nonnegative(),
  width: z.number().positive(), height: z.number().positive(),
});
const headingSchema = regionSchema.omit({wordIndices:true});
export const pageMapSchema = z.object({
  edition: z.string().min(1),
  sourcePdfHash: z.string().regex(/^[a-f0-9]{64}$/),
  rightsSourceVersionId: z.string().nullable(),
  pages: z.array(z.object({
    page: z.number().int().min(1).max(32), width: z.number().int().positive(),
    height: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
    objectPath: z.string().nullable(),
  })).length(32),
  hadiths: z.array(z.object({
    hadithId: z.number().int().min(1).max(42), text: z.string(),
    canonicalText: z.string().optional(),
    title: z.string().optional(),
    heading: headingSchema.optional(),
    textHash: z.string(), verification: z.enum(["pending", "visually-checked"]),
    regions: z.array(regionSchema),
    unmappedIndices: z.array(z.number().int().nonnegative()),
  })).length(42),
});
export type PageMap = z.infer<typeof pageMapSchema>;
export function pageWords(text: string) {
  return text.replace(/﵌/g, "صلى الله عليه وآله وسلم")
    .replace(/﵁/g, "رضي الله عنه").replace(/﵂/g, "رضي الله عنها")
    .normalize("NFKC").trim().split(/\s+/u).filter(Boolean);
}
export function validatePageMap(input: unknown): PageMap {
  const map = pageMapSchema.parse(input);
  if (new Set(map.pages.map(p => p.page)).size !== 32 ||
      new Set(map.hadiths.map(h => h.hadithId)).size !== 42) throw new Error("Duplicate page/hadith.");
  for (const hadith of map.hadiths) {
    if (createHash("sha256").update(hadith.text).digest("hex") !== hadith.textHash)
      throw new Error("Stale recitation text hash.");
    const count = pageWords(hadith.text).length;
    if (hadith.canonicalText && !hadith.text.endsWith(hadith.canonicalText))
      throw new Error("Edition practice must retain its bound canonical matn.");
    if (hadith.heading) {
      const h=hadith.heading, p=map.pages.find(p => p.page===h.page)!;
      if (h.x+h.width>p.width || h.y+h.height>p.height) throw new Error("Invalid heading bounds.");
    }
    const seen = new Set<number>();
    for (const r of hadith.regions) {
      const page = map.pages.find(p => p.page === r.page)!;
      if (r.x+r.width > page.width || r.y+r.height > page.height) throw new Error("Out of bounds crop.");
      for (const i of r.wordIndices) {
        if (i >= count || seen.has(i)) throw new Error("Duplicate/invalid word mapping.");
        seen.add(i);
      }
    }
    for (const i of hadith.unmappedIndices) {
      if (i >= count || seen.has(i)) throw new Error("Invalid unmapped word.");
      seen.add(i);
    }
    if (seen.size !== count) throw new Error("Every training token must be accounted for.");
  }
  return map;
}