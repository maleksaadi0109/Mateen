import { build } from "esbuild";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Isolated disposable database and test-only auth adapter; no development users
// or production credentials/data are read or changed by this regression.
const root = dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "learning-stage-"));
const socket = join(temp, "socket"), data = join(temp, "data");
const env = { PATH: process.env.PATH, HOME: temp, USER: process.env.USER, NODE_ENV: "test",
  DATABASE_URL: `postgresql://stage_test@localhost/stages?host=${encodeURIComponent(socket)}` };
let started = false;
function pg(command, args) {
  const r = spawnSync(command, args, { env, encoding: "utf8", timeout: 30000 });
  if (r.status !== 0) throw new Error(r.stderr || r.error || `${command} failed`);
}
try {
  await mkdir(socket, { mode: 0o700 });
  pg("initdb", ["-D", data, "-U", "stage_test", "-A", "trust", "--no-locale", "--encoding=UTF8"]);
  pg("pg_ctl", ["-D", data, "-l", join(temp, "postgres.log"), "-o", `-k ${socket} -h '' -F`, "-w", "start"]); started = true;
  pg("createdb", ["-h", socket, "-U", "stage_test", "stages"]);
  pg("psql", ["-h", socket, "-U", "stage_test", "-d", "stages", "-v", "ON_ERROR_STOP=1", "-c",
    "CREATE TYPE mateen_profile_role AS ENUM ('student','teacher'); CREATE TABLE mateen_profiles(clerk_id text PRIMARY KEY,name text NOT NULL DEFAULT '',role mateen_profile_role NOT NULL DEFAULT 'student',onboarded boolean NOT NULL DEFAULT false);"]);
  pg("psql", ["-h", socket, "-U", "stage_test", "-d", "stages", "-v", "ON_ERROR_STOP=1", "-f",
    join(root, "../../lib/db/migrations/0010_learning_stages.sql")]);
  const outfile = join(temp, "tests.cjs");
  await build({
    entryPoints: [join(root, "tests/learning-stages.http.test.ts")], bundle: true, platform: "node", format: "cjs", outfile,
    plugins: [{ name: "stage-test-adapters", setup(b) {
      b.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "clerk", namespace: "stage-auth" }));
      b.onLoad({ filter: /.*/, namespace: "stage-auth" }, () => ({
        contents: "export const getAuth = req => ({ userId: req.headers['x-test-user'] || null });", loader: "js",
      }));
      b.onResolve({ filter: /\/source-review$/ }, () => ({ path: "source", namespace: "stage-source" }));
      b.onLoad({ filter: /.*/, namespace: "stage-source" }, () => ({
        contents: `import records from ${JSON.stringify(join(root, "src/data/nawawi.json"))}; export async function getNawawiStudyRecords() { return { hadiths: records }; }`,
        loader: "js", resolveDir: root,
      }));
    }}],
  });
  const result = spawnSync(process.execPath, ["--test", outfile], { env, stdio: "inherit", timeout: 60000 });
  if (result.status !== 0) throw new Error("Learning-stage HTTP regression failed");
} finally {
  if (started) pg("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  await rm(temp, { recursive: true, force: true });
}