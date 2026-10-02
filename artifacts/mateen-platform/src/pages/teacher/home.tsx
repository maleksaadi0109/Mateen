import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetTeacherQueryKey, useGetTeacher, useSaveTeacher } from '@workspace/api-client-react';
import { CheckCircle2, Clock, FileEdit } from 'lucide-react';
import { ErrorState, LoadingList, Notice, PageHeader } from '@/components/mateen/bits';
import { num, usePageMeta } from '@/lib/mateen';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';

const STATUS = {
  draft: { t: 'مسودة', d: 'طلبك محفوظ مسودةً ولم يُرسل للمراجعة. رفع الوثائق وإرسال الطلب لم يُبنيا بعد في هذا الإصدار.', I: FileEdit },
  pending_review: { t: 'قيد المراجعة', d: 'طلبك قيد مراجعة المنصة. لا تستقبل إحالات قبل الاعتماد.', I: Clock },
  approved: { t: 'معتمد', d: 'اعتمدت المنصة ملفك.', I: CheckCircle2 },
} as const;

export default function TeacherHome() {
  usePageMeta('ملف المعلم | مَتِين', 'ملفك العلمي وحالة طلب الاعتماد.');
  const q = useGetTeacher({ query: { enabled: true, queryKey: getGetTeacherQueryKey() } });
  const save = useSaveTeacher();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [bio, setBio] = useState('');
  const [spec, setSpec] = useState('');
  const [avail, setAvail] = useState(false);
  const inited = useRef(false);
  useEffect(() => {
    if (q.data && !inited.current) { inited.current = true; setBio(q.data.biography); setSpec(q.data.specialties); setAvail(q.data.available); }
  }, [q.data]);

  if (q.isLoading) return <LoadingList />;
  if (q.isError || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  const s = STATUS[q.data.status];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate({ data: { biography: bio.trim(), specialties: spec.trim(), available: avail } }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetTeacherQueryKey() }); toast({ title: 'تم حفظ الملف' }); },
      onError: () => toast({ title: 'تعذّر الحفظ', description: 'حاول مرة أخرى.', variant: 'destructive' }),
    });
  };

  return (
    <div>
      <PageHeader eyebrow="المعلم" title="ملفك العلمي وطلب الاعتماد">يُحفظ هنا ملفك مسودةً. الاعتماد قرار تتخذه المنصة، ولا يمكنك تغييره بنفسك.</PageHeader>
      <div className="paper-card star-pattern mb-6 flex items-start gap-5 p-7" data-testid="status-teacher">
        <s.I className="mt-1 text-secondary" size={28} />
        <div><p className="font-ui text-sm text-muted-foreground">حالة الطلب</p><p className="font-display text-2xl font-bold">{s.t}</p><p className="mt-1 font-arabic text-lg leading-loose text-muted-foreground">{s.d}</p></div>
      </div>
      <form onSubmit={submit} className="paper-card space-y-6 p-7" data-testid="form-teacher">
        <div>
          <label htmlFor="bio" className="font-ui text-sm font-bold">نبذة علمية</label>
          <textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={2000} rows={7} placeholder="مسيرتك العلمية، ومن أخذت عنهم، وما درّسته."
            className="mt-2 w-full rounded-xl border bg-background px-4 py-3 font-arabic text-lg leading-loose outline-none focus:border-secondary" data-testid="input-biography" />
          <p className="text-left font-ui text-xs text-muted-foreground">{num(bio.length)} / {num(2000)}</p>
        </div>
        <div>
          <label htmlFor="spec" className="font-ui text-sm font-bold">التخصصات</label>
          <input id="spec" value={spec} onChange={(e) => setSpec(e.target.value)} maxLength={300} placeholder="مثل: الحديث، العقيدة، التجويد" className="mt-2 w-full rounded-xl border bg-background px-4 py-3 font-ui outline-none focus:border-secondary" data-testid="input-specialties" />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl border bg-background p-4">
          <div><p className="font-ui font-bold">متاح لاستقبال الإحالات</p><p className="font-ui text-xs text-muted-foreground">لا يُتاح تغيير التوفر إلا بعد اعتماد ملفك.</p></div>
          <Switch checked={avail} onCheckedChange={setAvail} disabled={q.data.status !== 'approved' || save.isPending} aria-label="التوفر" data-testid="switch-available" />
        </div>
        <Notice tone="brown" title="الوثائق والإجازات">رفع الوثائق ومراجعتها غير متاحين بعد. لا يُعد حفظ هذا النموذج تقديماً للاعتماد.</Notice>
        <button type="submit" disabled={save.isPending} className="rounded-full bg-secondary px-8 py-3 font-ui font-bold text-secondary-foreground disabled:opacity-50" data-testid="button-save-teacher">{save.isPending ? 'جارٍ الحفظ…' : 'حفظ المسودة'}</button>
      </form>
    </div>
  );
}
