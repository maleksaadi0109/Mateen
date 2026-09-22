import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  initialApps,
  initialAudit,
  initialReferrals,
  initialSources,
  initialTeachers,
  initialTexts,
  initialUsers,
  type AppStatus,
  type AuditEntry,
  type ContentText,
  type Page,
  type Referral,
  type Source,
  type Teacher,
  type TeacherApp,
  type User,
  type UserStatus,
} from "./data";

export interface AssessmentPolicy {
  oralWords: number;
  oralAttempts: number;
  oralPromptAllowed: boolean;
  writtenLines: number;
  writtenNoTashkeel: boolean;
  writtenMinutes: number;
  bothRequired: boolean;
  directPlacement: boolean;
  passThresholdNote: string;
  reviewer: string;
  status: "draft" | "submitted";
  version: number;
}

interface Store {
  page: Page;
  go: (p: Page, ctx?: Record<string, string>) => void;
  ctx: Record<string, string>;
  users: User[];
  apps: TeacherApp[];
  texts: ContentText[];
  sources: Source[];
  referrals: Referral[];
  teachers: Teacher[];
  audit: AuditEntry[];
  policy: AssessmentPolicy;
  toast: string | null;
  notify: (m: string) => void;
  log: (action: string, target: string, kind?: AuditEntry["kind"]) => void;
  setUserStatus: (id: string, s: UserStatus) => void;
  decideApp: (id: string, s: AppStatus, reason?: string) => void;
  upsertText: (t: ContentText) => void;
  deleteText: (id: string) => void;
  setPolicy: (p: AssessmentPolicy) => void;
  setSource: (id: string, patch: Partial<Source>, action: string) => void;
  assignReferral: (id: string, teacherId: string) => void;
  closeReferral: (id: string) => void;
  clearAudit: () => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("store");
  return s;
}

