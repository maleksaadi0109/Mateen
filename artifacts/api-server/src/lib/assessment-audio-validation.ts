import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, lstat, mkdtemp, mkdir, realpath, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  AUDIO_FROZEN_WRITE_DEADLINE_MS,
  AUDIO_MAX_BYTES,
  AUDIO_MAX_DURATION_SECONDS,
} from "./assessment-policy";
import { getRecitationRuntimePaths } from "./recitation-readiness";
import { canonicalizeContentType } from "./recitation-service";
import { getStorageFile } from "./recitation-service";

const DOWNLOAD_DEADLINE_MS = 15_000;
const DECODER_DEADLINE_MS = 45_000;

function uploadEntityParts(uploadStoragePath: string) {
  if (!uploadStoragePath.startsWith("/objects/")) {
    throw new Error("The private upload could not be frozen.");
  }
  const uploadEntityPath = uploadStoragePath.slice("/objects/".length);
  const uploadMarker = "uploads/";
  const uploadMarkerIndex = uploadEntityPath.lastIndexOf(uploadMarker);
  if (uploadMarkerIndex < 0 || !uploadEntityPath.slice(uploadMarkerIndex + uploadMarker.length)) {
    throw new Error("The private upload could not be frozen.");
  }
  return { uploadEntityPath, uploadMarkerIndex };
}

export function createFrozenAssessmentStoragePath(
  uploadStoragePath: string,
  createId: () => string = randomUUID,
): string {
  const { uploadEntityPath, uploadMarkerIndex } = uploadEntityParts(uploadStoragePath);
  const frozenEntityPath = `${uploadEntityPath.slice(0, uploadMarkerIndex)}assessment-audio/frozen/${createId()}`;
  return `/objects/${frozenEntityPath}`;
}

export async function freezeValidatedAssessmentAudio(
  audioPath: string,
  uploadStoragePath: string,
  frozenStoragePath: string,
  contentType: string,
  uploadFile: Awaited<ReturnType<typeof getStorageFile>>,
  claimWriteLease: () => Promise<void>,
  signal?: AbortSignal,
): Promise<string> {
  const { uploadEntityPath } = uploadEntityParts(uploadStoragePath);
  if (!uploadFile.name.endsWith(uploadEntityPath)) {
    throw new Error("The private upload could not be frozen.");
  }
  const storagePrefix = uploadFile.name.slice(0, uploadFile.name.length - uploadEntityPath.length);
  const frozenEntityPath = frozenStoragePath.startsWith("/objects/")
    ? frozenStoragePath.slice("/objects/".length)
    : "";
  const expectedFrozenEntityPrefix = uploadEntityPath.slice(
    0,
    uploadEntityPath.lastIndexOf("uploads/"),
  );
  if (
    !frozenEntityPath.startsWith(`${expectedFrozenEntityPrefix}assessment-audio/frozen/`) ||
    !frozenEntityPath.slice(`${expectedFrozenEntityPrefix}assessment-audio/frozen/`.length)
  ) {
    throw new Error("The reserved private recording path is invalid.");
  }
  const frozenFile = uploadFile.bucket.file(`${storagePrefix}${frozenEntityPath}`);
  const writeController = new AbortController();
  const abortWrite = () => writeController.abort();
  const writeTimer = setTimeout(abortWrite, AUDIO_FROZEN_WRITE_DEADLINE_MS);
  writeTimer.unref();
  signal?.addEventListener("abort", abortWrite, { once: true });
  try {
    await claimWriteLease();
    if (signal?.aborted) throw new Error("The frozen assessment write was cancelled.");
    await pipeline(
      createReadStream(audioPath),
      frozenFile.createWriteStream({
        resumable: false,
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { contentType },
      }),
      { signal: writeController.signal },
    );
  } catch {
    throw new Error("The validated private recording could not be frozen.");
  } finally {
    clearTimeout(writeTimer);
    signal?.removeEventListener("abort", abortWrite);
  }
  return frozenStoragePath;
}

function childEnvironment(paths: ReturnType<typeof getRecitationRuntimePaths>) {
  return {
    PATH: process.env.PATH ?? "",
    HOME: paths.runtimeDir,
    PYTHONNOUSERSITE: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    HF_HUB_OFFLINE: "1",
    TRANSFORMERS_OFFLINE: "1",
    HF_HUB_DISABLE_TELEMETRY: "1",
    DO_NOT_TRACK: "1",
  };
}

function terminateProcessGroup(child: ReturnType<typeof spawn>) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  const killTimer = setTimeout(() => {
    if (!child.pid) return;
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }, 500);
  killTimer.unref();
}

