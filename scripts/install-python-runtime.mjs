import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Publishing's automatic Python installer rewrites torch-related source
// mappings. Materialize the unchanged, locked project outside auto-discovery
// and call uv directly. Keep the existing runtime path used by the API.
export async function installPythonRuntime({ dryRun = false } = {}) {
  const project = await mkdtemp(path.join(tmpdir(), "mateen-python-"));
  try {
    await copyFile(path.join(root, "python-runtime.toml"), path.join(project, "pyproject.toml"));
    await copyFile(path.join(root, "python-runtime.lock"), path.join(project, "uv.lock"));
    const args = ["sync", "--locked", "--project", project, ...(dryRun ? ["--dry-run"] : [])];
    const result = spawnSync("uv", args, {
      cwd: root,
      env: { ...process.env, UV_PROJECT_ENVIRONMENT: path.join(root, ".pythonlibs") },
      stdio: "inherit",
      timeout: 10 * 60_000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Python runtime installation failed (exit ${result.status}, signal ${result.signal ?? "none"})`);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).some(arg => arg !== "--check")) throw new Error("Supported option: --check");
  await installPythonRuntime({ dryRun: process.argv.includes("--check") });
}