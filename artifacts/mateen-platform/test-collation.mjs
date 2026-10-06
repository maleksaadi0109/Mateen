import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(join(root, ".collation-tests-"));
try {
  const outfile = join(temp, "collation.test.mjs");
  await build({
    entryPoints: [join(root, "tests/collation-image.test.tsx")],
    bundle: true, platform: "node", format: "esm", outfile, jsx: "automatic",
    external: ["react", "react/*", "react-dom", "react-dom/*", "@tanstack/react-query", "jsdom"],
  });
  const child = spawn(process.execPath, ["--import", join(root, "tests/doubles/collation-dom.mjs"), "--test", "--test-timeout=15000", outfile], { stdio: "inherit" });
  process.exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject); child.on("exit", code => resolve(code ?? 1));
  });
} finally { await rm(temp, { recursive: true, force: true }); }
