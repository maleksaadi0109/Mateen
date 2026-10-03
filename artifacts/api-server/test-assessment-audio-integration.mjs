// Uses a fresh local PostgreSQL cluster, applies the real SQL migrations, and
// runs HTTP tests against a temporary route bundle with object-store/auth seams.
import { build } from "esbuild";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "mateen-assessment-audio-tests-"));
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
  DATABASE_URL: `postgresql://mateen_test@localhost/assessment_http?host=${encodeURIComponent(socket)}`,
};

function pg(command, args) {
  const result = spawnSync(command, args, {
    env: childEnv,
    encoding: "utf8",
    timeout: 30000,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed. Install PostgreSQL binaries (initdb/pg_ctl/psql).\n${result.stderr || result.error || result.stdout}`);
  }
  return result.stdout;
}

try {
  await mkdir(socket, { mode: 0o700 });
  pg("initdb", ["-D", data, "-U", "mateen_test", "-A", "trust", "--no-locale", "--encoding=UTF8"]);
  pg("pg_ctl", ["-D", data, "-l", join(temp, "postgres.log"), "-o", `-k ${socket} -h '' -F`, "-w", "start"]);
  started = true;
  pg("createdb", ["-h", socket, "-U", "mateen_test", "assessment_http"]);
  pg("createdb", ["-h", socket, "-U", "mateen_test", "assessment_migrations"]);
  pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_migrations",
    "-v", "ON_ERROR_STOP=1", "-c",
    "CREATE SCHEMA assessment_migration_check",
  ]);
  childEnv.PGOPTIONS = "-c search_path=assessment_migration_check,public";

  const migrationDir = join(root, "../../lib/db/migrations");
  const nestedFrozenPath = "/objects/private/assessment-audio/frozen/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const rootFrozenPath = "/objects/assessment-audio/frozen/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_migrations",
    "-v", "ON_ERROR_STOP=1", "-f", join(migrationDir, "0001_add_assessments.sql"),
  ]);
  pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_migrations",
    "-v", "ON_ERROR_STOP=1", "-c",
    "INSERT INTO mateen_scheduled_reviews(id,user_id,hadith_number,due_at) VALUES ('legacy-review','same-owner',12,now())",
  ]);
  pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_migrations",
    "-v", "ON_ERROR_STOP=1", "-f",
    join(migrationDir, "0002_freeze_assessment_audio_and_review_passages.sql"),
  ]);
  pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_migrations",
    "-v", "ON_ERROR_STOP=1", "-c",
    "INSERT INTO mateen_scheduled_reviews(id,user_id,hadith_number,due_at,passage_key,source_version,window_start_word) VALUES ('second-passage','same-owner',12,now(),'nawawi:v1:12:8','nawawi-v1',8)",
  ]);
  pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_migrations",
    "-v", "ON_ERROR_STOP=1", "-f",
    join(migrationDir, "0003_durable_assessment_audio_reservations.sql"),
  ]);
  pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_migrations",
    "-v", "ON_ERROR_STOP=1", "-f",
    join(migrationDir, "0004_fence_assessment_audio_reservation_cleanup.sql"),
  ]);
  pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_migrations",
    "-v", "ON_ERROR_STOP=1", "-c",
    "INSERT INTO mateen_assessment_attempts(id,user_id,source_version,canonical_hash,policy_snapshot,questions_snapshot,session_id) VALUES ('reservation-test-attempt','reservation-test-owner','v1','hash','{}','[]','test-session'); INSERT INTO mateen_assessment_answers(id,attempt_id,user_id,question_id,position,kind,hadith_number,prompt,reference_text,upload_storage_path,upload_expires_at,pending_audio_sequence,expected_size_bytes,expected_content_type) VALUES ('reservation-test-answer','reservation-test-attempt','reservation-test-owner','reservation-test-question',16,'oral',1,'prompt','reference','/objects/uploads/reservation-test-upload',now()+interval '10 minutes',1,20,'audio/webm')",
  ]);
  pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_migrations",
    "-v", "ON_ERROR_STOP=1", "-c",
    `UPDATE mateen_assessment_answers SET frozen_reservation_path='${nestedFrozenPath}', frozen_reservation_expires_at=now()+interval '2 minutes', frozen_reservation_sequence=1 WHERE id='reservation-test-answer'`,
  ]);
  pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_migrations",
    "-v", "ON_ERROR_STOP=1", "-f",
    join(migrationDir, "0005_assessment_audio_cleanup_outbox.sql"),
  ]);
  const outboxCount = pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_migrations",
    "-At", "-c",
    `SELECT count(*) FROM mateen_assessment_audio_cleanup_outbox WHERE object_path='${nestedFrozenPath}'`,
  ]).trim();
  if (outboxCount !== "1") {
    throw new Error("Migration 0005 did not backfill the durable frozen-audio cleanup outbox.");
  }
  pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_migrations",
    "-v", "ON_ERROR_STOP=1", "-f",
    join(migrationDir, "0006_assessment_audio_upload_cleanup_outbox.sql"),
  ]);
  pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_migrations",
    "-v", "ON_ERROR_STOP=1", "-f",
    join(migrationDir, "0007_allow_repeated_assessment_upload_cancellations.sql"),
  ]);
  pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_migrations",
    "-v", "ON_ERROR_STOP=1", "-c",
    "INSERT INTO mateen_assessment_audio_upload_cleanup_outbox(id,attempt_id,question_id,sequence,object_path,state,lease_expires_at) VALUES ('cancelled-upload-1','same-attempt','same-question',1,'/objects/uploads/cancelled-upload-1','pending',now()+interval '1 minute'),('cancelled-upload-2','same-attempt','same-question',1,'/objects/uploads/cancelled-upload-2','pending',now()+interval '1 minute')",
  ]);
  pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_migrations",
    "-v", "ON_ERROR_STOP=1", "-c",
    "DO $$ BEGIN BEGIN UPDATE mateen_assessment_answers SET frozen_reservation_path=NULL, frozen_reservation_expires_at=NULL, frozen_reservation_sequence=NULL WHERE id='reservation-test-answer'; RAISE EXCEPTION 'early reservation release unexpectedly succeeded'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='early reservation release unexpectedly succeeded' THEN RAISE; END IF; IF SQLERRM NOT LIKE 'A frozen assessment reservation cannot be replaced%' THEN RAISE; END IF; END; END $$",
  ]);
  pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_migrations",
    "-v", "ON_ERROR_STOP=1", "-c",
    `UPDATE mateen_assessment_answers SET storage_path=frozen_reservation_path, audio_available=true, frozen_reservation_path=NULL, frozen_reservation_expires_at=NULL, frozen_reservation_sequence=NULL WHERE id='reservation-test-answer'`,
  ]);
  pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_migrations",
    "-v", "ON_ERROR_STOP=1", "-c",
    `ALTER TABLE mateen_assessment_answers DROP CONSTRAINT mateen_assessment_answers_frozen_reservation_path;
     INSERT INTO mateen_assessment_attempts(id,user_id,source_version,canonical_hash,policy_snapshot,questions_snapshot,session_id)
       VALUES ('root-path-attempt','root-path-owner','v1','hash','{}','[]','root-session');
     INSERT INTO mateen_assessment_answers(id,attempt_id,user_id,question_id,position,kind,hadith_number,prompt,reference_text,upload_storage_path,upload_expires_at,pending_audio_sequence,expected_size_bytes,expected_content_type)
       VALUES ('root-path-answer','root-path-attempt','root-path-owner','root-path-question',16,'oral',1,'prompt','reference','/objects/uploads/root-path-test',now()+interval '10 minutes',1,20,'audio/webm');
     UPDATE mateen_assessment_answers SET frozen_reservation_path='${rootFrozenPath}', frozen_reservation_expires_at=now()+interval '2 minutes', frozen_reservation_sequence=1 WHERE id='root-path-answer'`,
  ]);
  pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_migrations",
    "-v", "ON_ERROR_STOP=1", "-f",
    join(migrationDir, "0008_accept_root_assessment_frozen_paths.sql"),
  ]);
  const rootReservationOutboxCount = pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_migrations",
    "-At", "-c",
    `SELECT count(*) FROM mateen_assessment_audio_cleanup_outbox WHERE object_path='${rootFrozenPath}'`,
  ]).trim();
  if (rootReservationOutboxCount !== "1") {
    throw new Error("Migration 0008 did not accept and backfill the root private-entity reservation path.");
  }
  pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_migrations",
    "-v", "ON_ERROR_STOP=1", "-c",
    `BEGIN;
     UPDATE mateen_assessment_answers SET storage_path=frozen_reservation_path, audio_available=true, frozen_reservation_path=NULL, frozen_reservation_expires_at=NULL, frozen_reservation_sequence=NULL WHERE id='root-path-answer';
     DELETE FROM mateen_assessment_audio_cleanup_outbox WHERE object_path='${rootFrozenPath}';
     COMMIT`,
  ]);
  const rootCommitCount = pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_migrations",
    "-At", "-c",
    `SELECT count(*) FROM mateen_assessment_answers WHERE id='root-path-answer' AND storage_path='${rootFrozenPath}' AND audio_available`,
  ]).trim();
  if (rootCommitCount !== "1") {
    throw new Error("The root private-entity reservation did not promote to confirmed frozen audio.");
  }
  const reviewCount = pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_migrations",
    "-At", "-c",
    "SELECT count(*) FROM mateen_scheduled_reviews WHERE user_id='same-owner' AND hadith_number=12",
  ]).trim();
  if (reviewCount !== "2") {
    throw new Error(`The real 0002 migration did not permit distinct passage reviews for one hadith (count=${reviewCount}).`);
  }

  delete childEnv.PGOPTIONS;
  const schemaFile = join(temp, "schema.cjs");
  await build({
    entryPoints: [join(root, "../../lib/db/src/schema/index.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: schemaFile,
  });
  const schema = createRequire(import.meta.url)(schemaFile);
  const ddl = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema));
  const schemaSql = join(temp, "assessment-http-schema.sql");
  await writeFile(schemaSql, ddl.join("\n"));
  pg("psql", [
    "-h", socket, "-U", "mateen_test", "-d", "assessment_http",
    "-v", "ON_ERROR_STOP=1", "-f", schemaSql,
  ]);

  // Test-only module seams keep the HTTP contracts real while avoiding external
  // authentication and object storage services.
  const outfile = join(temp, "assessment-audio.http.test.cjs");
  await build({
    entryPoints: [join(root, "tests/assessment-audio-reservations.http.test.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile,
    plugins: [{
      name: "assessment-audio-test-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /^\.\.?\/(?:lib\/)?logger$/ }, () => ({
          path: join(root, "tests/doubles/assessment-audio-logger.ts"),
        }));
        builder.onResolve({ filter: /^\.\.\/lib\/mateen-auth$/ }, () => ({
          path: join(root, "tests/doubles/assessment-audio-auth.ts"),
        }));
        builder.onResolve({ filter: /^\.\.\/lib\/objectStorage$/ }, () => ({
          path: join(root, "tests/doubles/assessment-object-storage.ts"),
        }));
        builder.onResolve({ filter: /recitation-service$/ }, () => ({
          path: join(root, "tests/doubles/assessment-audio-storage-io.ts"),
        }));
        builder.onResolve({ filter: /^\.\.\/lib\/assessment-audio-validation$/ }, () => ({
          path: join(root, "tests/doubles/assessment-audio-validation.ts"),
        }));
        builder.onResolve({ filter: /^\.\.\/lib\/recitation-readiness$/ }, () => ({
          path: join(root, "tests/doubles/assessment-audio-readiness.ts"),
        }));
      },
    }],
  });
  const child = spawn(process.execPath, ["--test", "--test-timeout=90000", outfile], {
    env: childEnv,
    stdio: "inherit",
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