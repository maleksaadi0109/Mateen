// Real PostgreSQL + HTTP routes; only external Clerk discovery is replaced.
import { build } from "esbuild";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "practice-reports-"));
const socket = join(temp, "socket"), data = join(temp, "data");
const env = { PATH: process.env.PATH, HOME: temp, USER: process.env.USER, NODE_ENV: "test",
  DATABASE_URL: `postgresql://report_test@localhost/reports?host=${encodeURIComponent(socket)}` };
let started = false;
function pg(command, args) {
  const r = spawnSync(command, args, { env, encoding: "utf8", timeout: 30000 });
  if (r.status !== 0) throw new Error(r.stderr || r.error || `${command} failed`);
}
try {
  await mkdir(socket, { mode: 0o700 });
  pg("initdb", ["-D", data, "-U", "report_test", "-A", "trust", "--no-locale", "--encoding=UTF8"]);
  pg("pg_ctl", ["-D", data, "-l", join(temp, "postgres.log"), "-o", `-k ${socket} -h '' -F`, "-w", "start"]);
  started = true;
  pg("createdb", ["-h", socket, "-U", "report_test", "reports"]);
  pg("psql", ["-h", socket, "-U", "report_test", "-d", "reports", "-v", "ON_ERROR_STOP=1", "-c",
    "CREATE TYPE mateen_profile_role AS ENUM ('student','teacher'); CREATE TABLE mateen_profiles(clerk_id text PRIMARY KEY,name text NOT NULL DEFAULT '',role mateen_profile_role NOT NULL DEFAULT 'student',onboarded boolean NOT NULL DEFAULT false,learning_preferences jsonb);"]);
  pg("psql", ["-h", socket, "-U", "report_test", "-d", "reports", "-v", "ON_ERROR_STOP=1", "-f",
    join(root, "../../lib/db/migrations/0009_practice_reports.sql")]);
  const outfile = join(temp, "tests.cjs");
  await build({
    entryPoints: [join(root, "tests/practice-reports.http.test.ts")], bundle: true,
    platform: "node", format: "cjs", outfile,
    plugins: [{ name: "test-clerk-discovery", setup(b) {
      b.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "clerk", namespace: "test-auth" }));
      b.onLoad({ filter: /.*/, namespace: "test-auth" }, () => ({
        contents: "export const getAuth = req => ({ userId: req.headers['x-test-user'] || null });", loader: "js",
      }));
    }}],
  });
  const result = spawnSync(process.execPath, ["--test", outfile], { env, stdio: "inherit", timeout: 60000 });
  if (result.status !== 0) throw new Error("Practice report HTTP regression failed");
} finally {
  if (started) pg("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  await rm(temp, { recursive: true, force: true });
}