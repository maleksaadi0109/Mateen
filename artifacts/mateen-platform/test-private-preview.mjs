// Bundle the actual component + generated mutation hook. Only Clerk identity
// discovery and decorative Notice are replaced; HTTP responses are synthetic.
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url));
// Keep temporary bundle under the package so external dependencies resolve.
const temp = await mkdtemp(join(root, ".preview-tests-"));
try {
  const outfile = join(temp, "preview.test.mjs");
  await build({
    entryPoints: [join(root, "tests/private-preview.test.tsx")],
    bundle: true, platform: "node", format: "esm", outfile, jsx: "automatic",
    external: ["react", "react/*", "react-dom/*", "@tanstack/react-query", "jsdom"],
    plugins: [{
      name: "private-preview-test-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /^@clerk\/react$/ }, () => ({
          path: join(root, "tests/doubles/preview-auth.ts"),
        }));
        builder.onResolve({ filter: /^@\/components\/mateen\/bits$/ }, () => ({
          path: join(root, "tests/doubles/preview-notice.tsx"),
        }));
      },
    }],
  });
  const answerFile = join(temp, "answer-text.test.mjs");
  await build({
    entryPoints: [join(root, "tests/answer-text.test.tsx")],
    bundle: true, platform: "node", format: "esm", outfile: answerFile, jsx: "automatic",
    external: ["react", "react/*", "react-dom/*"],
  });
  const chatFile = join(temp, "chat-request.test.mjs");
  await build({
    entryPoints: [join(root, "tests/chat-request.test.ts")],
    bundle: true, platform: "node", format: "esm", outfile: chatFile,
  });
  const liveFile = join(temp, "live-recitation.test.mjs");
  await build({
    entryPoints: [join(root, "tests/live-recitation.test.tsx")],
    bundle: true, platform: "node", format: "esm", outfile: liveFile, jsx: "automatic",
    external: ["react", "react/*", "react-dom/*", "jsdom"],
  });
  const child = spawn(process.execPath, ["--test", "--test-timeout=30000", outfile, answerFile, chatFile, liveFile], {
    stdio: "inherit",
    // Never inherit provider, application database or Clerk credentials.
    env: { PATH: process.env.PATH, NODE_ENV: "test", HOME: temp },
  });
  process.exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", code => resolve(code ?? 1));
  });
} finally {
  await rm(temp, { recursive: true, force: true });
}