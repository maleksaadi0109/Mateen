import { constants as fsConstants, createWriteStream } from "node:fs";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { and, eq, gt, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import { db, practiceRecitationsTable } from "@workspace/db";
import { getRecitationRuntimePaths } from "./recitation-readiness";
import { SingleWorkerQueue } from "./recitation-queue";
import { logger } from "./logger";
import {
  MAX_AUDIO_BYTES,
  MAX_CONCURRENT_QUEUE,
  canonicalizeContentType,
  getStorageFile,
  normalizeRuntimeResult,
  referenceByNumber,
  removeRemoteAudio,
} from "./recitation-service";

const queue = new SingleWorkerQueue(MAX_CONCURRENT_QUEUE);
const runningChildren = new Map<string, ChildProcess>();

async function findFfmpeg(): Promise<string | null> {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, "ffmpeg");
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Continue searching trusted PATH entries.
    }
  }
  return null;
}

function killWorkerProcessTree(child: ChildProcess | undefined): void {
  if (!child) return;
  try {
    if (child.pid) process.kill(-child.pid, "SIGKILL");
    else child.kill("SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

async function downloadBounded(storagePath: string, outputPath: string) {
  const file = await getStorageFile(storagePath);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size);
  const contentType =
    typeof metadata.contentType === "string"
      ? canonicalizeContentType(metadata.contentType)
      : null;
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_AUDIO_BYTES) {
    throw new Error("Uploaded audio size is outside the permitted limit.");
  }
  if (!contentType) {
    throw new Error("Uploaded audio media type is not supported.");
  }

  let transferred = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      transferred += chunk.length;
      if (transferred > MAX_AUDIO_BYTES) {
        callback(new Error("Uploaded audio exceeds the permitted limit."));
        return;
      }
      callback(null, chunk);
    },
  });
  const source = file.createReadStream();
  const timeout = setTimeout(
    () => source.destroy(new Error("Audio download timed out.")),
    30_000,
  );
  try {
    await pipeline(
      source,
      limiter,
      createWriteStream(outputPath, { mode: 0o600, flags: "wx" }),
    );
    if (transferred !== size) {
      throw new Error("Uploaded audio size changed during download.");
    }
    return { size, contentType };
  } finally {
    clearTimeout(timeout);
  }
}

function runLocalAnalysis(
  id: string,
  audioPath: string,
  referencePath: string,
): Promise<string> {
  const paths = getRecitationRuntimePaths();
  const ffmpegPromise = findFfmpeg();
  return new Promise(async (resolve, reject) => {
    const ffmpeg = await ffmpegPromise;
    if (!ffmpeg) {
      reject(new Error("Local recitation runtime is not ready."));
      return;
    }
    const child = spawn(
      paths.python,
      [
        paths.runtimeScript,
        "--audio",
        audioPath,
        "--reference-file",
        referencePath,
      ],
      {
        shell: false,
        detached: true,
        cwd: paths.root,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: paths.runtimeDir,
          PYTHONNOUSERSITE: "1",
          PYTHONDONTWRITEBYTECODE: "1",
          HF_HUB_OFFLINE: "1",
          TRANSFORMERS_OFFLINE: "1",
          HF_HOME: path.join(paths.root, ".cache", "huggingface"),
          RECITATION_MODEL_DIR: paths.modelDir,
          RECITATION_FFMPEG: ffmpeg,
          NO_PROXY: "*",
          no_proxy: "*",
        },
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    runningChildren.set(id, child);
    let stdout = "";
    let outputBytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      killWorkerProcessTree(child);
      finish(new Error("Local analysis exceeded the three-minute time limit."));
    }, 180_000);
    const finish = (error: Error | null, value?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      runningChildren.delete(id);
      if (error) reject(error);
      else resolve(value ?? "");
    };
    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > 1024 * 1024) {
        killWorkerProcessTree(child);
        finish(new Error("Local analysis returned an oversized response."));
        return;
      }
      stdout += chunk.toString("utf8");
    });
    child.on("error", () => finish(new Error("Local analysis could not start.")));
    child.on("close", (code) => {
      if (code !== 0) finish(new Error("Local analysis failed."));
      else finish(null, stdout);
    });
  });
}

async function setExplicitFailure(id: string, reason: string) {
  await db
    .update(practiceRecitationsTable)
    .set({
      status: "error",
      error: reason.slice(0, 300),
      result: null,
    })
    .where(
      and(
        eq(practiceRecitationsTable.id, id),
        eq(practiceRecitationsTable.status, "processing"),
      ),
    );
}

