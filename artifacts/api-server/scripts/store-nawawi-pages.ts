/** Store owner-authorized edition pages privately; word-map review is separate. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { ObjectStorageService, objectStorageClient } from "../src/lib/objectStorage";
import { validatePageMap } from "../src/lib/recitation-pages";

const root = path.resolve(import.meta.dirname, "../../..");
const mapPath = path.join(root, "artifacts/api-server/src/data/nawawi-page-map.json");
const raw = JSON.parse(await readFile(mapPath, "utf8"));
const map = validatePageMap(raw);
const permission = JSON.parse(await readFile(path.join(root,
  "artifacts/api-server/src/data/nawawi-image-authorization.json"), "utf8"));
if (permission.status !== "owner-attested" || permission.sourcePdfHash !== map.sourcePdfHash ||
    !permission.uses.includes("page-images") || !permission.uses.includes("clipped-regions")) {
  throw new Error("This scan does not have the owner's image-use attestation.");
}
const storage = new ObjectStorageService();
const [bucket, ...prefix] = storage.getPrivateObjectDir().replace(/^\/+/, "").split("/");
// Full-page browsing is independent of word-map verification. The same
// owner permission explicitly covers both pages and recitation word crops.
const pages = new Set(map.pages.map(p => p.page));
for (const page of raw.pages) {
  if (!pages.has(page.page)) continue;
  const bytes = await readFile(path.join(root, "attached_assets/nawawi-page-source/pages", page.file));
  if (createHash("sha256").update(bytes).digest("hex") !== page.sha256) {
    throw new Error(`Changed edition bytes on page ${page.page}`);
  }
  const key = `nawawi-scans/${map.sourcePdfHash}/${page.sha256}.webp`;
  const file = objectStorageClient.bucket(bucket).file([...prefix, key].join("/"));
  try {
    await file.save(bytes, {resumable:false, contentType:"image/webp",
      preconditionOpts:{ifGenerationMatch:0},
      metadata:{cacheControl:"private, no-store"}});
  } catch (error) {
    if ((error as {code?:number}).code !== 412) throw error;
    const [existing] = await file.download();
    if (!existing.equals(bytes)) throw new Error("Existing private object differs.");
  }
  page.objectPath = `/objects/${key}`;
}
await writeFile(mapPath, `${JSON.stringify(raw, null, 2)}\n`);
console.log(`Stored ${pages.size} authorized edition page(s); no public URLs created.`);