import { createHash } from "node:crypto";
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, sourceVersionsTable } from "@workspace/db";
import { GetRecitationPagesResponse, GetNawawiBookResponse } from "@workspace/api-zod";
import rawMap from "../data/nawawi-page-map.json";
import imageAuthorization from "../data/nawawi-image-authorization.json";
import { validatePageMap } from "../lib/recitation-pages";
import { canonicalMatnRecords } from "../lib/canonical-matn";
import { authenticationRequired, type AuthedRequest } from "../lib/mateen-auth";
import { getStorageFile } from "../lib/recitation-service";

const router = Router();
const map = validatePageMap(rawMap);

// A text-edition permission cannot accidentally authorize publishing scan bytes.
// The independently reviewed evidence must explicitly bind this PDF and both uses.
async function rightsCleared() {
  // Explicit owner attestation is a separate permission provenance. It must
  // never mutate or imply independent scholarly/source review approval.
  if (imageAuthorization.status === "owner-attested" &&
      imageAuthorization.sourcePdfHash === map.sourcePdfHash &&
      imageAuthorization.uses.includes("page-images") &&
      imageAuthorization.uses.includes("clipped-regions")) return true;
  if (!map.rightsSourceVersionId) return false;
  const [row] = await db.select().from(sourceVersionsTable)
    .where(eq(sourceVersionsTable.id, map.rightsSourceVersionId)).limit(1);
  return !!row && row.rightsStatus === "cleared" && row.status !== "withdrawn" &&
    row.status !== "rejected" && !!row.rightsReviewerId &&
    row.rightsReviewerId !== row.createdBy &&
    row.payload.rightsEvidence.includes(map.sourcePdfHash) &&
    row.payload.rightsEvidence.includes("page-images") &&
    row.payload.rightsEvidence.includes("clipped-regions") &&
    /^https?:\/\//.test(row.payload.rightsUrl);
}

router.get("/mateen/recitation-pages/:hadithId", authenticationRequired, async (req: AuthedRequest, res) => {
  res.set("Cache-Control", "private, no-store");
  const id = Number(req.params.hadithId);
  const hadith = map.hadiths.find(h => h.hadithId === id);
  if (!hadith) { res.status(404).json({ error: "Unknown hadith." }); return; }
  const cleared = await rightsCleared();
  const exact = canonicalMatnRecords.find(h => h.id === id)?.text === (hadith.canonicalText ?? hadith.text);
  const pages = map.pages.filter(p => hadith.regions.some(r => r.page === p.page));
  const ready = cleared && exact && hadith.verification === "visually-checked" &&
    hadith.regions.length > 0 && pages.every(p => p.objectPath);
  res.json(GetRecitationPagesResponse.parse({
    status: ready ? "available" : cleared ? "mapping_pending" : "rights_pending",
    message: ready ? "كشف تجريبي لمناطق الكلمات المطابقة في هذه الطبعة؛ ليس تقييماً للحفظ."
      : !cleared ? "صور الطبعة محفوظة الحقوق؛ لم يوثّق إذن إعادة نشرها بعد. التدريب النصي التجريبي متاح."
      : "تجري مراجعة مواضع الكلمات ومطابقتها لنص التدريب. التدريب النصي التجريبي متاح.",
    text: hadith.text,
    title: ready ? hadith.title : undefined,
    heading: ready ? hadith.heading : undefined,
    pages: ready ? pages.map(p => ({ page:p.page,width:p.width,height:p.height,
      imageUrl:`/api/mateen/recitation-page-images/${p.page}` })) : [],
    regions: ready ? hadith.regions : [],
    unmappedIndices: ready ? hadith.unmappedIndices : [],
  }));
});

router.get("/mateen/nawawi-book", authenticationRequired, async (_req: AuthedRequest, res) => {
  res.set("Cache-Control", "private, no-store");
  if (!await rightsCleared()) { res.status(403).json({error:"Image use not authorized."}); return; }
  if (map.pages.some(p => !p.objectPath)) {
    res.status(503).json({error:"Scanned edition not fully available."}); return;
  }
  res.json(GetNawawiBookResponse.parse({
    edition:map.edition,
    sourceUrl:"https://d1.islamhouse.com/data/ar/ih_books/parts/Forty_Nawawi_Hadith/ar_Forty_Nawawi_Hadith_Dar_Alsalam.pdf",
    pages:map.pages.map(p => ({page:p.page,width:p.width,height:p.height,
      imageUrl:`/api/mateen/recitation-page-images/${p.page}`})),
    hadithPages:rawMap.hadiths.map(h => ({
      hadithId:h.hadithId,firstPage:h.pageRange[0],lastPage:h.pageRange[1],
    })),
  }));
});

router.get("/mateen/recitation-page-images/:page", authenticationRequired, async (req: AuthedRequest, res) => {
  res.set("Cache-Control", "private, no-store");
  if (!await rightsCleared()) { res.status(403).json({ error:"Scan reuse permission is pending." }); return; }
  const page = map.pages.find(p => p.page === Number(req.params.page));
  // Reading whole authorized pages does not assert a verified word mapping.
  // The recitation endpoint alone releases geometrically reviewed word crops.
  if (!page?.objectPath) { res.status(404).end(); return; }
  try {
    const file = await getStorageFile(page.objectPath);
    const [bytes] = await file.download();
    if (createHash("sha256").update(bytes).digest("hex") !== page.sha256) {
      res.status(409).json({error:"Edition image integrity mismatch."}); return;
    }
    res.set("X-Content-Type-Options","nosniff").type("image/webp").send(bytes);
  } catch {
    req.log.error("Unable to serve verified recitation page.");
    res.status(503).json({error:"Edition image unavailable."});
  }
});
export default router;