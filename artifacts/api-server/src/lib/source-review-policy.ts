import { z } from "zod/v4";

export const sourceVersionInputSchema = z
  .object({
    hadithNumber: z.number().int().min(1).max(42),
    text: z.string().min(10).max(12_000),
    printedPage: z.number().int().min(1),
    viewerPage: z.number().int().min(1),
    viewerUrl: z.string().url().max(1000).refine(isHttpUrl, {
      message: "The viewer URL must use HTTP(S).",
    }),
    edition: z.string().min(3).max(1000),
    changeReason: z.string().min(5).max(2000),
    rightsEvidence: z.string().max(4000),
    rightsUrl: z.string().max(1000),
  })
  .strict();

export const sourceDecisionSchema = z
  .object({
    decision: z.enum(["approved", "rejected", "withdrawn"]),
    scientificStatus: z.enum(["approved", "rejected", "pending"]),
    rightsStatus: z.enum(["cleared", "rejected", "pending"]),
    reason: z.string().trim().min(5).max(2000),
  })
  .strict();

export type SourceVersionInput = z.infer<typeof sourceVersionInputSchema>;
export type SourceDecision = z.infer<typeof sourceDecisionSchema>;

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function normalizeText(value: string): string {
  return value.normalize("NFC").trim();
}

export function validateApprovalEvidence(
  input: SourceVersionInput,
  decision: SourceDecision,
  creatorId: string,
  actorId: string,
): string | null {
  const edition = input.edition.trim();
  const text = normalizeText(input.text);
  if (decision.scientificStatus === "approved") {
    if (
      edition.length < 6 ||
      /unknown|unverified|not verified|tbd|placeholder|n\/a|غير محدد|غير معينة|غير متوفرة|طبعة مجهولة|قيد التحقق|غير محققة/i.test(
        edition,
      )
    ) {
      return "Scientific approval requires a verified, non-placeholder edition identification.";
    }
    const attestation = decision.reason.trim();
    if (
      attestation.length < 50 ||
      !/(compare|compared|verified|checked|مطابق|قابل|قوبل|تحقق|راجعت|استبعاد|استبعد)/i.test(attestation) ||
      !/(editorial|commentary|prose|editor|ترجمة|شرح|تعليق|تحريري|كلام المحقق|النص)/i.test(attestation)
    ) {
      return "Scientific approval must document comparison to the identified edition and exclusion of editorial prose or commentary.";
    }
    if (!text || input.printedPage < 1 || input.viewerPage < 1) {
      return "Scientific approval requires the exact text and distinct printed and viewer page references.";
    }
  }
  if (decision.rightsStatus === "cleared") {
    if (actorId === creatorId) {
      return "A source creator cannot clear rights for their own version.";
    }
    if (
      input.rightsEvidence.trim().length < 30 ||
      !isHttpUrl(input.rightsUrl) ||
      !/(license|licence|permission|permitted|reuse|reusable|ترخيص|رخصة|إذن|مأذون|إعادة الاستخدام|إعادة نشر)/i.test(input.rightsEvidence)
    ) {
      return "Rights clearance requires documented reusable-license or permission evidence and an HTTP(S) evidence URL.";
    }
  }
  if (decision.decision !== "approved") return null;
  if (decision.scientificStatus !== "approved") {
    return "Approval requires a scientific approval decision.";
  }
  if (decision.rightsStatus !== "cleared") {
    return "Approval requires an independent rights clearance.";
  }
  return null;
}

export function isEligibleContentReviewer(access: {
  contentReviewer: boolean;
  verifiedEmail: boolean;
  mfaEnabled: boolean;
  secureSession: boolean;
}): boolean {
  return (
    access.contentReviewer &&
    access.verifiedEmail &&
    access.mfaEnabled &&
    access.secureSession
  );
}

export function canUseForGrading(version: {
  status: string;
  scientificStatus: string;
  rightsStatus: string;
  payloadHash: string;
}): boolean {
  return (
    version.status === "approved" &&
    version.scientificStatus === "approved" &&
    version.rightsStatus === "cleared" &&
    /^[a-f0-9]{64}$/.test(version.payloadHash)
  );
}