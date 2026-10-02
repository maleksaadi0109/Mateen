import { randomUUID } from "node:crypto";
import { Storage, type File } from "@google-cloud/storage";
import { scanForMalware } from "./malware-scanner";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export class QualificationRejectedError extends Error {}

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function storageLocation(path: string) {
  const parts = path.replace(/^\/+/, "").split("/");
  const bucket = parts.shift();
  if (!bucket || parts.length === 0 || parts.some((part) => !part)) {
    throw new Error("Qualification storage is not configured correctly");
  }
  return { bucket, object: parts.join("/") };
}

function privatePrefix() {
  const directory = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (!directory) throw new Error("Private App Storage is not configured");
  return directory.replace(/\/+$/, "");
}

function objectFile(objectPath: string): File {
  const location = storageLocation(objectPath);
  return storage.bucket(location.bucket).file(location.object);
}

function objectPath(kind: "staging" | "clean", owner: string, id: string) {
  const prefix = kind === "staging" ? "qualification-staging" : "qualification";
  return `${privatePrefix()}/${prefix}/${owner}/${id}`;
}

async function signUploadUrl(path: string) {
  const location = storageLocation(path);
  const response = await fetch(`${SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: location.bucket,
      object_name: location.object,
      method: "PUT",
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("Could not create a private upload URL");
  const payload = (await response.json()) as { signed_url?: unknown };
  if (typeof payload.signed_url !== "string") {
    throw new Error("Private storage returned an invalid upload URL");
  }
  return payload.signed_url;
}

export async function createQualificationUpload(ownerId: string) {
  const id = randomUUID();
  const stagingObject = objectPath("staging", ownerId, id);
  return {
    id,
    stagingObject,
    uploadURL: await signUploadUrl(stagingObject),
  };
}

function signatureMatches(content: Buffer, contentType: string) {
  if (contentType === "application/pdf") {
    return content.subarray(0, 5).toString("ascii") === "%PDF-";
  }
  if (contentType === "image/jpeg") {
    return content.length >= 3 &&
      content[0] === 0xff &&
      content[1] === 0xd8 &&
      content[2] === 0xff;
  }
  if (contentType === "image/png") {
    return content.length >= 8 &&
      content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  return false;
}


export async function validateAndPromoteQualification(
  ownerId: string,
  id: string,
  stagingObject: string,
  size: number,
  contentType: string,
) {
  const expectedStaging = objectPath("staging", ownerId, id);
  if (stagingObject !== expectedStaging) {
    throw new QualificationRejectedError("Qualification upload ownership could not be verified");
  }
  const stagingFile = objectFile(stagingObject);
  const [metadata] = await stagingFile.getMetadata();
  const actualSize = Number(metadata.size);
  if (!Number.isSafeInteger(actualSize) || actualSize !== size || actualSize > MAX_DOCUMENT_BYTES) {
    throw new QualificationRejectedError("Uploaded document size does not match the declared size");
  }
  if (metadata.contentType && metadata.contentType !== contentType) {
    throw new QualificationRejectedError("Uploaded document type does not match the declared type");
  }
  const [content] = await stagingFile.download();
  if (content.byteLength !== size || !signatureMatches(content, contentType)) {
    throw new QualificationRejectedError("Uploaded document does not match its declared file type");
  }

  // Approval fails closed when ClamAV is missing, unavailable, times out, or reports an error.
  try {
    await scanForMalware(content);
  } catch (error) {
    if (error instanceof Error && error.message === "Malware was detected") {
      throw new QualificationRejectedError("Malware was detected");
    }
    throw error;
  }
  const cleanObject = objectPath("clean", ownerId, id);
  // The PUT URL remains usable briefly. Persist the exact scanned bytes rather
  // than copying a staging object that the uploader could replace after scan.
  await objectFile(cleanObject).save(content, {
    resumable: false,
    contentType,
    preconditionOpts: { ifGenerationMatch: 0 },
  });
  await stagingFile.delete({ ignoreNotFound: true });
  return cleanObject;
}

export async function discardQualificationObject(path: string) {
  const allowedPrefixes = [
    `${privatePrefix()}/qualification/`,
    `${privatePrefix()}/qualification-staging/`,
  ];
  if (!allowedPrefixes.some((prefix) => path.startsWith(prefix))) {
    throw new Error("Invalid private qualification object reference");
  }
  await objectFile(path).delete({ ignoreNotFound: true });
}

export async function streamQualificationObject(path: string) {
  const expectedPrefix = `${privatePrefix()}/qualification/`;
  if (!path.startsWith(expectedPrefix)) {
    throw new Error("Invalid private qualification object reference");
  }
  const file = objectFile(path);
  const [exists] = await file.exists();
  if (!exists) throw new Error("Qualification document is unavailable");
  return file.createReadStream();
}