import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm, stat, symlink, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHmac, randomUUID } from "node:crypto";
import { LocalPrivateFile, localStorageReady, localStorageRoot, signLocalUpload, verifyLocalUpload } from "./local-private-storage";
import { ObjectStorageService } from "./objectStorage";
import { ObjectPermission, canAccessObject, setObjectAclPolicy } from "./objectAcl";
import { createFrozenAssessmentStoragePath, freezeValidatedAssessmentAudio } from "./assessment-audio-validation";

let root: string;
const savedProvider = process.env.PRIVATE_STORAGE_PROVIDER;
const savedRoot = process.env.LOCAL_PRIVATE_STORAGE_DIR;
const savedOrigin = process.env.LOCAL_PRIVATE_STORAGE_ORIGIN;
before(async () => {
  root = await mkdtemp(path.join(tmpdir(), "mateen-private-unit-"));
  process.env.PRIVATE_STORAGE_PROVIDER = "local";
  process.env.LOCAL_PRIVATE_STORAGE_DIR = path.join(root, "objects");
  process.env.LOCAL_PRIVATE_STORAGE_ORIGIN = "http://localhost:5000";
});
after(async () => {
  if (savedProvider === undefined) delete process.env.PRIVATE_STORAGE_PROVIDER;
  else process.env.PRIVATE_STORAGE_PROVIDER = savedProvider;
  if (savedRoot === undefined) delete process.env.LOCAL_PRIVATE_STORAGE_DIR;
  else process.env.LOCAL_PRIVATE_STORAGE_DIR = savedRoot;
  if (savedOrigin === undefined) delete process.env.LOCAL_PRIVATE_STORAGE_ORIGIN;
  else process.env.LOCAL_PRIVATE_STORAGE_ORIGIN = savedOrigin;
  await rm(root, { recursive: true, force: true });
});

test("real disk round trip, private permissions and synthetic owner ACL", async () => {
  assert.equal(await localStorageReady(), true);
  const file = new LocalPrivateFile(`uploads/${randomUUID()}`);
  const bytes = Buffer.from("Synthetic private recording, not learner data");
  await file.save(bytes, { contentType: "audio/webm" });
  await setObjectAclPolicy(file, { owner: "synthetic-a", visibility: "private" });
  assert.deepEqual((await file.download())[0], bytes);
  assert.equal((await file.getMetadata())[0].contentType, "audio/webm");
  for (const [userId, allowed] of [["synthetic-a", true], ["synthetic-b", false], [undefined, false]] as const) {
    assert.equal(await canAccessObject({ userId, objectFile: file, requestedPermission: ObjectPermission.READ }), allowed);
  }
  const directory = await localStorageRoot();
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  for (const name of await readdir(directory)) assert.equal((await stat(path.join(directory, name))).mode & 0o777, 0o600);
  await file.delete();
  assert.deepEqual(await file.exists(), [false]);
});

test("PUT capabilities expire, reject tampering and cannot target final evidence", async () => {
  const key = `uploads/${randomUUID()}`;
  const url = await signLocalUpload(key, new Date(Date.now() + 60_000));
  const token = new URL(url, "http://test.invalid").searchParams.get("token")!;
  assert.equal(await verifyLocalUpload(token), key);
  await assert.rejects(verifyLocalUpload(token + "tampered"));
  await assert.rejects(verifyLocalUpload(undefined));
  for (const forbidden of [`assessment-audio/frozen/${randomUUID()}`, `qualification/owner/${randomUUID()}`, "../escape"]) {
    await assert.rejects(signLocalUpload(forbidden, new Date(Date.now() + 60_000)));
  }
  await assert.rejects(signLocalUpload(key, new Date(Date.now() + 901_000)));
  const payload = Buffer.from(JSON.stringify({ key, expires: Date.now() - 1000 })).toString("base64url");
  // Read only the disposable fixture key, never workspace/environment credentials.
  const secret = await readFile(path.join(await localStorageRoot(), ".upload-signing-key"));
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  await assert.rejects(verifyLocalUpload(`${payload}.${signature}`), /expired/);
});

test("production audio freezer writes exact validated bytes once; replay cannot alter them", async () => {
  const storage = new ObjectStorageService();
  const uploadPath = storage.createObjectEntityUploadPath();
  const uploadFile = new LocalPrivateFile(uploadPath.slice("/objects/".length));
  const bytes = Buffer.from("Validated synthetic audio bytes");
  await uploadFile.save(bytes);
  const validatedPath = path.join(root, "validated-audio");
  await writeFile(validatedPath, bytes, { mode: 0o600 });
  const frozenPath = createFrozenAssessmentStoragePath(uploadPath);
  let claimed = false;
  await freezeValidatedAssessmentAudio(validatedPath, uploadPath, frozenPath, "audio/webm", uploadFile,
    async () => { claimed = true; });
  assert.equal(claimed, true);
  await uploadFile.save(Buffer.from("Replacement upload"));
  const frozen = await storage.getObjectEntityFile(frozenPath);
  assert.deepEqual((await frozen.download())[0], bytes);
  await assert.rejects(frozen.save(Buffer.from("Overwrite")));
  await assert.rejects(storage.getObjectEntityUploadURLForPath(frozenPath, new Date(Date.now() + 60_000)));
  assert.deepEqual((await frozen.download())[0], bytes);
});

test("unsafe configuration, symlinks, traversal and over-limit writes fail closed", async () => {
  const directory = process.env.LOCAL_PRIVATE_STORAGE_DIR;
  try {
    for (const invalid of [undefined, "relative", process.cwd(), "/"]) {
      if (invalid === undefined) delete process.env.LOCAL_PRIVATE_STORAGE_DIR;
      else process.env.LOCAL_PRIVATE_STORAGE_DIR = invalid;
      await assert.rejects(localStorageReady());
    }
    const linked = path.join(root, "linked");
    await symlink(path.join(root, "objects"), linked);
    process.env.LOCAL_PRIVATE_STORAGE_DIR = linked;
    await assert.rejects(localStorageReady(), /symbolic/);
  } finally { process.env.LOCAL_PRIVATE_STORAGE_DIR = directory; }
  for (const key of ["../escape", "/absolute", "uploads//id", "uploads/%2e%2e"]) {
    assert.throws(() => new LocalPrivateFile(key));
  }
  const file = new LocalPrivateFile(`uploads/${randomUUID()}`);
  await assert.rejects(file.save(Buffer.alloc(10 * 1024 * 1024 + 1)), /size/);
  assert.deepEqual(await file.exists(), [false]);
  process.env.PRIVATE_STORAGE_PROVIDER = "unknown";
  assert.throws(() => new ObjectStorageService().getPrivateObjectDir());
  process.env.PRIVATE_STORAGE_PROVIDER = "local";
  await assert.rejects(new ObjectStorageService().getObjectEntityFile("/objects/../escape"));
  const origin = process.env.LOCAL_PRIVATE_STORAGE_ORIGIN;
  try {
    for (const invalid of [undefined, "http://remote.invalid", "https://example.invalid/public", "https://user:pass@example.invalid"]) {
      if (invalid === undefined) delete process.env.LOCAL_PRIVATE_STORAGE_ORIGIN;
      else process.env.LOCAL_PRIVATE_STORAGE_ORIGIN = invalid;
      await assert.rejects(localStorageReady());
    }
  } finally { process.env.LOCAL_PRIVATE_STORAGE_ORIGIN = origin; }
});
