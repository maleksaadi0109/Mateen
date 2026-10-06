import { Router } from "express";
import { pipeline } from "node:stream/promises";
import { LocalPrivateFile, MAX_LOCAL_UPLOAD_BYTES, verifyLocalUpload } from "../lib/local-private-storage";
import { storageProvider } from "../lib/private-storage";

// Like a cloud signed PUT, this endpoint accepts only a short-lived bearer
// capability minted by the existing authenticated, owner-checked upload routes.
// There is deliberately no local storage GET endpoint.
const router = Router();
router.put("/storage/local-upload", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  if (storageProvider() !== "local") { res.status(404).end(); return; }
  let key: string;
  try { key = await verifyLocalUpload(req.query.token); }
  catch { res.status(403).json({ error: "Invalid or expired private upload URL" }); return; }
  if (Number(req.get("content-length")) > MAX_LOCAL_UPLOAD_BYTES) {
    res.status(413).json({ error: "Private upload exceeds the size limit" }); return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  timer.unref();
  try {
    await pipeline(req, new LocalPrivateFile(key).createWriteStream({
      contentType: req.get("content-type") ?? "application/octet-stream",
    }), { signal: controller.signal });
    res.status(204).end();
  } catch {
    if (!res.destroyed) res.status(413).json({ error: "Private upload failed or exceeded its limit" });
  } finally { clearTimeout(timer); }
});
export default router;
