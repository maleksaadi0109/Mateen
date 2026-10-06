import { constants } from "node:fs";
import { chmod, link, lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import type { FileMetadata } from "@google-cloud/storage";
import type { PrivateFile, WriteOptions } from "./private-storage";

export const LOCAL_PRIVATE_PREFIX = "/local-private";
export const MAX_LOCAL_UPLOAD_BYTES = 10 * 1024 * 1024;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const stagingKey = new RegExp(`^(uploads/${UUID}|qualification-staging/[A-Za-z0-9_-]+/${UUID})$`, "i");

function validateKey(key: string) {
  if (!/^[A-Za-z0-9_./-]+$/.test(key) || key.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Invalid private object key");
  }
}

function localUploadOrigin(): string {
  const value = process.env.LOCAL_PRIVATE_STORAGE_ORIGIN;
  if (!value) throw new Error("LOCAL_PRIVATE_STORAGE_ORIGIN must be the browser-facing API origin");
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("LOCAL_PRIVATE_STORAGE_ORIGIN must be an HTTPS origin (HTTP is allowed only for loopback)");
  }
  return url.origin;
}

export async function localStorageRoot(): Promise<string> {
  const configured = process.env.LOCAL_PRIVATE_STORAGE_DIR;
  if (!configured || !path.isAbsolute(configured)) {
    throw new Error("LOCAL_PRIVATE_STORAGE_DIR must be an absolute private directory outside the project");
  }
  const root = path.resolve(configured);
  let project = path.resolve(process.cwd());
  if (project.endsWith("/artifacts/api-server")) project = path.resolve(project, "../..");
  if (root === path.parse(root).root || root === project || root.startsWith(`${project}${path.sep}`)) {
    throw new Error("Local private storage must be outside the project and public directories");
  }
  // Refuse symlinks in every component, including parents, before creating files.
  let current = path.parse(root).root;
  for (const part of root.slice(current.length).split(path.sep)) {
    current = path.join(current, part);
    try { await mkdir(current, { mode: 0o700 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Private storage cannot use symbolic links");
  }
  const info = await lstat(root);
  if (info.uid !== process.getuid?.()) throw new Error("Private storage must belong to the API process user");
  await chmod(root, 0o700);
  return root;
}

async function secret(root: string): Promise<Buffer> {
  const filename = path.join(root, ".upload-signing-key");
  const temporary = `${filename}.${randomUUID()}.tmp`;
  const writer = await open(temporary, "wx", 0o600);
  try {
    try { await writer.writeFile(randomBytes(32)); await writer.sync(); }
    finally { await writer.close(); }
    try { await link(temporary, filename); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  } finally { await unlink(temporary); }
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0 || info.size !== 32) {
      throw new Error("Private upload signing key has unsafe permissions or invalid contents");
    }
    return await handle.readFile();
  } finally { await handle.close(); }
}

export async function signLocalUpload(key: string, expiresAt: Date): Promise<string> {
  const origin = localUploadOrigin();
  validateKey(key);
  if (!stagingKey.test(key)) throw new Error("Only temporary upload keys may be signed");
  const remaining = expiresAt.getTime() - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 900_000) throw new Error("Unsafe upload expiry");
  const root = await localStorageRoot();
  const payload = Buffer.from(JSON.stringify({ key, expires: expiresAt.getTime() })).toString("base64url");
  const signature = createHmac("sha256", await secret(root)).update(payload).digest("base64url");
  return `${origin}/api/storage/local-upload?token=${payload}.${signature}`;
}

export async function verifyLocalUpload(token: unknown): Promise<string> {
  if (typeof token !== "string" || token.length > 2048) throw new Error("Invalid upload token");
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) throw new Error("Invalid upload token");
  const root = await localStorageRoot();
  const expected = createHmac("sha256", await secret(root)).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error("Invalid upload token");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (typeof decoded.key !== "string" || !stagingKey.test(decoded.key) ||
      !Number.isSafeInteger(decoded.expires) || decoded.expires <= Date.now() || decoded.expires > Date.now() + 900_000) {
    throw new Error("Invalid or expired upload token");
  }
  validateKey(decoded.key);
  return decoded.key;
}

