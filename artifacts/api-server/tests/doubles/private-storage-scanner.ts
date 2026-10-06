// Only the disposable HTTP bundle replaces the malware service. Storage, file
// signatures, promotion, ownership and all download handlers are production code.
export let scannerUnavailable = false;
export let scannedBytes = Buffer.alloc(0);
export function setScannerUnavailable(value: boolean) { scannerUnavailable = value; }
export async function scanForMalware(content: Buffer) {
  if (scannerUnavailable) throw new Error("Synthetic scanner unavailable");
  scannedBytes = Buffer.from(content);
}
