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
  const bookTextFile = join(temp, "recitation-book-view.test.mjs");
  await build({
    entryPoints: [join(root, "tests/recitation-book-view.test.tsx")],
    bundle: true, platform: "node", format: "esm", outfile: bookTextFile, jsx: "automatic",
    external: ["react", "react/*", "react-dom", "react-dom/*", "lucide-react", "@radix-ui/react-dialog"],
  });
  const studyProgressFile = join(temp, "study-progress.test.mjs");
  await build({
    entryPoints: [join(root, "tests/study-progress.test.tsx")],
    bundle: true, platform: "node", format: "esm", outfile: studyProgressFile, jsx: "automatic",
    external: ["react", "react/*", "react-dom", "react-dom/*", "lucide-react", "@radix-ui/react-dialog", "@tanstack/react-query", "jsdom", "wouter"],
    plugins: [{name:"study-progress-boundaries",setup(builder) {
      builder.onResolve({filter:/^@workspace\/api-client-react$/},() => ({path:join(root,"tests/doubles/study-progress-api.ts")}));
      builder.onResolve({filter:/^@\/components\/mateen\/bits$/},() => ({path:join(root,"tests/doubles/study-bits.tsx")}));
    }}],
  });
  const scanFile = join(temp, "scanned-pages.test.mjs");
  await build({
    entryPoints: [join(root, "tests/scanned-pages.test.tsx")],
    bundle: true, platform: "node", format: "esm", outfile: scanFile, jsx: "automatic",
    external: ["react", "react/*", "react-dom", "react-dom/*", "lucide-react"],
  });
  const bookFile = join(temp, "book-reader.test.mjs");
  await build({
    entryPoints: [join(root, "tests/book-reader.test.tsx")],
    bundle: true, platform: "node", format: "esm", outfile: bookFile, jsx: "automatic",
    external: ["react", "react/*", "react-dom", "react-dom/*", "lucide-react"],
  });
  const bookFlowFile = join(temp, "book-recitation-flow.test.mjs");
  await build({
    entryPoints: [join(root, "tests/book-recitation-flow.test.tsx")],
    bundle: true, platform: "node", format: "esm", outfile: bookFlowFile, jsx: "automatic",
    external: ["react", "react/*", "react-dom", "react-dom/*", "lucide-react", "jsdom"],
    plugins: [{name:"book-api-boundary",setup(builder) {
      builder.onResolve({filter:/^@workspace\/api-client-react$/},() => ({
        path:join(root,"tests/doubles/book-api.ts"),
      }));
    }}],
  });
  const child = spawn(process.execPath, ["--test", "--test-timeout=30000", outfile, answerFile, chatFile, liveFile, bookTextFile, studyProgressFile, scanFile, bookFile, bookFlowFile], {
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