let auditSeq = 100;
const now = () => {
  const d = new Date();
  return `اليوم ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<Page>("overview");
  const [ctx, setCtx] = useState<Record<string, string>>({});
  const [users, setUsers] = useState(initialUsers);
  const [apps, setApps] = useState(initialApps);
  const [texts, setTexts] = useState(initialTexts);
  const [sources, setSources] = useState(initialSources);
  const [referrals, setReferrals] = useState(initialReferrals);
  const [teachers, setTeachers] = useState(initialTeachers);
  const [audit, setAudit] = useState(initialAudit);
  const [toast, setToast] = useState<string | null>(null);
  const [policy, setPolicyState] = useState<AssessmentPolicy>({
    oralWords: 40,
    oralAttempts: 2,
    oralPromptAllowed: false,
    writtenLines: 12,
    writtenNoTashkeel: true,
    writtenMinutes: 25,
    bothRequired: true,
    directPlacement: true,
    passThresholdNote: "لم تُحدَّد نسبة نجاح نهائية بعد؛ يُترك تقدير الإتقان لمعلم موثّق حتى اعتماد السياسة.",
    reviewer: "لجنة المناهج",
    status: "draft",
    version: 3,
  });

  const notify = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const log = useCallback((action: string, target: string, kind: AuditEntry["kind"] = "update") => {
    setAudit((a) => [{ id: ++auditSeq, at: now(), actor: "طارق الشمري", action, target, kind }, ...a]);
  }, []);

  const go = useCallback((p: Page, c: Record<string, string> = {}) => {
    setPage(p);
    setCtx(c);
    window.scrollTo({ top: 0 });
  }, []);

  const setUserStatus = useCallback(
    (id: string, s: UserStatus) => {
      setUsers((u) => u.map((x) => (x.id === id ? { ...x, status: s } : x)));
      const u = users.find((x) => x.id === id);
      log(s === "suspended" ? "إيقاف حساب" : s === "active" ? "تفعيل حساب" : "تحويل إلى المراجعة", u?.name ?? id, s === "suspended" ? "reject" : "approve");
      notify("حُدِّثت حالة الحساب (محليًا)");
    },
    [users, log, notify],
  );

  const decideApp = useCallback(
    (id: string, s: AppStatus, reason?: string) => {
      const app = apps.find((a) => a.id === id);
      setApps((a) => a.map((x) => (x.id === id ? { ...x, status: s, reason } : x)));
      if (app) {
        if (s === "approved") {
          setUsers((u) => u.map((x) => (x.id === app.userId ? { ...x, status: "active" } : x)));
          setTeachers((t) => (t.some((x) => x.id === app.userId) ? t : [...t, { id: app.userId, name: app.name, tracks: app.tracks, capacity: 6, load: 0 }]));
        }
        if (s === "rejected") setUsers((u) => u.map((x) => (x.id === app.userId ? { ...x, status: "suspended" } : x)));
        log(s === "approved" ? "اعتماد معلم" : s === "clarify" ? "طلب توضيح من متقدم" : "رفض طلب اعتماد", app.name, s === "approved" ? "approve" : s === "rejected" ? "reject" : "update");
      }
      notify(s === "approved" ? "اعتُمد المعلم وأُضيف إلى قائمة الإحالة" : s === "clarify" ? "أُرسل طلب التوضيح (محاكاة)" : "رُفض الطلب مع تسجيل السبب");
    },
    [apps, log, notify],
  );

  const upsertText = useCallback(
    (t: ContentText) => {
      setTexts((arr) => {
        const exists = arr.some((x) => x.id === t.id);
        return exists ? arr.map((x) => (x.id === t.id ? t : x)) : [...arr, t];
      });
      const exists = texts.some((x) => x.id === t.id);
      log(exists ? "تعديل نص" : "إنشاء مسودة نص", t.title, exists ? "update" : "create");
      notify(exists ? "حُفظ التعديل" : "أُنشئت المسودة — غير منشورة");
    },
    [texts, log, notify],
  );

  const deleteText = useCallback(
    (id: string) => {
      const t = texts.find((x) => x.id === id);
      setTexts((arr) => arr.filter((x) => x.id !== id));
      log("حذف نص", t?.title ?? id, "delete");
      notify("حُذف النص من النموذج");
    },
    [texts, log, notify],
  );

  const setPolicy = useCallback(
    (p: AssessmentPolicy) => {
      setPolicyState(p);
      log(p.status === "submitted" ? "رفع مسودة سياسة التقييم للاعتماد" : "حفظ مسودة سياسة التقييم", `الإصدار ${p.version}`, p.status === "submitted" ? "approve" : "update");
      notify(p.status === "submitted" ? "رُفعت المسودة إلى لجنة المناهج (محاكاة)" : "حُفظت المسودة");
    },
    [log, notify],
  );

  const setSource = useCallback(
    (id: string, patch: Partial<Source>, action: string) => {
      const s = sources.find((x) => x.id === id);
      setSources((arr) => arr.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      log(action, s?.title ?? id, patch.status === "verified" ? "approve" : patch.status === "flagged" ? "reject" : "update");
      notify("حُدِّث المصدر");
    },
    [sources, log, notify],
  );

  const assignReferral = useCallback(
    (id: string, teacherId: string) => {
      const r = referrals.find((x) => x.id === id);
      const t = teachers.find((x) => x.id === teacherId);
      setReferrals((arr) => arr.map((x) => (x.id === id ? { ...x, status: "assigned", teacherId } : x)));
      setTeachers((arr) => arr.map((x) => (x.id === teacherId ? { ...x, load: Math.min(x.capacity, x.load + 1) } : x)));
      log("إحالة إلى معلم موثّق", `${r?.student ?? ""} ← ${t?.name ?? ""}`, "approve");
      notify(`أُحيل الطلب إلى ${t?.name ?? "المعلم"}`);
    },
    [referrals, teachers, log, notify],
  );

  const closeReferral = useCallback(
    (id: string) => {
      const r = referrals.find((x) => x.id === id);
      setReferrals((arr) => arr.map((x) => (x.id === id ? { ...x, status: "closed" } : x)));
      if (r?.teacherId) setTeachers((arr) => arr.map((x) => (x.id === r.teacherId ? { ...x, load: Math.max(0, x.load - 1) } : x)));
      log("إغلاق إحالة", r?.topic ?? id);
      notify("أُغلقت الإحالة");
    },
    [referrals, log, notify],
  );

  const clearAudit = useCallback(() => {
    setAudit([]);
    notify("مُسح سجل النموذج محليًا");
  }, [notify]);

  const value = useMemo<Store>(
    () => ({
      page, go, ctx, users, apps, texts, sources, referrals, teachers, audit, policy, toast,
      notify, log, setUserStatus, decideApp, upsertText, deleteText, setPolicy, setSource, assignReferral, closeReferral, clearAudit,
    }),
    [page, go, ctx, users, apps, texts, sources, referrals, teachers, audit, policy, toast, notify, log, setUserStatus, decideApp, upsertText, deleteText, setPolicy, setSource, assignReferral, closeReferral, clearAudit],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
