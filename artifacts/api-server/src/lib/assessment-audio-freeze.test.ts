import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import test from "node:test";
import {
  createFrozenAssessmentStoragePath,
  freezeValidatedAssessmentAudio,
} from "./assessment-audio-validation";
import { getStorageFile } from "./recitation-service";

test("validated audio is copied to an unsigned frozen object independent of later upload-key changes", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "assessment-freeze-test-"));
  const validatedAudioPath = path.join(temporaryDirectory, "validated.private");
  const validatedBytes = Buffer.from("validated recording bytes");
  await writeFile(validatedAudioPath, validatedBytes, { mode: 0o600 });

  let originalUploadBytes = Buffer.from(validatedBytes);
  let frozenBytes = Buffer.alloc(0);
  let destinationObjectName = "";
  let destinationMetadata: Record<string, unknown> | undefined;
  let destinationPreconditions: Record<string, unknown> | undefined;
  const uploadFile = {
    name: "private-bucket/uploads/signed-upload-id",
    bucket: {
      file(name: string) {
        destinationObjectName = name;
        const destination = new Writable({
          write(chunk, _encoding, callback) {
            frozenBytes = Buffer.concat([frozenBytes, Buffer.from(chunk)]);
            callback();
          },
        });
        return {
          createWriteStream(options: {
            metadata?: Record<string, unknown>;
            preconditionOpts?: Record<string, unknown>;
          }) {
            destinationMetadata = options.metadata;
            destinationPreconditions = options.preconditionOpts;
            return destination;
          },
          async delete() {},
        };
      },
    },
  } as unknown as Awaited<ReturnType<typeof getStorageFile>>;
  try {
    const reservedFrozenPath = createFrozenAssessmentStoragePath(
      "/objects/uploads/signed-upload-id",
      () => "frozen-snapshot-id",
    );
    const frozenStoragePath = await freezeValidatedAssessmentAudio(
      validatedAudioPath,
      "/objects/uploads/signed-upload-id",
      reservedFrozenPath,
      "audio/webm",
      uploadFile,
      async () => {},
    );
    originalUploadBytes = Buffer.from("attacker replacement after validation");

    assert.equal(frozenStoragePath, "/objects/assessment-audio/frozen/frozen-snapshot-id");
    assert.equal(destinationObjectName, "private-bucket/assessment-audio/frozen/frozen-snapshot-id");
    assert.deepEqual(frozenBytes, validatedBytes);
    assert.notDeepEqual(originalUploadBytes, frozenBytes);
    assert.deepEqual(destinationMetadata, { contentType: "audio/webm" });
    assert.deepEqual(destinationPreconditions, { ifGenerationMatch: 0 });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});