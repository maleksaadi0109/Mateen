import { tr } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { downloadQualificationDocument } from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { errMsg } from '@/lib/admin';
import PdfCertificateView from './PdfCertificateView';

/** Fetch through the authenticated private endpoint; never expose a storage URL. */
export default function DocPreview({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    let active = true;
    let objectUrl = '';
    const abort = new AbortController();
    setError('');
    setUrl('');
    downloadQualificationDocument(id, { signal: abort.signal }).then((data) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      setUrl(objectUrl);
    }).catch((err) => {
      if (active) setError(errMsg(err, tr("تعذّر عرض الشهادة.")));
    });
    return () => {
      active = false;
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, open]);
  return (
    <Dialog open={open} onOpenChange={(next) => { setUrl(''); setOpen(next); }}>
      <button type="button" onClick={() => { setUrl(''); setOpen(true); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 py-1 font-ui text-xs font-bold hover:bg-muted" data-testid={`button-preview-${id}`}>
        <Eye size={14} />{' '}{tr("عرض الشهادة")}</button>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle className="break-words pe-6">{name}</DialogTitle>
          <DialogDescription>{tr("وثيقة خاصة بالمعلم. عرضها لا يعني اعتماد صحة الشهادة أو منح المؤهل.")}</DialogDescription>
        </DialogHeader>
        {error ? <p role="alert" className="font-ui text-sm text-red-700">{error}</p> : !url ? <p role="status" className="font-ui text-sm">{tr("جارٍ تحميل الشهادة…")}</p> : (
          <>
            <PdfCertificateView source={url} />
            <a href={url} target="_blank" rel="noopener noreferrer" className="font-ui text-sm font-bold text-secondary underline">{tr("فتح PDF في نافذة مستقلة إذا لم تظهر المعاينة")}</a>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}