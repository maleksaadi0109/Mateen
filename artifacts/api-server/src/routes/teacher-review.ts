import { clerkClient, getAuth } from "@clerk/express";
import {
  CompleteQualificationUploadParams,
  CompleteQualificationUploadResponse,
  DecideTeacherApplicationBody,
  DecideTeacherApplicationParams,
  DecideTeacherApplicationResponse,
  DownloadQualificationDocumentParams,
  GetReviewAccessResponse,
  GetReviewAuditResponse,
  GetScholarsResponse,
  GetTeacherResponse,
  GetTeacherReviewsResponse,
  RemoveQualificationDocumentParams,
  RequestQualificationUploadBody,
  RequestQualificationUploadResponse,
  SaveTeacherBody,
  SaveTeacherResponse,
  SubmitTeacherApplicationBody,
  SubmitTeacherApplicationResponse,
} from "@workspace/api-zod";
import {
  db,
  profilesTable,
  qualificationDocumentsTable,
  reviewAuditTable,
  teacherApplicationsTable,
  teacherReviewsTable,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Router, type NextFunction, type Response } from "express";
import {
  discardQualificationObject,
  createQualificationUpload,
  QualificationRejectedError,
  streamQualificationObject,
  validateAndPromoteQualification,
} from "../lib/qualification-storage";
import { addReviewAudit } from "../lib/review-audit";
import {
  teacherProfileSaveTransition,
  type TeacherProfileStatus,
} from "../lib/teacher-review-policy";
import { hasTeacherPdfCertificate, isEligibleTeacherAccount } from "../lib/review-security-policy";
import {
  getReviewAccess,
  mutationProtection,
  requireReviewPermission,
  requireSecureTeacher,
  type ReviewRequest,
} from "../middlewares/review-security";

const router = Router();

function appError(res: Response, status: number, error: string) {
  res.status(status).json({ error });
}

class QualificationDocumentLimitError extends Error {}

