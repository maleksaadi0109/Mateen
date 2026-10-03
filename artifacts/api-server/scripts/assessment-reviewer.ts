import { clerkClient } from "@clerk/express";
import { assessmentReviewerGrantsTable, db, pool } from "@workspace/db";

const [operation, clerkId, confirmation, ...extra] = process.argv.slice(2);
const operatorLabel = process.env.ASSESSMENT_REVIEWER_OPERATOR_LABEL?.trim();

async function main() {
  if (
    (operation !== "grant" && operation !== "revoke") ||
    !clerkId ||
    !/^user_[A-Za-z0-9_-]{3,128}$/.test(clerkId) ||
    confirmation !== "--confirm" ||
    extra.length > 0 ||
    !operatorLabel ||
    operatorLabel.length < 2 ||
    operatorLabel.length > 100
  ) {
    throw new Error(
      "Usage: assessment-reviewer (grant|revoke) user_CLERK_ID --confirm with ASSESSMENT_REVIEWER_OPERATOR_LABEL set.",
    );
  }

  // A Clerk lookup validates identity existence; the operator must still run
  // this explicit command and confirm the exact target.
  // Revocation must remain possible even if the identity was deleted in Clerk.
  if (operation === "grant") await clerkClient.users.getUser(clerkId);
  await db
    .insert(assessmentReviewerGrantsTable)
    .values({
      clerkId,
      enabled: operation === "grant",
      changedAt: new Date(),
      operatorLabel,
    })
    .onConflictDoUpdate({
      target: assessmentReviewerGrantsTable.clerkId,
      set: {
        enabled: operation === "grant",
        changedAt: new Date(),
        operatorLabel,
      },
    });
  process.stdout.write(`${operation} recorded for ${clerkId} by ${operatorLabel}.\n`);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Reviewer grant operation failed."}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });