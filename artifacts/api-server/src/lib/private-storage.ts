import type { FileMetadata } from "@google-cloud/storage";
import type { Readable, Writable } from "node:stream";

// The operations used by private media, implemented by GCS and standalone disk.
export interface PrivateFile {
  name: string;
  bucket: { file(name: string): PrivateFile };
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<[FileMetadata, ...unknown[]]>;
  setMetadata(metadata: FileMetadata): Promise<unknown>;
  download(): Promise<[Buffer, ...unknown[]]>;
  createReadStream(): Readable;
  createWriteStream(options?: WriteOptions): Writable;
  save(data: Buffer, options?: WriteOptions): Promise<unknown>;
  delete(options?: { ignoreNotFound?: boolean }): Promise<unknown>;
}

export interface WriteOptions {
  resumable?: boolean;
  contentType?: string;
  metadata?: FileMetadata;
  preconditionOpts?: { ifGenerationMatch?: number | string };
}

export function storageProvider(): "replit" | "local" {
  const provider = process.env.PRIVATE_STORAGE_PROVIDER ?? "replit";
  if (provider !== "replit" && provider !== "local") {
    throw new Error("PRIVATE_STORAGE_PROVIDER must be replit or local");
  }
  return provider;
}
