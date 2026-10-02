import { db, reviewAuditTable } from "@workspace/db";

type AuditTransaction = Pick<typeof db, "insert">;

export async function addReviewAudit(
  tx: AuditTransaction,
  actorId: string,
  action: string,
  targetId: string,
  reason: string,
) {
  const scope = action.toLowerCase().startsWith("source") ||
    action.toLowerCase().startsWith("content")
    ? "content"
    : "qualification";
  const [row] = await tx
    .insert(reviewAuditTable)
    .values({
      id: crypto.randomUUID(),
      actorId,
      action,
      targetId,
      reason,
      scope,
    })
    .returning();
  return row;
}