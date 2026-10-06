import { constants as fsConstants } from "node:fs";
import { access, stat, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { ObjectStorageService, objectStorageClient } from "./objectStorage";
import { storageProvider } from "./private-storage";
import { localStorageReady } from "./local-private-storage";

const storage = new ObjectStorageService();
const expectedModelId = "Qwen/Qwen3-ASR-0.6B-hf";
let readinessCache: { expiresAt: number; value: boolean } | null = null;
let readinessProbe: Promise<boolean> | null = null;
let validationReadinessCache: { expiresAt: number; value: boolean } | null = null;
let validationReadinessProbe: Promise<boolean> | null = null;

export function getRecitationRuntimePaths() {
  let root = path.resolve(process.cwd());
  if (root.endsWith(`${path.sep}artifacts${path.sep}api-server`)) {
    root = path.resolve(root, "../..");
  } else if (root.endsWith(`${path.sep}artifacts`)) {
    root = path.resolve(root, "..");
  }
  const modelDir = path.join(root, ".cache", "recitation-models", "qwen3-asr-0.6b-hf");
  const runtimeDir = path.join(root, ".cache", "recitation-runtime");
  return {
    root,
    modelDir,
    runtimeDir,
    tmpRoot: path.join(runtimeDir, "tmp"),
    manifest: path.join(modelDir, "download-manifest.json"),
    runtimeScript: path.join(root, "scripts", "src", "recitation-runtime.py"),
    python: path.join(root, ".pythonlibs", "bin", "python"),
  };
}

async function findTool(name: "ffmpeg" | "ffprobe"): Promise<boolean> {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    try {
      await access(path.join(directory, name), fsConstants.X_OK);
      return true;
    } catch {
      // Continue searching trusted PATH entries.
    }
  }
  return false;
}

async function pythonImportsAvailable(
  paths: ReturnType<typeof getRecitationRuntimePaths>,
  imports = "import torch, transformers",
) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(
      paths.python,
      ["-c", imports],
      {
        shell: false,
        cwd: paths.root,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: paths.runtimeDir,
          PYTHONNOUSERSITE: "1",
          PYTHONDONTWRITEBYTECODE: "1",
          HF_HUB_OFFLINE: "1",
          TRANSFORMERS_OFFLINE: "1",
          HF_HUB_DISABLE_TELEMETRY: "1",
          DO_NOT_TRACK: "1",
        },
        stdio: "ignore",
      },
    );
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(false);
    }, 30_000);
    child.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

export async function localRuntimeReady(): Promise<boolean> {
  const paths = getRecitationRuntimePaths();
  try {
    const [python, script, model, manifestText, ffmpeg, ffprobe] = await Promise.all([
      stat(paths.python),
      stat(paths.runtimeScript),
      stat(path.join(paths.modelDir, "model.safetensors")),
      readFile(paths.manifest, "utf8"),
      findTool("ffmpeg"),
      findTool("ffprobe"),
    ]);
    const manifest: unknown = JSON.parse(manifestText);
    if (
      python.isFile() &&
      script.isFile() &&
      model.isFile() &&
      ffmpeg &&
      ffprobe &&
      typeof manifest === "object" &&
      manifest !== null &&
      "model" in manifest &&
      manifest.model === expectedModelId &&
      "revision" in manifest &&
      typeof manifest.revision === "string" &&
      /^[a-f0-9]{40}$/.test(manifest.revision) &&
      "files" in manifest &&
      typeof manifest.files === "object" &&
      manifest.files !== null &&
      "config.json" in manifest.files &&
      "model.safetensors" in manifest.files &&
      "tokenizer.json" in manifest.files
    ) {
      return pythonImportsAvailable(paths);
    }
    return false;
  } catch {
    return false;
  }
}

async function audioValidationRuntimeReady(): Promise<boolean> {
  const paths = getRecitationRuntimePaths();
  try {
    const [python, script, ffmpeg, ffprobe] = await Promise.all([
      stat(paths.python),
      stat(paths.runtimeScript),
      findTool("ffmpeg"),
      findTool("ffprobe"),
    ]);
    return python.isFile() && script.isFile() && ffmpeg && ffprobe
      ? pythonImportsAvailable(paths, "import numpy")
      : false;
  } catch {
    return false;
  }
}

// Human-adjudicated exams need safe decoding and private storage, not ASR
// model weights or a claim that recognition is accurate enough for grading.
export async function assessmentAudioCapabilitiesReady(): Promise<boolean> {
  if (validationReadinessCache && validationReadinessCache.expiresAt > Date.now()) {
    return validationReadinessCache.value;
  }
  if (validationReadinessProbe) return validationReadinessProbe;
  validationReadinessProbe = Promise.all([
    audioValidationRuntimeReady(),
    privateStorageReady(),
  ])
    .then(([runtime, privateStorage]) => {
      const value = runtime && privateStorage;
      validationReadinessCache = { value, expiresAt: Date.now() + 30_000 };
      return value;
    })
    .catch(() => false)
    .finally(() => { validationReadinessProbe = null; });
  return validationReadinessProbe;
}

export async function privateStorageReady(): Promise<boolean> {
  try {
    if (storageProvider() === "local") return await localStorageReady();
    const privateDir = storage.getPrivateObjectDir().replace(/^\/+/, "");
    const separator = privateDir.indexOf("/");
    if (separator <= 0) return false;
    const bucketId = privateDir.slice(0, separator);
    const prefix = privateDir.slice(separator + 1).replace(/\/+$/, "");
    if (!prefix) return false;
    // Managed object credentials can read/write/delete private objects without
    // storage.buckets.get. An absent probe object is fine; denied access is not.
    const [uploadUrl] = await Promise.all([
      storage.getObjectEntityUploadURL(),
      objectStorageClient
        .bucket(bucketId)
        .file(`${prefix}/uploads/.recitation-readiness`)
        .exists(),
    ]);
    const target = new URL(uploadUrl);
    return target.protocol === "https:" && target.hostname === "storage.googleapis.com";
  } catch {
    return false;
  }
}

export async function recitationCapabilitiesReady(): Promise<boolean> {
  if (readinessCache && readinessCache.expiresAt > Date.now()) {
    return readinessCache.value;
  }
  if (readinessProbe) return readinessProbe;
  readinessProbe = Promise.all([
    localRuntimeReady(),
    privateStorageReady(),
  ])
    .then(([runtime, objectStorage]) => {
      const value = runtime && objectStorage;
      readinessCache = { value, expiresAt: Date.now() + 30_000 };
      return value;
    })
    .catch(() => false)
    .finally(() => {
      readinessProbe = null;
    });
  return readinessProbe;
}