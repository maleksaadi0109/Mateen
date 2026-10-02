// No application database or credentials are used. A fresh Unix-socket-only
// PostgreSQL cluster and a test-only route bundle are destroyed on every run.
import { build } from "esbuild";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url));
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
  const outfile = join(temp, "participants.test.cjs");
  await build({
    entryPoints: [join(root, "tests/scholarly.participants.test.ts")],
    bundle: true, platform: "node", format: "cjs", outfile,
    plugins: [{
      name: "participant-test-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({
          path: join(root, "tests/doubles/auth.ts"),
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
  const child = spawn(process.execPath, ["--test", "--test-timeout=90000", outfile], {
    env: childEnv, stdio: "inherit",
  });
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (status) => resolve(status ?? 1));
  });
  process.exitCode = code;
} finally {
  try {
    if (started) pg("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}