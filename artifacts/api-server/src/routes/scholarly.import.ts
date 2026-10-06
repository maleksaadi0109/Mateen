import {
  GetAljam3ImportResponse, ImportAljam3SourceBody, ImportAljam3SourceResponse,
} from "@workspace/api-zod";
import { db, scholarlyAuditTable, scholarlyPassagesTable, scholarlySourcesTable } from "@workspace/db";
import { and, eq, or, sql } from "drizzle-orm";
import { Router } from "express";
import { isDeepStrictEqual } from "node:util";
import { getAljam3Package } from "../lib/scholarly-aljam3-package";
import { authenticationRequired, hasOnlyKeys, rateLimit, requireAdmin, sameOrigin, type AuthedRequest } from "./scholarly.shared";

const router = Router();
const path = "/mateen/admin/scholarly/imports/aljam3";

router.get(path, authenticationRequired, async (req: AuthedRequest, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  if (!await requireAdmin(req, res)) return;
  try {
    const p = getAljam3Package();
    res.json(GetAljam3ImportResponse.parse({
      ...p.source, passageCount: p.passages.length,
    }));
  } catch {
    res.status(503).json({ error: "حزمة المقاطع المحلية غير متاحة أو لم تجتز فحص سلامة الملف." });
  }
});

router.post(path, sameOrigin, authenticationRequired, rateLimit(10, 60_000),
  async (req: AuthedRequest, res): Promise<void> => {
    res.set("Cache-Control", "no-store");
    if (!await requireAdmin(req, res)) return;
    const body = ImportAljam3SourceBody.safeParse(req.body);
    if (!body.success || body.data.confirmUnreviewed !== true ||
        !hasOnlyKeys(req.body, ["confirmUnreviewed"])) {
      res.status(400).json({ error: "يلزم تأكيد أن المقاطع مسودة غير مدققة." });
      return;
    }
    try {
      const p = getAljam3Package();
      const sourceMetadata = {
        ...p.source, packageFormat: p.format, packageSha256: p.packageSha256,
        quoteCandidates: p.quoteCandidates ?? [],
      };
      const result = await db.transaction(async (tx) => {
        // Serialize concurrent submissions across users/processes. The unique
        // import key also guards retries after a committed but lost response.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${p.importKey}, 0))`);
        // Legacy v1/v2 imports hashed the entire preparation JSON. Search the
        // edition/version too; a changed package key must not create a source.
        const candidates = await tx.select().from(scholarlySourcesTable)
          .where(or(eq(scholarlySourcesTable.importKey, p.importKey),
            and(sql`${scholarlySourcesTable.importKey} like 'aljam3:%'`,
              sql`${scholarlySourcesTable.preparationMetadata}->>'rawTextSha256' = ${p.source.rawTextSha256}`),
            and(eq(scholarlySourcesTable.title, p.source.title),
              eq(scholarlySourcesTable.edition, p.source.edition),
              eq(scholarlySourcesTable.version, p.source.version)))).limit(2).for("update");
        if (candidates.length > 1) return null;
        const [previous] = candidates;
        if (previous) {
          if (!previous.importKey?.startsWith("aljam3:") ||
              previous.preparationMetadata?.rawTextSha256 !== p.source.rawTextSha256 ||
              previous.title !== p.source.title || previous.edition !== p.source.edition ||
              previous.version !== p.source.version || previous.author !== p.source.author ||
              previous.textId !== p.source.textId) return null;
          if (previous.preparationMetadata?.packageSha256 === p.packageSha256 &&
              (previous.preparationMetadata.packageFormat !== p.format ||
               !isDeepStrictEqual(previous.preparationMetadata.quoteCandidates, p.quoteCandidates ?? []))) return null;
          const existing = await tx.select().from(scholarlyPassagesTable)
            .where(eq(scholarlyPassagesTable.sourceId, previous.id)).limit(p.passages.length + 1).for("update");
          const originals = new Map(p.passages.map(passage => [passage.id, passage]));
          const seen = new Set<string>();
          // Count alone cannot detect missing/duplicated/edited originals.
          if (existing.length !== p.passages.length) return null;
          for (const row of existing) {
            const id = row.preparationMetadata?.id as string;
            const original = originals.get(id);
            if (!original || seen.has(id) || row.text !== original.text ||
                row.sourceUrl !== original.sourceUrl || row.viewerPage !== original.viewerPage ||
                row.volume !== original.volume ||
                row.pdfPage !== row.preparationMetadata?.pdfPage ||
                row.printedPage !== row.preparationMetadata?.printedPage ||
                row.preparationMetadata?.textSha256 !== original.textSha256 ||
                row.preparationMetadata?.startOffset !== original.startOffset ||
                row.preparationMetadata?.endOffset !== original.endOffset) return null;
            if (previous.preparationMetadata?.packageSha256 === p.packageSha256) {
              const { text: _text, ...provenance } = original;
              if (!isDeepStrictEqual(row.preparationMetadata, provenance)) return null;
            }
            seen.add(id);
          }
          // Enrich only untouched drafts. Never restore withdrawn sources or
          // reset reviews/indexing; original SQL IDs, bytes and legacy key stay.
          if (p.format === "mateen-source-preparation-v2" && previous.status === "draft" &&
              previous.reviewedBy === null && previous.reviewedAt === null &&
              previous.indexedAt === null && existing.every(row => !row.indexed) &&
              previous.preparationMetadata?.packageSha256 !== p.packageSha256) {
            for (const row of existing) {
              const { text: _text, ...provenance } = originals.get(row.preparationMetadata!.id as string)!;
              await tx.update(scholarlyPassagesTable).set({
                preparationMetadata: provenance,
                pdfPage: provenance.pdfPage, printedPage: provenance.printedPage,
              }).where(eq(scholarlyPassagesTable.id, row.id));
            }
            await tx.update(scholarlySourcesTable).set({
              preparationMetadata: { ...previous.preparationMetadata, ...sourceMetadata },
            }).where(eq(scholarlySourcesTable.id, previous.id));
            await tx.insert(scholarlyAuditTable).values({
              actorId: req.scholarlyUserId!, action: "prepared_source_collation_updated",
              targetType: "source", targetId: previous.id,
              reason: "Added bounded unreviewed collation metadata; immutable originals, source identity and approvals unchanged",
              details: { importKey: previous.importKey, packageSha256: p.packageSha256 },
            });
          }
          return { sourceId: previous.id, outcome: "already_imported" as const,
            totalCount: p.passages.length, importedCount: 0, existingCount: p.passages.length };
        }
        const [source] = await tx.insert(scholarlySourcesTable).values({
          title: p.source.title, author: p.source.author, edition: p.source.edition,
          textId: p.source.textId, version: p.source.version,
          legalAuthorization: "permission_granted",
          authorizationReference: p.source.authorizationStatement,
          preparationMetadata: sourceMetadata,
          importKey: p.importKey, status: "draft", createdBy: req.scholarlyUserId!,
        }).returning({ id: scholarlySourcesTable.id });
        for (let offset = 0; offset < p.passages.length; offset += 100) {
          await tx.insert(scholarlyPassagesTable).values(p.passages.slice(offset, offset + 100).map(
            ({ text, ...provenance }) => ({
              sourceId: source.id, text, volume: provenance.volume,
              printedPage: provenance.printedPage, pdfPage: provenance.pdfPage, indexed: false,
              sourceUrl: provenance.sourceUrl, viewerPage: provenance.viewerPage,
              preparationMetadata: provenance,
            }),
          ));
        }
        await tx.insert(scholarlyAuditTable).values({
          actorId: req.scholarlyUserId!, action: "prepared_source_imported",
          targetType: "source", targetId: source.id,
          reason: "Imported local unreviewed passages; user attestation preserved, no independent rights or scientific approval",
          details: { importKey: p.importKey, passageCount: p.passages.length, sourceUrl: p.source.sourceUrl },
        });
        return { sourceId: source.id, outcome: "imported" as const,
          totalCount: p.passages.length, importedCount: p.passages.length, existingCount: 0 };
      });
      if (!result) {
        res.status(409).json({ error: "توجد نسخة متعارضة أو استيراد سابق غير مكتمل؛ لم نضف مقاطع. راجع المصدر الموجود." });
        return;
      }
      res.json(ImportAljam3SourceResponse.parse(result));
    } catch (error) {
      req.log.warn({ errorType: error instanceof Error ? error.name : "UnknownError" }, "Prepared source import not confirmed");
      res.status(503).json({ error: "تعذّر تأكيد الاستيراد. أعد المحاولة بأمان؛ لن تتكرر الحزمة إذا كانت قد حُفظت." });
    }
  });

export default router;
