import { storageProvider } from "../src/lib/private-storage";
import { localStorageReady } from "../src/lib/local-private-storage";
import { privateStorageReady } from "../src/lib/recitation-readiness";
import { logger } from "../src/lib/logger";

try {
  const provider = storageProvider();
  const ready = provider === "local" ? await localStorageReady() : await privateStorageReady();
  if (!ready) throw new Error("Managed private storage is unavailable: check private prefix and Replit object credentials");
  logger.info({ provider, ready: true }, "Private storage ready (audio decoding and document malware scanning are separate requirements)");
} catch (error) {
  // Configuration errors from the local adapter are actionable and never contain
  // signing material. Do not expose external provider errors or credential data.
  logger.error({ ready: false, reason: error instanceof Error ? error.message : "Invalid storage configuration" }, "Private storage not ready");
  process.exitCode = 1;
}
