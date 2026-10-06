// No application database or credentials are used. A fresh Unix-socket-only
// PostgreSQL cluster and a test-only route bundle are destroyed on every run.
import { build } from "esbuild";
import { mkdtemp, mkdir, rm, writeFile, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url));
const preview = process.argv.includes("--preview");
const preparedImport = process.argv.includes("--prepared-import");
const privateStorage = process.argv.includes("--private-storage");
const teacherReview = process.argv.includes("--teacher-review") || privateStorage;
const collation = process.argv.includes("--collation");
const temp = await mkdtemp(join(tmpdir(), "mateen-participant-tests-"));
const dbRequire = createRequire(join(root, "../../lib/db/package.json"));
const { generateDrizzleJson, generateMigration } = dbRequire("drizzle-kit/api");
const socket = join(temp, "socket");
const data = join(temp, "data");
let started = false;
const childEnv = {
  PATH: process.env.PATH,
  HOME: temp,
  USER: process.env.USER,
  NODE_ENV: "test",
  DATABASE_URL: `postgresql://mateen_test@localhost/postgres?host=${encodeURIComponent(socket)}`,
  SCHOLARLY_TEST_CLUSTER: temp,
  ...(privateStorage ? {
    PRIVATE_STORAGE_PROVIDER: "local",
    LOCAL_PRIVATE_STORAGE_DIR: join(temp, "private-objects"),
  } : {}),
  ...(preview ? { NVIDIA_API_KEY: "synthetic-test-only-not-a-credential" } : {}),
};
function pg(command, args) {
  const result = spawnSync(command, args, { env: childEnv, encoding: "utf8", timeout: 30000 });
  if (result.status !== 0) {
    throw new Error(`${command} failed. Install PostgreSQL binaries (initdb/pg_ctl/psql).\n${result.stderr || result.error || result.stdout}`);
  }
}
try {
  await mkdir(socket, { mode: 0o700 });
  pg("initdb", ["-D", data, "-U", "mateen_test", "-A", "trust", "--no-locale", "--encoding=UTF8"]);
  pg("pg_ctl", ["-D", data, "-l", join(temp, "postgres.log"), "-o", `-k ${socket} -h '' -F`, "-w", "start"]);
  started = true;
  const schemaFile = join(temp, "schema.cjs");
  await build({
    entryPoints: [join(root, "../../lib/db/src/schema/index.ts")],
    bundle: true, platform: "node", format: "cjs", outfile: schemaFile,
  });
  const require = createRequire(import.meta.url);
  const schema = require(schemaFile);
  const sql = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema));
  const ddl = join(temp, "schema.sql");
  await writeFile(ddl, sql.join("\n"));
  pg("psql", ["-h", socket, "-U", "mateen_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", ddl]);

  // Resolution replacements exist only in this temporary test bundle. The
  // production build has no test header, auth bypass, model stub or test router.
  const outfile = join(temp, preview ? "preview.test.cjs" : "participants.test.cjs");
  if (collation || preparedImport) {
    await mkdir(join(temp, "collation-evidence"));
    for (const page of ["005", "006", "007"]) {
      await copyFile(join(root, "../../deliverables/aljam3-commentary/evidence", `pdf-${page}.png`),
        join(temp, "collation-evidence", `pdf-${page}.png`));
    }
  }
  await build({
    entryPoints: [join(root, privateStorage ? "tests/private-storage.http.test.ts" : collation ? "tests/scholarly.collation.test.ts" : preparedImport ? "tests/scholarly.import.test.ts" : teacherReview ? "tests/teacher-review.http.test.ts" : preview ? "tests/scholarly.preview.test.ts" : "tests/scholarly.participants.test.ts")],
    bundle: true, platform: "node", format: "cjs", outfile,
    ...(collation || preparedImport ? { define: { "import.meta.url": JSON.stringify(pathToFileURL(join(temp, "index.mjs")).href) } } : {}),
    plugins: [{
      name: "participant-test-boundaries",
      setup(builder) {
        if (teacherReview && !privateStorage) builder.onResolve({ filter: /^\.\.\/lib\/qualification-storage$/ }, () => ({
          path: join(root, "tests/doubles/teacher-review-storage.ts"),
        }));
        if (privateStorage) builder.onResolve({ filter: /^\.\/malware-scanner$/ }, () => ({
          path: join(root, "tests/doubles/private-storage-scanner.ts"),
        }));
        builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({
          path: join(root, teacherReview ? "tests/doubles/teacher-review-auth.ts" : preview || preparedImport || collation ? "tests/doubles/preview-auth.ts" : "tests/doubles/auth.ts"),
        }));
        if (preview || preparedImport || collation) return; // Exercise the real admin router and provider implementation.
        builder.onResolve({ filter: /^\.\.\/lib\/scholarly-excerpts$/ }, () => ({
          path: join(root, "tests/doubles/excerpts.ts"),
        }));
        builder.onResolve({ filter: /^\.\/scholarly\.admin$/ }, () => ({
          path: join(root, "tests/doubles/admin.ts"),
        }));
        builder.onResolve({ filter: /^\.\.\/lib\/scholarly$/ }, () => ({
          path: join(root, "tests/doubles/provider.ts"),
        }));
      },
    }],
  });
  // Separate process-local rate-limit budgets for the two coherent suites;
  // do not weaken or replace production rate limiting to grow the test suite.
  const groups = preview || teacherReview || preparedImport || collation ? [[]] : [
    ["--test-skip-pattern=^RAG "], ["--test-name-pattern=^RAG "],
  ];
  for (const group of groups) {
    const child = spawn(process.execPath, ["--test", "--test-timeout=90000", ...group, outfile], {
      env: childEnv, stdio: "inherit",
    });
    const code = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (status) => resolve(status ?? 1));
    });
    if (code) { process.exitCode = code; break; }
  }
} finally {
  try {
    if (started) pg("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}