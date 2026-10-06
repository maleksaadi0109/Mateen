import { fmt } from '@/lib/i18n';
import { tr } from '@/lib/i18n';
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { num } from '@/lib/mateen';

/** Render private PDF pages locally. Do not depend on a browser PDF plug-in. */
export default function PdfCertificateView({ source }: { source: string }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState('');
  const [rendering, setRendering] = useState(true);
  const [width, setWidth] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    let destroy: (() => void) | undefined;
    setDoc(null);
    setError('');
    setPage(1);
    setZoom(1);
    void (async () => {
      // The modern entry requires new Map/WeakMap methods absent in some supported browsers.
      const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs');
      if (!active) return;
      pdf.GlobalWorkerOptions.workerSrc = workerUrl;
      const task = pdf.getDocument({ url: source, useSystemFonts: true });
      destroy = () => { void task.destroy(); };
      const loaded = await task.promise;
      if (active) setDoc(loaded);
    })().catch(() => {
      if (active) setError(tr("تعذّر قراءة صفحات PDF. يمكنك تنزيل الملف والتحقق منه قبل اتخاذ القرار."));
    });
    return () => { active = false; destroy?.(); };
  }, [source]);

  useEffect(() => {
    if (!doc) return;
    let active = true;
    let cancel: (() => void) | undefined;
    setRendering(true);
    setError('');
    void (async () => {
      const pdfPage = await doc.getPage(page);
      if (!active || !canvas.current || !container.current) return;
      const sheet = canvas.current;
      const context = sheet.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable');
      const base = pdfPage.getViewport({ scale: 1 });
      const fit = Math.max(200, container.current.clientWidth - 18) / base.width;
      // Bound raster memory even for maliciously oversized page dimensions.
      const scale = Math.min(fit * zoom * Math.min(window.devicePixelRatio || 1, 2), Math.sqrt(4_000_000 / (base.width * base.height)));
      const viewport = pdfPage.getViewport({ scale });
      sheet.width = Math.ceil(viewport.width);
      sheet.height = Math.ceil(viewport.height);
      sheet.style.width = `${Math.ceil(base.width * fit * zoom)}px`;
      sheet.style.height = `${Math.ceil(base.height * fit * zoom)}px`;
      const task = pdfPage.render({ canvas: sheet, canvasContext: context, viewport });
      cancel = () => task.cancel();
      await task.promise;
      if (active) setRendering(false);
    })().catch((err: unknown) => {
      if (active) {
        if (import.meta.env.DEV) console.warn('PDF certificate render failed:', err instanceof Error ? err.message : 'Unknown renderer error');
        setRendering(false); setError(tr("تعذّر عرض هذه الصفحة. حاول صفحة أخرى أو نزّل الملف."));
      }
    });
    return () => { active = false; cancel?.(); };
  }, [doc, page, zoom, width]);

  return (
    <div className="min-w-0 space-y-2" data-testid="pdf-certificate-preview">
      {doc ? <div className="flex flex-wrap items-center justify-between gap-2 font-ui text-xs">
        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((n) => n - 1)} className="min-h-10 rounded-full border px-3 disabled:opacity-40">{tr("السابق")}</button>
          <span>{tr("صفحة")}{' '}{num(page)} / {num(doc.numPages)}</span>
          <button type="button" disabled={page >= doc.numPages} onClick={() => setPage((n) => n + 1)} className="min-h-10 rounded-full border px-3 disabled:opacity-40">{tr("التالي")}</button>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={zoom <= 1} onClick={() => setZoom((n) => Math.max(1, n - .5))} className="min-h-10 rounded-full border px-3 disabled:opacity-40">{tr("تصغير")}</button>
          <button type="button" disabled={zoom >= 3} onClick={() => setZoom((n) => Math.min(3, n + .5))} className="min-h-10 rounded-full border px-3 disabled:opacity-40">{tr("تكبير")}</button>
        </div>
      </div> : null}
      {error ? <p role="alert" className="font-ui text-sm text-red-700">{error}</p> : (!doc || rendering) ? <p role="status" className="font-ui text-xs">{tr("جارٍ عرض صفحة الشهادة…")}</p> : null}
      <div ref={container} className="h-[55dvh] min-w-0 overflow-auto rounded-xl border bg-muted p-2">
        <canvas ref={canvas} aria-label={fmt("صفحة {a} من الشهادة", "Certificate page {a}", { a: num(page) })} className="mx-auto block bg-white shadow-sm" data-testid="pdf-certificate-canvas" />
      </div>
    </div>
  );
}