async function processRecitation(id: string): Promise<void> {
  const paths = getRecitationRuntimePaths();
  const tmpDir = path.join(paths.tmpRoot, id);
  let storagePath: string | null = null;
  try {
    await mkdir(paths.tmpRoot, { recursive: true, mode: 0o700 });
    await mkdir(tmpDir, { recursive: true, mode: 0o700 });
    const [row] = await db
      .select()
      .from(practiceRecitationsTable)
      .where(
        and(
          eq(practiceRecitationsTable.id, id),
          eq(practiceRecitationsTable.status, "processing"),
        ),
      )
      .limit(1);
    if (!row || !row.storagePath || row.expiresAt.getTime() <= Date.now()) {
      return;
    }
    storagePath = row.storagePath;
    const referenceText = referenceByNumber.get(row.hadithNumber);
    if (!referenceText) throw new Error("Reference text is unavailable.");

    const audioPath = path.join(tmpDir, "audio.input");
    const referencePath = path.join(tmpDir, "reference.json");
    await writeFile(referencePath, JSON.stringify({ text: referenceText }), {
      mode: 0o600,
      flag: "wx",
    });
    const uploaded = await downloadBounded(storagePath, audioPath);
    if (
      uploaded.size !== row.expectedSizeBytes ||
      uploaded.contentType !== row.expectedContentType
    ) {
      throw new Error("Uploaded audio does not match its declared metadata.");
    }
    const [stillProcessing] = await db
      .select({ id: practiceRecitationsTable.id })
      .from(practiceRecitationsTable)
      .where(
        and(
          eq(practiceRecitationsTable.id, id),
          eq(practiceRecitationsTable.status, "processing"),
        ),
      )
      .limit(1);
    if (!stillProcessing) return;

    const stdout = await runLocalAnalysis(id, audioPath, referencePath);
    let rawResult: unknown;
    try {
      rawResult = JSON.parse(stdout);
    } catch {
      throw new Error("Local analysis returned an invalid response.");
    }
    const result = normalizeRuntimeResult(rawResult);
    if (
      result.referenceText !== referenceText ||
      result.provisional !== true ||
      result.assessment !== false ||
      result.alignment.approvedForAssessment !== false ||
      result.alignment.studentScore !== null ||
      result.alignment.wordErrorRate !== null ||
      result.alignment.spans.some((span) => span.confirmedLearnerError !== false)
    ) {
      throw new Error("Local analysis result failed safety validation.");
    }
    await db
      .update(practiceRecitationsTable)
      .set({
        status: "completed",
        result,
        error: null,
      })
      .where(
        and(
          eq(practiceRecitationsTable.id, id),
          eq(practiceRecitationsTable.status, "processing"),
          gt(practiceRecitationsTable.expiresAt, new Date()),
        ),
      );
  } catch (error) {
    const safeMessages = new Set([
      "Uploaded audio size is outside the permitted limit.",
      "Uploaded audio media type is not supported.",
      "Uploaded audio exceeds the permitted limit.",
      "Audio download timed out.",
      "Uploaded audio size changed during download.",
      "Uploaded audio does not match its declared metadata.",
      "Reference text is unavailable.",
      "Local recitation runtime is not ready.",
      "Local analysis exceeded the three-minute time limit.",
      "Local analysis returned an oversized response.",
      "Local analysis could not start.",
      "Local analysis failed.",
      "Local analysis returned an invalid response.",
      "Local analysis result did not match the required contract.",
      "Local analysis returned an empty result.",
      "Local analysis result failed safety validation.",
    ]);
    const reason =
      error instanceof Error && safeMessages.has(error.message)
        ? error.message
        : "Local analysis failed; no assessment result was produced.";
    await setExplicitFailure(id, reason);
  } finally {
    killWorkerProcessTree(runningChildren.get(id));
    let audioWasDeleted = false;
    try {
      await removeRemoteAudio(storagePath);
      audioWasDeleted = true;
    } catch {
      logger.error({ stage: "processing_cleanup" }, "Recitation audio cleanup deferred.");
    }
    if (audioWasDeleted) {
      await db
        .update(practiceRecitationsTable)
        .set({ audioDeleted: true })
        .where(
          and(
            eq(practiceRecitationsTable.id, id),
            inArray(practiceRecitationsTable.status, ["completed", "error", "deleted"]),
          ),
        );
    }
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function hasRecitationQueueCapacity(): boolean {
  return queue.canAccept();
}

export function enqueueRecitationAnalysis(id: string): boolean {
  return queue.enqueue(id, async () => {
    try {
      await processRecitation(id);
    } catch {
      logger.error({ stage: "analysis_worker" }, "Recitation analysis worker failed.");
    }
  });
}

export function cancelRecitationWorker(id: string): void {
  queue.cancelPending(id);
  killWorkerProcessTree(runningChildren.get(id));
}

export async function expireRecitationRecord(id: string): Promise<void> {
  const now = new Date();
  const [expired] = await db
    .update(practiceRecitationsTable)
    .set({ status: "deleted", result: null, error: null })
    .where(
      and(
        eq(practiceRecitationsTable.id, id),
        or(
          and(
            eq(practiceRecitationsTable.status, "uploading"),
            lte(practiceRecitationsTable.uploadExpiresAt, now),
          ),
          and(
            inArray(practiceRecitationsTable.status, [
              "processing",
              "completed",
              "error",
            ]),
            lte(practiceRecitationsTable.expiresAt, now),
          ),
        ),
      ),
    )
    .returning();
  if (!expired) return;
  cancelRecitationWorker(id);
  try {
    await removeRemoteAudio(expired.storagePath);
    await db
      .update(practiceRecitationsTable)
      .set({ audioDeleted: true })
      .where(eq(practiceRecitationsTable.id, id));
  } catch {
    logger.error({ stage: "retention_cleanup" }, "Recitation audio cleanup deferred.");
  }
}

async function cleanupExpired(): Promise<void> {
  const now = new Date();
  const expired = await db
    .select()
    .from(practiceRecitationsTable)
    .where(
      and(
        or(
          and(
            eq(practiceRecitationsTable.status, "uploading"),
            lte(practiceRecitationsTable.uploadExpiresAt, now),
          ),
          and(
            inArray(practiceRecitationsTable.status, [
              "processing",
              "completed",
              "error",
            ]),
            lte(practiceRecitationsTable.expiresAt, now),
          ),
        ),
      ),
    )
    .limit(100);
  for (const row of expired) {
    await expireRecitationRecord(row.id);
  }

  const tombstones = await db
    .select()
    .from(practiceRecitationsTable)
    .where(
      and(
        eq(practiceRecitationsTable.status, "deleted"),
        lte(
          practiceRecitationsTable.uploadExpiresAt,
          new Date(Date.now() - 60_000),
        ),
        isNotNull(practiceRecitationsTable.storagePath),
      ),
    )
    .limit(100);
  for (const row of tombstones) {
    try {
      await removeRemoteAudio(row.storagePath);
      await db
        .update(practiceRecitationsTable)
        .set({ storagePath: sql`NULL`, audioDeleted: true, result: null, error: null })
        .where(eq(practiceRecitationsTable.id, row.id));
    } catch {
      logger.error({ stage: "signed_url_replay_cleanup" }, "Recitation replay cleanup deferred.");
    }
  }

  const audioPending = await db
    .select()
    .from(practiceRecitationsTable)
    .where(
      and(
        eq(practiceRecitationsTable.audioDeleted, false),
        inArray(practiceRecitationsTable.status, ["completed", "error", "deleted"]),
      ),
    )
    .limit(100);
  for (const row of audioPending) {
    try {
      await removeRemoteAudio(row.storagePath);
      await db
        .update(practiceRecitationsTable)
        .set({ storagePath: sql`NULL`, audioDeleted: true })
        .where(eq(practiceRecitationsTable.id, row.id));
    } catch {
      logger.error({ stage: "audio_cleanup_retry" }, "Recitation audio cleanup deferred.");
    }
  }
}

async function recoverInterruptedJobs(): Promise<void> {
  const interrupted = await db
    .select()
    .from(practiceRecitationsTable)
    .where(eq(practiceRecitationsTable.status, "processing"));
  for (const row of interrupted) {
    await db
      .update(practiceRecitationsTable)
      .set({
        status: "error",
        error: "Local analysis was interrupted by a server restart; no result was produced.",
        result: null,
      })
      .where(
        and(
          eq(practiceRecitationsTable.id, row.id),
          eq(practiceRecitationsTable.status, "processing"),
        ),
      );
    try {
      await removeRemoteAudio(row.storagePath);
      await db
        .update(practiceRecitationsTable)
        .set({ audioDeleted: true })
        .where(eq(practiceRecitationsTable.id, row.id));
    } catch {
      logger.error({ stage: "restart_recovery" }, "Interrupted recitation audio cleanup deferred.");
    }
  }
}

void recoverInterruptedJobs()
  .then(cleanupExpired)
  .catch(() => {
    logger.error({ stage: "startup_recovery" }, "Recitation startup recovery failed.");
  });
const cleanupTimer = setInterval(() => {
  void cleanupExpired().catch(() => {
    logger.error({ stage: "retention_sweeper" }, "Recitation retention sweep failed.");
  });
}, 60_000);
cleanupTimer.unref();