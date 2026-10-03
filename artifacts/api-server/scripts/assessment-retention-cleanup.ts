import { cleanupExpiredAssessmentAudio } from "../src/lib/assessment-retention";
import { pool } from "@workspace/db";

try {
  const removed = await cleanupExpiredAssessmentAudio();
  process.stdout.write(`Deleted ${removed} expired assessment audio object(s).\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Assessment retention cleanup failed."}\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}