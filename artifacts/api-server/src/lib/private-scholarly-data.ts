import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { getRecitationRuntimePaths } from "./recitation-readiness";
import type { Prepared, Collation } from "./private-scholarly-types";

/**
 * Private review packages are not part of a public source checkout.
 * Load only when a review operation accesses them; never invent a replacement.
 * Existing structural, hash and approval checks remain in the consuming services.
 */
let loaded: { prepared: Prepared; collation: Collation } | undefined;

export function getPrivateScholarlyPackage(): { prepared: Prepared; collation: Collation } {
  if (loaded) return loaded;
  const root = getRecitationRuntimePaths().root;
  function read<T>(file: "passages.json" | "collation.json"): T {
    const candidates = [
      path.join(root, "deliverables", "aljam3-commentary", file),
      path.join(root, "artifacts", "api-server", "dist", "private-scholarly-package", file),
    ];
    const location = candidates.find(existsSync);
    if (!location) {
      throw new Error("Private scholarly review package is unavailable. Restore authorised package files; no public or synthetic substitute is used.");
    }
    return JSON.parse(readFileSync(location, "utf8")) as T;
  }
  loaded = { prepared: read<Prepared>("passages.json"), collation: read<Collation>("collation.json") };
  return loaded;
}