// Bytes and metadata share one atomically published inode, not separate sidecars.
// Hashed filenames avoid path traversal; no filesystem path is ever a public URL.
export class LocalPrivateFile implements PrivateFile {
  readonly bucket = { file: (name: string) => new LocalPrivateFile(name) };
  constructor(readonly name: string) { validateKey(name); }

  private async filename() {
    return path.join(await localStorageRoot(), createHash("sha256").update(this.name).digest("hex"));
  }

  private async snapshot(): Promise<{ metadata: FileMetadata; content: Buffer }> {
    const handle = await open(await this.filename(), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > MAX_LOCAL_UPLOAD_BYTES + 65540) throw new Error("Invalid private object");
      const data = await handle.readFile();
      const length = data.readUInt32BE(0);
      if (length > 65536 || length + 4 > data.length) throw new Error("Invalid private object metadata");
      return { metadata: JSON.parse(data.subarray(4, 4 + length).toString()), content: data.subarray(4 + length) };
    } finally { await handle.close(); }
  }

  async exists(): Promise<[boolean]> {
    try { await this.getMetadata(); return [true]; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return [false]; throw error; }
  }
  async getMetadata(): Promise<[FileMetadata]> {
    const { metadata, content } = await this.snapshot();
    return [{ ...metadata, size: String(content.length) }];
  }
  async download(): Promise<[Buffer]> { return [(await this.snapshot()).content]; }
  createReadStream(): Readable {
    const self = this;
    return Readable.from((async function* () { yield (await self.download())[0]; })());
  }
  createWriteStream(options: WriteOptions = {}): Writable {
    const chunks: Buffer[] = [];
    let size = 0;
    return new Writable({
      write(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        if (size > MAX_LOCAL_UPLOAD_BYTES) { callback(new Error("Private upload exceeds size limit")); return; }
        chunks.push(Buffer.from(chunk)); callback();
      },
      final: (callback) => { this.save(Buffer.concat(chunks), options).then(() => callback(), callback); },
    });
  }
  private async publish(content: Buffer, metadata: FileMetadata, createOnly: boolean) {
    if (content.length > MAX_LOCAL_UPLOAD_BYTES) throw new Error("Private upload exceeds size limit");
    const filename = await this.filename();
    const temporary = `${filename}.${randomUUID()}.tmp`;
    const json = Buffer.from(JSON.stringify(metadata));
    if (json.length > 65536) throw new Error("Private object metadata exceeds limit");
    const header = Buffer.alloc(4); header.writeUInt32BE(json.length);
    const handle = await open(temporary, "wx", 0o600);
    try {
      try {
        await handle.writeFile(Buffer.concat([header, json, content]));
        await handle.sync();
      } finally { await handle.close(); }
      if (createOnly) await link(temporary, filename);
      else await rename(temporary, filename);
    } finally { await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; }); }
  }
  async save(content: Buffer, options: WriteOptions = {}) {
    // Final evidence is always create-only, even if the caller omits a precondition.
    const createOnly = !stagingKey.test(this.name) || options.preconditionOpts?.ifGenerationMatch === 0;
    await this.publish(content, { ...options.metadata, contentType: options.contentType ?? options.metadata?.contentType }, createOnly);
  }
  async setMetadata(metadata: FileMetadata) {
    const snapshot = await this.snapshot();
    await this.publish(snapshot.content, { ...snapshot.metadata, ...metadata,
      metadata: { ...snapshot.metadata.metadata, ...metadata.metadata } }, false);
  }
  async delete(options: { ignoreNotFound?: boolean } = {}) {
    try { await unlink(await this.filename()); }
    catch (error) { if (!options.ignoreNotFound || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}

export async function localStorageReady(): Promise<boolean> {
  localUploadOrigin();
  const root = await localStorageRoot();
  await secret(root);
  const probe = new LocalPrivateFile(`readiness/${randomUUID()}`);
  const bytes = randomBytes(16);
  try {
    await probe.save(bytes);
    if (!(await probe.download())[0].equals(bytes)) throw new Error("Private storage round trip failed");
  } finally { await probe.delete({ ignoreNotFound: true }); }
  return true;
}
