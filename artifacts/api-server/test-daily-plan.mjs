import { build } from "esbuild";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "daily-plan-"));
const socket = join(temp, "socket"), data = join(temp, "data");
const env = { PATH: process.env.PATH, HOME: temp, USER: process.env.USER, NODE_ENV: "test",
  DATABASE_URL: `postgresql://plan_test@localhost/plans?host=${encodeURIComponent(socket)}` };
let started = false;
function pg(command, args) {
  const r = spawnSync(command, args, { env, encoding: "utf8", timeout: 30000 });
  if (r.status !== 0) throw new Error(r.stderr || r.error || `${command} failed`);
}
try {
  await mkdir(socket, { mode: 0o700 });
  pg("initdb", ["-D", data, "-U", "plan_test", "-A", "trust", "--no-locale", "--encoding=UTF8"]);
  pg("pg_ctl", ["-D", data, "-l", join(temp, "postgres.log"), "-o", `-k ${socket} -h '' -F`, "-w", "start"]); started = true;
  pg("createdb", ["-h", socket, "-U", "plan_test", "plans"]);
  pg("psql", [env.DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-c",
    "CREATE TYPE mateen_profile_role AS ENUM ('student','teacher'); CREATE TABLE mateen_profiles(clerk_id text PRIMARY KEY,name text NOT NULL DEFAULT '',role mateen_profile_role NOT NULL DEFAULT 'student',onboarded boolean NOT NULL DEFAULT false,learning_preferences jsonb);"]);
  for (const m of ["0001_add_assessments.sql", "0002_freeze_assessment_audio_and_review_passages.sql", "0010_learning_stages.sql",
    "0011_study_activity.sql", "0012_fractional_stage_scores.sql", "0014_stage_attempt_text_id.sql", "0017_word_practices.sql", "0018_daily_plans.sql"])
    pg("psql", [env.DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-f", join(root, "../../lib/db/migrations", m)]);
  const outfile = join(temp, "tests.cjs");
  await build({
    entryPoints: [join(root, "tests/daily-plan.http.test.ts")], bundle: true, platform: "node", format: "cjs", outfile,
    plugins: [{ name: "plan-test-adapters", setup(b) {
      b.onResolve({ filter: /^\.\.?\/(?:lib\/)?logger$/ }, () => ({ path: join(root, "tests/doubles/assessment-audio-logger.ts") }));
      b.onResolve({ filter: /\/assessment-retention$/ }, () => ({ path: "retention", namespace: "plan-retention" }));
      b.onLoad({ filter: /.*/, namespace: "plan-retention" }, () => ({
        contents: "export function startAssessmentRetentionCleanup(){}", loader: "js",
      }));
      b.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "clerk", namespace: "plan-auth" }));
      b.onLoad({ filter: /.*/, namespace: "plan-auth" }, () => ({
        contents: "export const getAuth = req => ({ userId: req.headers['x-test-user'] || null });", loader: "js",
      }));
      b.onResolve({ filter: /\/source-review$/ }, () => ({ path: "source", namespace: "plan-source" }));
      b.onLoad({ filter: /.*/, namespace: "plan-source" }, () => ({
        contents: `export let text='كلمة أولى ثانية نهاية'; export let fail=false; export function changeSource(t){text=t;} export function failSource(v){fail=v;} export async function getNawawiStudyRecords(){if(fail)throw Error('source unavailable');return {hadiths:text?[{id:1,number:1,title:'test',text}]:[]};}`, loader: "js",
      }));
    }}],
  });
  const r = spawnSync(process.execPath, ["--test", outfile], { env, stdio: "inherit", timeout: 90000 });
  if (r.status !== 0) throw new Error("Daily-plan HTTP regression failed");
} finally {
  if (started) pg("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  await rm(temp, { recursive: true, force: true });
}
