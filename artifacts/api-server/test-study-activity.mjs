import { build } from "esbuild";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Disposable PostgreSQL + test-only auth; never writes to real account history.
const root = dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "study-activity-"));
const socket = join(temp, "socket"), data = join(temp, "data");
const env = { PATH: process.env.PATH, HOME: temp, USER: process.env.USER, NODE_ENV: "test",
  DATABASE_URL: `postgresql://activity_test@localhost/activity?host=${encodeURIComponent(socket)}` };
let started = false;
function pg(command, args) {
  const r = spawnSync(command, args, { env, encoding: "utf8", timeout: 30000 });
  if (r.status !== 0) throw new Error(r.stderr || r.error || `${command} failed`);
}
try {
  await mkdir(socket, { mode: 0o700 });
  pg("initdb", ["-D", data, "-U", "activity_test", "-A", "trust", "--no-locale", "--encoding=UTF8"]);
  pg("pg_ctl", ["-D", data, "-l", join(temp, "postgres.log"), "-o", `-k ${socket} -h '' -F`, "-w", "start"]); started = true;
  pg("createdb", ["-h", socket, "-U", "activity_test", "activity"]);
  pg("psql", ["-h", socket, "-U", "activity_test", "-d", "activity", "-v", "ON_ERROR_STOP=1", "-c",
    "CREATE TYPE mateen_profile_role AS ENUM ('student','teacher'); CREATE TABLE mateen_profiles(clerk_id text PRIMARY KEY,name text NOT NULL DEFAULT '',role mateen_profile_role NOT NULL DEFAULT 'student',onboarded boolean NOT NULL DEFAULT false);"]);
  for (const migration of ["0009_practice_reports.sql", "0011_study_activity.sql"])
    pg("psql", ["-h", socket, "-U", "activity_test", "-d", "activity", "-v", "ON_ERROR_STOP=1", "-f", join(root, "../../lib/db/migrations", migration)]);
  const outfile = join(temp, "tests.cjs");
  await build({
    entryPoints: [join(root, "tests/study-activity.http.test.ts")], bundle: true, platform: "node", format: "cjs", outfile,
    plugins: [{ name: "activity-test-auth", setup(b) {
      b.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "clerk", namespace: "activity-auth" }));
      b.onLoad({ filter: /.*/, namespace: "activity-auth" }, () => ({
        contents: "export const getAuth = req => ({ userId: req.headers['x-test-user'] || null });", loader: "js",
      }));
    }}],
  });
  const result = spawnSync(process.execPath, ["--test", outfile], { env, stdio: "inherit", timeout: 60000 });
  if (result.status !== 0) throw new Error("Study-activity HTTP regression failed");
} finally {
  if (started) pg("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  await rm(temp, { recursive: true, force: true });
}