async function decodeValidate(audioPath: string, signal?: AbortSignal): Promise<number> {
  const paths = getRecitationRuntimePaths();
  const resolvedRuntime = path.resolve(paths.runtimeDir);
  const resolvedScript = path.resolve(paths.runtimeScript);
  if (!resolvedScript.startsWith(`${paths.root}${path.sep}`) || !resolvedRuntime.startsWith(`${paths.root}${path.sep}`)) {
    throw new Error("Assessment audio validation runtime is outside the trusted runtime.");
  }
  const child = spawn(
    paths.python,
    [resolvedScript, "--audio", audioPath, "--validate-only"],
    {
      shell: false,
      detached: true,
      cwd: paths.root,
      env: childEnvironment(paths),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return new Promise<number>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error?: Error, duration?: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(duration!);
    };
    const abort = () => {
      terminateProcessGroup(child);
      finish(new Error("Audio validation was cancelled."));
    };
    const timer = setTimeout(() => {
      terminateProcessGroup(child);
      finish(new Error("Audio validation exceeded its deadline."));
    }, DECODER_DEADLINE_MS);
    timer.unref();
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout = (stdout + chunk).slice(0, 4096);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(0, 2048);
    });
    child.once("error", () => finish(new Error("Audio validation runtime is unavailable.")));
    child.once("close", (code) => {
      if (code !== 0) {
        // Do not return decoder stderr, file paths, transcripts, or dependency details.
        void stderr;
        finish(new Error("The uploaded audio did not pass local media validation."));
        return;
      }
      try {
        const result: unknown = JSON.parse(stdout.trim());
        if (
          typeof result !== "object" || result === null ||
          !("valid" in result) || result.valid !== true ||
          !("durationSeconds" in result) || typeof result.durationSeconds !== "number" ||
          !Number.isFinite(result.durationSeconds) || result.durationSeconds <= 0 ||
          result.durationSeconds > AUDIO_MAX_DURATION_SECONDS ||
          !("maxDurationSeconds" in result) || result.maxDurationSeconds !== AUDIO_MAX_DURATION_SECONDS
        ) {
          throw new Error("Invalid validation output.");
        }
        finish(undefined, result.durationSeconds);
      } catch {
        finish(new Error("The local audio validator returned an invalid result."));
      }
    });
  });
}

export async function validateAssessmentAudio(
  uploadStoragePath: string,
  expectedSizeBytes: number,
  expectedContentType: string,
  frozenStoragePath: string,
  claimWriteLease: () => Promise<void>,
  signal?: AbortSignal,
): Promise<{ durationSeconds: number; actualSizeBytes: number; frozenStoragePath: string }> {
  if (!Number.isSafeInteger(expectedSizeBytes) || expectedSizeBytes < 1 || expectedSizeBytes > AUDIO_MAX_BYTES) {
    throw new Error("Audio upload exceeds the assessment limit.");
  }
  const paths = getRecitationRuntimePaths();
  const trustedRoot = await realpath(paths.root);
  const cacheDir = path.join(trustedRoot, ".cache");
  const runtimeDir = path.join(cacheDir, "recitation-runtime");
  for (const [directory, mode] of [[cacheDir, 0o700], [runtimeDir, 0o700], [path.join(runtimeDir, "tmp"), 0o700]] as const) {
    try {
      if ((await lstat(directory)).isSymbolicLink()) {
        throw new Error("An audio validation directory cannot be a symbolic link.");
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("symbolic link")) throw error;
      await mkdir(directory, { mode });
    }
  }
  const [trustedRuntime, trustedTmp] = await Promise.all([
    realpath(runtimeDir),
    realpath(path.join(runtimeDir, "tmp")),
  ]);
  const expectedRuntime = path.join(trustedRoot, ".cache", "recitation-runtime");
  if (trustedRuntime !== expectedRuntime) {
    throw new Error("The configured audio validation directory is not trusted.");
  }
  if (trustedTmp !== path.join(trustedRuntime, "tmp")) {
    throw new Error("The configured audio temporary directory is not trusted.");
  }
  await chmod(trustedTmp, 0o700);
  const tempDir = await mkdtemp(path.join(trustedTmp, "assessment-audio-"));
  await chmod(tempDir, 0o700);
  const trustedTempDir = await realpath(tempDir);
  if (!trustedTempDir.startsWith(`${trustedRuntime}${path.sep}`)) {
    await rm(tempDir, { recursive: true, force: true });
    throw new Error("The audio validation temporary directory is outside the trusted runtime.");
  }
  const audioPath = path.join(trustedTempDir, "recording.private");
  try {
    const file = await getStorageFile(uploadStoragePath);
    const stream = file.createReadStream();
    let actualSize = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        actualSize += chunk.length;
        if (actualSize > AUDIO_MAX_BYTES || actualSize > expectedSizeBytes) {
          callback(new Error("Audio exceeds the bounded download size."));
          return;
        }
        callback(null, chunk);
      },
    });
    const timer = setTimeout(() => stream.destroy(new Error("Audio download exceeded its deadline.")), DOWNLOAD_DEADLINE_MS);
    timer.unref();
    try {
      await pipeline(stream, limiter, createWriteStream(audioPath, { mode: 0o600 }), { signal });
    } finally {
      clearTimeout(timer);
    }
    await chmod(audioPath, 0o600);
    const metadata = await file.getMetadata();
    const storedSize = Number(metadata[0].size);
    const contentType = typeof metadata[0].contentType === "string"
      ? canonicalizeContentType(metadata[0].contentType)
      : "";
    if (
      actualSize !== expectedSizeBytes ||
      storedSize !== expectedSizeBytes ||
      actualSize !== storedSize ||
      contentType !== canonicalizeContentType(expectedContentType)
    ) {
      throw new Error("Audio upload metadata did not match the signed request.");
    }
    const durationSeconds = await decodeValidate(audioPath, signal);
    const finalStat = await stat(audioPath);
    if (finalStat.size !== actualSize || durationSeconds > AUDIO_MAX_DURATION_SECONDS) {
      throw new Error("Audio size or duration validation failed.");
    }
    const writtenFrozenStoragePath = await freezeValidatedAssessmentAudio(
      audioPath,
      uploadStoragePath,
      frozenStoragePath,
      canonicalizeContentType(expectedContentType) ?? "",
      file,
      claimWriteLease,
      signal,
    );
    return { durationSeconds, actualSizeBytes: actualSize, frozenStoragePath: writtenFrozenStoragePath };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}