async function loadTeacherApplication(userId: string) {
  const [[application], [review], documents, history] = await Promise.all([
    db
      .select()
      .from(teacherApplicationsTable)
      .where(eq(teacherApplicationsTable.userId, userId))
      .limit(1),
    db
      .select()
      .from(teacherReviewsTable)
      .where(eq(teacherReviewsTable.userId, userId))
      .limit(1),
    db
      .select()
      .from(qualificationDocumentsTable)
      .where(eq(qualificationDocumentsTable.userId, userId))
      .orderBy(desc(qualificationDocumentsTable.uploadedAt)),
    db
      .select()
      .from(reviewAuditTable)
      .where(
        and(
          eq(reviewAuditTable.targetId, userId),
          eq(reviewAuditTable.scope, "qualification"),
        ),
      )
      .orderBy(desc(reviewAuditTable.createdAt)),
  ]);
  const state = review ?? {
    status: "draft",
    revision: 0,
    reason: "",
    submittedAt: null,
  };
  return {
    biography: application?.biography ?? "",
    specialties: application?.specialties ?? "",
    available: state.status === "approved" && (application?.available ?? false),
    status: state.status,
    revision: state.revision,
    reason: state.reason || undefined,
    submittedAt: state.submittedAt?.toISOString() ?? null,
    documents: documents.map((doc) => ({
      id: doc.id,
      name: doc.name,
      kind: doc.kind,
      size: doc.size,
      contentType: doc.contentType,
      status: doc.status,
      uploadedAt: doc.uploadedAt.toISOString(),
    })),
    history: history.map((row) => ({
      id: row.id,
      actorId: row.actorId,
      action: row.action,
      targetId: row.targetId,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

function qualificationDocumentResponse(document: {
  id: string;
  name: string;
  kind: string;
  size: number;
  contentType: string;
  status: string;
  uploadedAt: Date;
}) {
  return CompleteQualificationUploadResponse.parse({
    id: document.id,
    name: document.name,
    kind: document.kind,
    size: document.size,
    contentType: document.contentType,
    status: document.status,
    uploadedAt: document.uploadedAt.toISOString(),
  });
}

async function makeDraft(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], userId: string) {
  await tx
    .insert(teacherReviewsTable)
    .values({ userId })
    .onConflictDoNothing({ target: teacherReviewsTable.userId });
  const [review] = await tx
    .select()
    .from(teacherReviewsTable)
    .where(eq(teacherReviewsTable.userId, userId))
    .for("update");
  return review;
}

router.get("/mateen/review-access", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(GetReviewAccessResponse.parse(await getReviewAccess(req)));
});

router.get(
  "/mateen/teacher",
  requireSecureTeacher,
  async (req: ReviewRequest, res) => {
    res.json(GetTeacherResponse.parse(await loadTeacherApplication(req.reviewUserId!)));
  },
);

router.put(
  "/mateen/teacher",
  mutationProtection,
  requireSecureTeacher,
  async (req: ReviewRequest, res) => {
    const parsed = SaveTeacherBody.strict().safeParse(req.body);
    if (!parsed.success) {
      appError(res, 400, "Invalid teacher application payload");
      return;
    }
    const userId = req.reviewUserId!;
    await db.transaction(async (tx) => {
      const current = await makeDraft(tx, userId);
      const [application] = await tx
        .select({
          biography: teacherApplicationsTable.biography,
          specialties: teacherApplicationsTable.specialties,
        })
        .from(teacherApplicationsTable)
        .where(eq(teacherApplicationsTable.userId, userId))
        .limit(1);
      const transition = teacherProfileSaveTransition(
        {
          status: current.status as TeacherProfileStatus,
          revision: current.revision,
          biography: application?.biography ?? "",
          specialties: application?.specialties ?? "",
          available: false,
        },
        parsed.data,
      );
      await tx
        .insert(teacherApplicationsTable)
        .values({
          userId,
          biography: parsed.data.biography,
          specialties: parsed.data.specialties,
          available: transition.available,
          status: transition.legacyStatus,
        })
        .onConflictDoUpdate({
          target: teacherApplicationsTable.userId,
          set: {
            biography: parsed.data.biography,
            specialties: parsed.data.specialties,
            available: transition.available,
            status: transition.legacyStatus,
          },
        });
      await tx
        .update(teacherReviewsTable)
        .set({
          status: transition.status,
          revision: transition.revision,
          reason: transition.preserveApproval ? current.reason : "",
          submittedAt: transition.preserveApproval ? current.submittedAt : null,
          updatedAt: new Date(),
        })
        .where(eq(teacherReviewsTable.userId, userId));
      await addReviewAudit(
        tx,
        userId,
        transition.preserveApproval
          ? "teacher_availability_updated"
          : "teacher_profile_updated",
        userId,
        transition.preserveApproval
          ? "Approved teacher changed availability"
          : "Teacher updated application profile",
      );
      if (transition.revokeApproval) {
        await addReviewAudit(tx, userId, "teacher_approval_revoked", userId, "Qualification profile changed; renewed review required");
      } else if (transition.invalidateSubmission) {
        await addReviewAudit(tx, userId, "teacher_submission_invalidated", userId, "Application changed; renewed submission required");
      }
    });
    res.json(SaveTeacherResponse.parse(await loadTeacherApplication(userId)));
  },
);

router.post(
  "/mateen/teacher/documents/upload",
  mutationProtection,
  requireSecureTeacher,
  async (req: ReviewRequest, res) => {
    const parsed = RequestQualificationUploadBody.strict().safeParse(req.body);
    if (!parsed.success) {
      appError(res, 400, "Invalid qualification upload request");
      return;
    }
    const userId = req.reviewUserId!;
    const existingDocuments = await db
      .select({ id: qualificationDocumentsTable.id })
      .from(qualificationDocumentsTable)
      .where(eq(qualificationDocumentsTable.userId, userId));
    if (existingDocuments.length >= 10) {
      appError(res, 422, "A teacher application can have at most 10 qualification documents");
      return;
    }
    const upload = await createQualificationUpload(userId);
    // createQualificationUpload allocates the same UUID used by the immutable object key.
    const id = upload.id;
    const metadata = parsed.data;
    try {
      await db.transaction(async (tx) => {
        const current = await makeDraft(tx, userId);
        const docs = await tx
          .select({ id: qualificationDocumentsTable.id })
          .from(qualificationDocumentsTable)
          .where(eq(qualificationDocumentsTable.userId, userId));
        if (docs.length >= 10) throw new QualificationDocumentLimitError();
        const priorStatus = current.status;
        const status = priorStatus === "approved" || priorStatus === "pending_review"
          ? "draft"
          : priorStatus;
        await tx.insert(qualificationDocumentsTable).values({
          id,
          userId,
          name: metadata.name,
          kind: metadata.kind,
          size: metadata.size,
          contentType: metadata.contentType,
          stagingObject: upload.stagingObject,
        });
        await tx
          .update(teacherReviewsTable)
          .set({
            status,
            revision: current.revision + 1,
            reason: "",
            submittedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(teacherReviewsTable.userId, userId));
        await tx
          .update(teacherApplicationsTable)
          .set({ available: false, status: "draft" })
          .where(eq(teacherApplicationsTable.userId, userId));
        await addReviewAudit(tx, userId, "teacher_document_upload_started", userId, "Qualification document upload started");
        if (priorStatus === "approved") {
          await addReviewAudit(tx, userId, "teacher_approval_revoked", userId, "Qualification documents changed; renewed review required");
        } else if (priorStatus === "pending_review") {
          await addReviewAudit(tx, userId, "teacher_submission_invalidated", userId, "Qualification documents changed; renewed submission required");
        }
      });
    } catch (error) {
      if (error instanceof QualificationDocumentLimitError) {
        appError(res, 422, "A teacher application can have at most 10 qualification documents");
        return;
      }
      throw error;
    }
    res.json(RequestQualificationUploadResponse.parse({ documentId: id, uploadURL: upload.uploadURL }));
  },
);

router.post(
  "/mateen/teacher/documents/:documentId/complete",
  mutationProtection,
  requireSecureTeacher,
  async (req: ReviewRequest, res) => {
    const params = CompleteQualificationUploadParams.safeParse(req.params);
    if (!params.success) {
      appError(res, 400, "Invalid qualification document");
      return;
    }
    const userId = req.reviewUserId!;
    const [document] = await db
      .select()
      .from(qualificationDocumentsTable)
      .where(
        and(
          eq(qualificationDocumentsTable.id, params.data.documentId),
          eq(qualificationDocumentsTable.userId, userId),
        ),
      )
      .limit(1);
    if (!document) {
      appError(res, 404, "Qualification document not found");
      return;
    }
    if (document.status === "clean") {
      res.json(qualificationDocumentResponse(document));
      return;
    }
    if (document.status !== "uploading") {
      appError(res, 409, "Qualification upload cannot be finalized");
      return;
    }
    let cleanObject: string;
    try {
      cleanObject = await validateAndPromoteQualification(
        userId,
        document.id,
        document.stagingObject,
        document.size,
        document.contentType,
      );
    } catch (error) {
      if (!(error instanceof QualificationRejectedError)) {
        appError(res, 503, "Document validation is temporarily unavailable; the upload remains retryable");
        return;
      }
      let rejectedThisRequest = false;
      await db.transaction(async (tx) => {
        const current = await makeDraft(tx, userId);
        const [rejected] = await tx
          .update(qualificationDocumentsTable)
          .set({ status: "rejected" })
          .where(
            and(
              eq(qualificationDocumentsTable.id, document.id),
              eq(qualificationDocumentsTable.userId, userId),
              eq(qualificationDocumentsTable.status, "uploading"),
            ),
          )
          .returning({ id: qualificationDocumentsTable.id });
        if (!rejected) return;
        rejectedThisRequest = true;
        const status =
          current.status === "pending_review" || current.status === "approved"
            ? "draft"
            : current.status;
        await tx
          .update(teacherReviewsTable)
          .set({
            status,
            revision: current.revision + 1,
            reason: status === "draft" ? "" : current.reason,
            submittedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(teacherReviewsTable.userId, userId));
        await tx
          .update(teacherApplicationsTable)
          .set({ available: false, status: "draft" })
          .where(eq(teacherApplicationsTable.userId, userId));
        await addReviewAudit(
          tx,
          userId,
          "teacher_document_rejected",
          userId,
          error instanceof Error && error.message.includes("Malware")
            ? "Document failed malware validation"
            : "Document failed file validation",
        );
      });
      const [currentDocument] = await db
        .select({ id: qualificationDocumentsTable.id })
        .from(qualificationDocumentsTable)
        .where(
          and(
            eq(qualificationDocumentsTable.id, document.id),
            eq(qualificationDocumentsTable.userId, userId),
          ),
        )
        .limit(1);
      if (currentDocument) {
        const [latest] = await db
          .select()
          .from(qualificationDocumentsTable)
          .where(eq(qualificationDocumentsTable.id, document.id))
          .limit(1);
        if (latest?.status === "clean") {
          res.json(qualificationDocumentResponse(latest));
          return;
        }
      }
      if (!rejectedThisRequest) {
        appError(res, 409, "Qualification upload was changed by another request");
        return;
      }
      let cleanupFailed = false;
      await discardQualificationObject(document.stagingObject).catch(() => {
        cleanupFailed = true;
      });
      if (cleanupFailed) {
        appError(res, 503, "Document validation failed and private storage cleanup is pending");
        return;
      }
      appError(res, 422, "Document failed security validation");
      return;
    }
    let finalized = false;
    await db.transaction(async (tx) => {
      const current = await makeDraft(tx, userId);
      const [updatedDocument] = await tx
        .update(qualificationDocumentsTable)
        .set({ status: "clean", cleanObject })
        .where(
          and(
            eq(qualificationDocumentsTable.id, document.id),
            eq(qualificationDocumentsTable.userId, userId),
            eq(qualificationDocumentsTable.status, "uploading"),
          ),
        )
        .returning({ id: qualificationDocumentsTable.id });
      if (!updatedDocument) return;
      finalized = true;
      const invalidated =
        current.status === "pending_review" || current.status === "approved";
      await tx
        .update(teacherReviewsTable)
        .set({
          status: invalidated ? "draft" : current.status,
          revision: current.revision + 1,
          reason: invalidated ? "" : current.reason,
          submittedAt: invalidated ? null : current.submittedAt,
          updatedAt: new Date(),
        })
        .where(eq(teacherReviewsTable.userId, userId));
      if (invalidated) {
        await tx
          .update(teacherApplicationsTable)
          .set({ available: false, status: "draft" })
          .where(eq(teacherApplicationsTable.userId, userId));
      }
      await addReviewAudit(tx, userId, "teacher_document_finalized", userId, "Qualification document passed security validation");
      if (current.status === "pending_review") {
        await addReviewAudit(tx, userId, "teacher_submission_invalidated", userId, "Qualification document finalized; renewed submission required");
      } else if (current.status === "approved") {
        await addReviewAudit(tx, userId, "teacher_approval_revoked", userId, "Qualification document finalized; renewed review required");
      }
    });
    if (!finalized) {
      const [currentDocument] = await db
        .select()
        .from(qualificationDocumentsTable)
        .where(eq(qualificationDocumentsTable.id, document.id))
        .limit(1);
      if (currentDocument?.status === "clean") {
        res.json(qualificationDocumentResponse(currentDocument));
        return;
      }
      if (currentDocument?.cleanObject !== cleanObject) {
        let cleanupFailed = false;
        await discardQualificationObject(cleanObject).catch(() => {
          cleanupFailed = true;
        });
        if (cleanupFailed) {
          appError(res, 503, "Private storage cleanup failed after a concurrent upload change");
          return;
        }
      }
      appError(res, 409, "Qualification upload was changed by another request");
      return;
    }
    const [updated] = await db
      .select()
      .from(qualificationDocumentsTable)
      .where(eq(qualificationDocumentsTable.id, document.id))
      .limit(1);
    res.json(qualificationDocumentResponse(updated));
  },
);

router.delete(
  "/mateen/teacher/documents/:documentId",
  mutationProtection,
  requireSecureTeacher,
  async (req: ReviewRequest, res) => {
    const params = RemoveQualificationDocumentParams.safeParse(req.params);
    if (!params.success) {
      appError(res, 400, "Invalid qualification document");
      return;
    }
    const userId = req.reviewUserId!;
    const [document] = await db
      .select()
      .from(qualificationDocumentsTable)
      .where(
        and(
          eq(qualificationDocumentsTable.id, params.data.documentId),
          eq(qualificationDocumentsTable.userId, userId),
        ),
      )
      .limit(1);
    if (!document) {
      appError(res, 404, "Qualification document not found");
      return;
    }
    try {
      for (const path of [document.cleanObject, document.stagingObject]) {
        if (path) await discardQualificationObject(path);
      }
    } catch {
      appError(res, 503, "Private document cleanup failed; document metadata was not changed");
      return;
    }
    await db.transaction(async (tx) => {
      const current = await makeDraft(tx, userId);
      await tx
        .delete(qualificationDocumentsTable)
        .where(eq(qualificationDocumentsTable.id, document.id));
      const status = current.status === "approved" || current.status === "pending_review"
        ? "draft"
        : current.status;
      await tx
        .update(teacherReviewsTable)
        .set({
          status,
          revision: current.revision + 1,
          reason: "",
          submittedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(teacherReviewsTable.userId, userId));
      await tx
        .update(teacherApplicationsTable)
        .set({ available: false, status: "draft" })
        .where(eq(teacherApplicationsTable.userId, userId));
      await addReviewAudit(tx, userId, "teacher_document_removed", userId, "Teacher removed qualification document");
      if (current.status === "approved") {
        await addReviewAudit(tx, userId, "teacher_approval_revoked", userId, "Qualification documents changed; renewed review required");
      } else if (current.status === "pending_review") {
        await addReviewAudit(tx, userId, "teacher_submission_invalidated", userId, "Qualification documents changed; renewed submission required");
      }
    });
    res.status(204).end();
  },
);

type QualificationDownloadRequest = ReviewRequest & {
  qualificationDocument?: typeof qualificationDocumentsTable.$inferSelect;
};

function authorizeQualificationDownload(
  req: QualificationDownloadRequest,
  res: Response,
  next: NextFunction,
) {
  void (async () => {
    const userId = getAuth(req).userId;
    if (!userId) {
      appError(res, 401, "Authentication is required");
      return;
    }
  const params = DownloadQualificationDocumentParams.safeParse(req.params);
    if (!params.success) {
      appError(res, 400, "Invalid qualification document");
      return;
    }
  const [document] = await db
    .select()
    .from(qualificationDocumentsTable)
    .where(
      and(
        eq(qualificationDocumentsTable.id, params.data.documentId),
        eq(qualificationDocumentsTable.status, "clean"),
      ),
    )
    .limit(1);
    if (!document?.cleanObject) {
      appError(res, 404, "Qualification document not found");
      return;
    }
    const authorizedNext = () => {
      req.qualificationDocument = document;
      next();
    };
    if (document.userId === userId) {
      requireSecureTeacher(req, res, authorizedNext);
    } else {
      requireReviewPermission("qualification")(req, res, authorizedNext);
    }
  })().catch(() => {
    appError(res, 503, "Document access could not be authorized");
  });
}

router.get(
  "/mateen/documents/:documentId/download",
  authorizeQualificationDownload,
  async (req: ReviewRequest, res) => {
    const request = req as QualificationDownloadRequest;
    const document = request.qualificationDocument;
    if (!document?.cleanObject) {
      appError(res, 404, "Qualification document not found");
      return;
    }
    try {
      const stream = await streamQualificationObject(document.cleanObject);
      if (request.reviewUserId !== document.userId) {
        await db.transaction(async (tx) => {
          await addReviewAudit(
            tx,
            request.reviewUserId!,
            "teacher_document_downloaded",
            document.userId,
            "Qualification reviewer accessed a private teacher document",
          );
        });
      }
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="qualification-document"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      stream.on("error", () => {
        if (!res.headersSent) appError(res, 503, "Private document download failed");
        else res.destroy();
      });
      stream.pipe(res);
    } catch {
      appError(res, 404, "Qualification document is unavailable");
    }
  },
);

router.post(
  "/mateen/teacher/submit",
  mutationProtection,
  requireSecureTeacher,
  async (req: ReviewRequest, res) => {
    const parsed = SubmitTeacherApplicationBody.strict().safeParse(req.body);
    if (!parsed.success) {
      appError(res, 400, "Invalid submission revision");
      return;
    }
    const userId = req.reviewUserId!;
    let conflict = false;
    await db.transaction(async (tx) => {
      const current = await makeDraft(tx, userId);
      if (current.revision !== parsed.data.revision) {
        conflict = true;
        return;
      }
      if (current.status === "pending_review") {
        conflict = true;
        return;
      }
      const [application] = await tx
        .select()
        .from(teacherApplicationsTable)
        .where(eq(teacherApplicationsTable.userId, userId))
        .limit(1);
      const documents = await tx
        .select({ status: qualificationDocumentsTable.status, contentType: qualificationDocumentsTable.contentType })
        .from(qualificationDocumentsTable)
        .where(
          and(
            eq(qualificationDocumentsTable.userId, userId),
            eq(qualificationDocumentsTable.status, "clean"),
          ),
        );
      if (!application || !hasTeacherPdfCertificate(documents)) {
        conflict = true;
        return;
      }
      await tx
        .update(teacherReviewsTable)
        .set({
          status: "pending_review",
          revision: current.revision + 1,
          reason: "",
          submittedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(teacherReviewsTable.userId, userId));
      await tx
        .update(teacherApplicationsTable)
        .set({ status: "pending_review", available: false })
        .where(eq(teacherApplicationsTable.userId, userId));
      await addReviewAudit(tx, userId, "teacher_application_submitted", userId, "Teacher submitted application for review");
    });
    if (conflict) {
      appError(res, 409, "Application revision changed or the application is not ready for submission");
      return;
    }
    res.json(SubmitTeacherApplicationResponse.parse(await loadTeacherApplication(userId)));
  },
);

router.get(
  "/mateen/admin/teachers",
  requireReviewPermission("qualification"),
  async (_req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const reviews = await db
      .select({
        userId: teacherReviewsTable.userId,
        status: teacherReviewsTable.status,
        revision: teacherReviewsTable.revision,
      })
      .from(teacherReviewsTable)
      .where(inArray(teacherReviewsTable.status, ["pending_review", "needs_information", "rejected", "approved"]))
      .orderBy(desc(teacherReviewsTable.submittedAt));
    const result = [];
    for (const review of reviews) {
      const [profile] = await db
        .select()
        .from(profilesTable)
        .where(eq(profilesTable.clerkId, review.userId))
        .limit(1);
      if (!profile) continue;
      const application = await loadTeacherApplication(review.userId);
      result.push({ ...application, userId: review.userId, name: profile.name });
    }
    res.json(GetTeacherReviewsResponse.parse(result));
  },
);

router.post(
  "/mateen/admin/teachers/:userId/decision",
  mutationProtection,
  requireReviewPermission("qualification"),
  async (req: ReviewRequest, res) => {
    const params = DecideTeacherApplicationParams.safeParse(req.params);
    const parsed = DecideTeacherApplicationBody.strict().safeParse(req.body);
    if (!params.success || !parsed.success || parsed.data.reason.trim().length < 5) {
      appError(res, 400, "Invalid teacher review decision");
      return;
    }
    if (params.data.userId === req.reviewUserId) {
      appError(res, 403, "Reviewers cannot review their own teacher application");
      return;
    }
    let conflict = false;
    let targetSecurityUnavailable = false;
    let targetNotEligible = false;
    let certificateMissing = false;
    let targetProfile: { name: string } | undefined;
    await db.transaction(async (tx) => {
      const current = await makeDraft(tx, params.data.userId);
      if (
        current.revision !== parsed.data.revision ||
        current.status !== "pending_review"
      ) {
        conflict = true;
        return;
      }
      const [profile] = await tx
        .select({ name: profilesTable.name, role: profilesTable.role })
        .from(profilesTable)
        .where(eq(profilesTable.clerkId, params.data.userId))
        .limit(1);
      if (!profile) {
        conflict = true;
        return;
      }
      if (parsed.data.decision === "approved") {
        const documents = await tx.select({
          status: qualificationDocumentsTable.status,
          contentType: qualificationDocumentsTable.contentType,
        }).from(qualificationDocumentsTable).where(eq(qualificationDocumentsTable.userId, params.data.userId));
        if (!hasTeacherPdfCertificate(documents)) {
          certificateMissing = true;
          return;
        }
        if (profile.role !== "teacher") {
          targetNotEligible = true;
          return;
        }
        let targetAccount;
        try {
          targetAccount = await clerkClient.users.getUser(params.data.userId);
        } catch {
          targetSecurityUnavailable = true;
          return;
        }
        const primaryEmail = targetAccount.emailAddresses.find(
          (email) => email.id === targetAccount.primaryEmailAddressId,
        );
        const verifiedEmail =
          (primaryEmail?.verification as { status?: string } | undefined)?.status ===
          "verified";
        if (
          !isEligibleTeacherAccount({
            banned: targetAccount.banned,
            locked: targetAccount.locked,
            verifiedEmail,
            mfaEnabled: targetAccount.twoFactorEnabled,
          })
        ) {
          targetNotEligible = true;
          return;
        }
      }
      targetProfile = profile;
      const decisionStatus = parsed.data.decision;
      await tx
        .update(teacherReviewsTable)
        .set({
          status: decisionStatus,
          revision: current.revision + 1,
          reason: parsed.data.reason,
          updatedAt: new Date(),
        })
        .where(eq(teacherReviewsTable.userId, params.data.userId));
      await tx
        .update(teacherApplicationsTable)
        .set({
          status: decisionStatus === "approved" ? "approved" : "draft",
          available: decisionStatus === "approved",
        })
        .where(eq(teacherApplicationsTable.userId, params.data.userId));
      await addReviewAudit(
        tx,
        req.reviewUserId!,
        `teacher_${decisionStatus}`,
        params.data.userId,
        parsed.data.reason,
      );
    });
    if (targetSecurityUnavailable) {
      appError(res, 503, "Teacher account security could not be verified");
      return;
    }
    if (certificateMissing) {
      appError(res, 422, "A security-checked PDF certificate is required before approval");
      return;
    }
    if (targetNotEligible) {
      appError(
        res,
        409,
        "Teacher must have an active teacher account and verified email before approval",
      );
      return;
    }
    if (conflict || !targetProfile) {
      appError(res, 409, "Teacher application revision changed or is not pending review");
      return;
    }
    const application = await loadTeacherApplication(params.data.userId);
    res.json(
      DecideTeacherApplicationResponse.parse({
        ...application,
        userId: params.data.userId,
        name: targetProfile.name,
      }),
    );
  },
);

router.get("/mateen/admin/audit", async (req, res) => {
  if (!getAuth(req).userId) {
    appError(res, 401, "Authentication is required");
    return;
  }
  const access = await getReviewAccess(req);
  if (!access.verifiedEmail) {
    appError(res, 403, "A verified email is required for administrative review");
    return;
  }
  if (!access.contentReviewer && !access.qualificationReviewer) {
    appError(res, 403, "A review permission is required");
    return;
  }
  const scopes = [
    ...(access.contentReviewer ? ["content"] : []),
    ...(access.qualificationReviewer ? ["qualification"] : []),
  ];
  const rows = await db
    .select()
    .from(reviewAuditTable)
    .where(inArray(reviewAuditTable.scope, scopes))
    .orderBy(desc(reviewAuditTable.createdAt))
    .limit(500);
  res.json(
    GetReviewAuditResponse.parse(
      rows.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        action: row.action,
        targetId: row.targetId,
        reason: row.reason,
        createdAt: row.createdAt.toISOString(),
      })),
    ),
  );
});

router.get("/mateen/scholars", async (_req, res) => {
  const teachers = await db
    .select({
      id: profilesTable.clerkId,
      name: profilesTable.name,
      biography: teacherApplicationsTable.biography,
      specialties: teacherApplicationsTable.specialties,
      available: teacherApplicationsTable.available,
    })
    .from(teacherReviewsTable)
    .innerJoin(
      teacherApplicationsTable,
      eq(teacherReviewsTable.userId, teacherApplicationsTable.userId),
    )
    .innerJoin(profilesTable, eq(teacherReviewsTable.userId, profilesTable.clerkId))
    .where(
      and(
        eq(teacherReviewsTable.status, "approved"),
        eq(teacherApplicationsTable.status, "approved"),
        eq(profilesTable.role, "teacher"),
      ),
    );
  const liveTeachers = [];
  for (const teacher of teachers) {
    try {
      const user = await clerkClient.users.getUser(teacher.id);
      const primaryEmail = user.emailAddresses.find(
        (email) => email.id === user.primaryEmailAddressId,
      );
      const verified =
        (primaryEmail?.verification as { status?: string } | undefined)?.status ===
        "verified";
      if (!user.banned && !user.locked && user.twoFactorEnabled && verified) {
        liveTeachers.push(teacher);
      }
    } catch {
      // A live account status cannot be verified, so it is not publicly listed.
    }
  }
  res.json(GetScholarsResponse.parse(liveTeachers));
});

export default router;