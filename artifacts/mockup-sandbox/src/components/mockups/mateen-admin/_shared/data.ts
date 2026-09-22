export type Page =
  | "overview"
  | "users"
  | "approvals"
  | "content"
  | "assessment"
  | "sources"
  | "referrals"
  | "audit";

export type Role = "student" | "teacher" | "assistant" | "admin";
export type UserStatus = "active" | "pending" | "suspended";

export interface User {
  id: string;
  name: string;
  role: Role;
  status: UserStatus;
  city: string;
  joined: string;
  track: string;
  lastSeen: string;
  note: string;
}

export type AppStatus = "pending" | "approved" | "clarify" | "rejected";

export interface TeacherApp {
  id: string;
  userId: string;
  name: string;
  city: string;
  submitted: string;
  bio: string;
  ijazat: { text: string; sheikh: string; year: string }[];
  document: { title: string; pages: number; kind: string };
  tracks: string[];
  status: AppStatus;
  reason?: string;
}

export type TextStatus = "published" | "draft" | "review";
export type Level = "تمهيدي" | "أول" | "ثانٍ";

export interface ContentText {
  id: string;
  trackId: string;
  title: string;
  author: string;
  level: Level;
  units: number;
  lines: number;
  status: TextStatus;
  updated: string;
  description: string;
}

export interface Track {
  id: string;
  name: string;
  short: string;
}

export interface Source {
  id: string;
  textId: string;
  title: string;
  edition: string;
  reviewer: string;
  status: "verified" | "pending" | "flagged";
  note: string;
  submitted: string;
}

export interface Referral {
  id: string;
  studentId: string;
  student: string;
  assistant: string;
  topic: string;
  track: string;
  created: string;
  status: "open" | "assigned" | "closed";
  teacherId?: string;
}

export interface Teacher {
  id: string;
  name: string;
  tracks: string[];
  capacity: number;
  load: number;
}

export interface AuditEntry {
  id: number;
  at: string;
  actor: string;
  action: string;
  target: string;
  kind: "create" | "update" | "approve" | "reject" | "delete" | "system";
}

export const roleLabel: Record<Role, string> = {
  student: "طالب",
  teacher: "معلم",
  assistant: "مساعد",
  admin: "مشرف",
};

export const userStatusLabel: Record<UserStatus, string> = {
  active: "نشط",
  pending: "قيد المراجعة",
  suspended: "موقوف",
};

export const appStatusLabel: Record<AppStatus, string> = {
  pending: "بانتظار المراجعة",
  approved: "مقبول",
  clarify: "طُلب توضيح",
  rejected: "مرفوض",
};

export const textStatusLabel: Record<TextStatus, string> = {
  published: "منشور",
  draft: "مسودة",
  review: "قيد المراجعة",
};

export const tracks: Track[] = [
  { id: "aqidah", name: "العقيدة", short: "عق" },
  { id: "hadith", name: "الحديث", short: "حد" },
  { id: "tajwid", name: "التجويد والقراءات", short: "تج" },
];

export const initialTexts: ContentText[] = [
  {
    id: "t1",
    trackId: "aqidah",
    title: "نواقض الإسلام",
    author: "الإمام محمد بن عبد الوهاب",
    level: "تمهيدي",
    units: 10,
    lines: 34,
    status: "published",
    updated: "منذ 3 أيام",
    description: "متن مختصر في عشرة نواقض، يُحفظ نصًا مع ضبط الألفاظ قبل الانتقال إلى القواعد الأربع.",
  },
  {
    id: "t2",
    trackId: "aqidah",
    title: "القواعد الأربع",
    author: "الإمام محمد بن عبد الوهاب",
    level: "أول",
    units: 4,
    lines: 61,
    status: "published",
    updated: "منذ أسبوع",
    description: "المستوى الأول في مسار العقيدة، يُشترط لدخوله إتمام تقييم متن نواقض الإسلام بقسميه.",
  },
  {
    id: "t3",
    trackId: "hadith",
    title: "الأربعون النووية",
    author: "الإمام النووي",
    level: "تمهيدي",
    units: 42,
    lines: 210,
    status: "published",
    updated: "أمس",
    description: "اثنان وأربعون حديثًا، تُحفظ الأحاديث بألفاظها مع ذكر الراوي ومخرِّج الحديث.",
  },
  {
    id: "t4",
    trackId: "tajwid",
    title: "تحفة الأطفال",
    author: "الشيخ سليمان الجمزوري",
    level: "تمهيدي",
    units: 8,
    lines: 61,
    status: "published",
    updated: "منذ 5 أيام",
    description: "منظومة في أحكام النون الساكنة والتنوين والميم الساكنة والمدود، تُحفظ نظمًا.",
  },
];

export const initialUsers: User[] = [
  { id: "u1", name: "عبد الرحمن الحربي", role: "student", status: "active", city: "الرياض", joined: "12 محرم", track: "العقيدة", lastSeen: "قبل ساعة", note: "أتم تمهيدي نواقض الإسلام، ينتظر تقييم الانتقال." },
  { id: "u2", name: "مريم القحطاني", role: "student", status: "active", city: "جدة", joined: "3 صفر", track: "الحديث", lastSeen: "قبل 20 دقيقة", note: "في الحديث السابع عشر من الأربعين." },
  { id: "u3", name: "يوسف العمري", role: "teacher", status: "active", city: "المدينة", joined: "27 ذو الحجة", track: "الحديث", lastSeen: "أمس", note: "معلم موثّق، حلقتان أسبوعيًا." },
  { id: "u4", name: "خالد المطيري", role: "teacher", status: "pending", city: "مكة", joined: "9 صفر", track: "العقيدة", lastSeen: "قبل 3 ساعات", note: "طلب اعتماد معلم قيد المراجعة." },
  { id: "u5", name: "سارة الزهراني", role: "assistant", status: "active", city: "الدمام", joined: "15 محرم", track: "التجويد والقراءات", lastSeen: "قبل 10 دقائق", note: "مساعدة توجيه، تحيل الاستفسارات العلمية إلى المعلمين." },
  { id: "u6", name: "أحمد الشهري", role: "student", status: "suspended", city: "أبها", joined: "1 محرم", track: "التجويد والقراءات", lastSeen: "منذ أسبوعين", note: "أوقف مؤقتًا بطلب منه لانشغال دراسي." },
  { id: "u7", name: "نورة العتيبي", role: "teacher", status: "pending", city: "الرياض", joined: "11 صفر", track: "التجويد والقراءات", lastSeen: "قبل يوم", note: "طلب اعتماد معلمة، الوثائق مكتملة." },
  { id: "u8", name: "فهد الدوسري", role: "student", status: "active", city: "الخبر", joined: "22 محرم", track: "العقيدة", lastSeen: "قبل 4 ساعات", note: "دخل مباشرةً إلى تقييم تحديد المستوى." },
  { id: "u9", name: "لمى السبيعي", role: "assistant", status: "active", city: "الرياض", joined: "5 محرم", track: "الحديث", lastSeen: "قبل ساعتين", note: "مساعدة، 6 إحالات مفتوحة." },
  { id: "u10", name: "إبراهيم الغامدي", role: "teacher", status: "pending", city: "الطائف", joined: "13 صفر", track: "الحديث", lastSeen: "قبل 6 ساعات", note: "طلب اعتماد، الإجازة بحاجة إلى توضيح." },
  { id: "u11", name: "هند البقمي", role: "student", status: "active", city: "جدة", joined: "18 محرم", track: "الحديث", lastSeen: "قبل 40 دقيقة", note: "" },
  { id: "u12", name: "طارق الشمري", role: "admin", status: "active", city: "الرياض", joined: "1 ذو القعدة", track: "—", lastSeen: "الآن", note: "مشرف عام." },
  { id: "u13", name: "ريم الجهني", role: "student", status: "pending", city: "ينبع", joined: "14 صفر", track: "التجويد والقراءات", lastSeen: "قبل يوم", note: "بانتظار تأكيد البريد." },
  { id: "u14", name: "سلطان العنزي", role: "teacher", status: "active", city: "حائل", joined: "20 ذو الحجة", track: "العقيدة", lastSeen: "قبل 30 دقيقة", note: "معلم موثّق في مسار العقيدة." },
];

export const initialApps: TeacherApp[] = [
  {
    id: "a1",
    userId: "u4",
    name: "خالد المطيري",
    city: "مكة",
    submitted: "9 صفر",
    bio: "درّست متون العقيدة في حلقات مسجدية لمدة ثماني سنوات، وأجازني شيخي في متن نواقض الإسلام والقواعد الأربع بالسند المتصل. أرغب في الإشراف على طلاب المستوى التمهيدي.",
    ijazat: [
      { text: "نواقض الإسلام", sheikh: "الشيخ عبد الله بن صالح", year: "1436هـ" },
      { text: "القواعد الأربع", sheikh: "الشيخ عبد الله بن صالح", year: "1437هـ" },
    ],
    document: { title: "صورة الإجازة الخطية", pages: 2, kind: "PDF" },
    tracks: ["العقيدة"],
    status: "pending",
  },
  {
    id: "a2",
    userId: "u7",
    name: "نورة العتيبي",
    city: "الرياض",
    submitted: "11 صفر",
    bio: "مجازة في تحفة الأطفال والجزرية، وأقمت دورات في أحكام التجويد للنساء منذ 1439هـ. أطلب الاعتماد في مسار التجويد والقراءات للمستوى التمهيدي.",
    ijazat: [
      { text: "تحفة الأطفال", sheikh: "الشيخة فاطمة الحسني", year: "1439هـ" },
      { text: "المقدمة الجزرية", sheikh: "الشيخة فاطمة الحسني", year: "1440هـ" },
    ],
    document: { title: "إجازة موقّعة ومختومة", pages: 3, kind: "PDF" },
    tracks: ["التجويد والقراءات"],
    status: "pending",
  },
  {
    id: "a3",
    userId: "u10",
    name: "إبراهيم الغامدي",
    city: "الطائف",
    submitted: "13 صفر",
    bio: "حافظ للأربعين النووية وشرحها، وقرأتها على أحد المشايخ دون تحرير إجازة مكتوبة. أرفقت تزكية خطية من الشيخ.",
    ijazat: [{ text: "الأربعون النووية", sheikh: "الشيخ محمد العوفي", year: "1441هـ (تزكية)" }],
    document: { title: "تزكية خطية", pages: 1, kind: "صورة" },
    tracks: ["الحديث"],
    status: "pending",
  },
  {
    id: "a4",
    userId: "u14",
    name: "سلطان العنزي",
    city: "حائل",
    submitted: "20 ذو الحجة",
    bio: "معلم عقيدة، مجاز في المتون الثلاثة الأصول ونواقض الإسلام.",
    ijazat: [{ text: "نواقض الإسلام", sheikh: "الشيخ ناصر الحمد", year: "1435هـ" }],
    document: { title: "صورة الإجازة", pages: 1, kind: "PDF" },
    tracks: ["العقيدة"],
    status: "approved",
  },
];

export const initialSources: Source[] = [
  { id: "s1", textId: "t3", title: "الأربعون النووية — طبعة دار المنهاج", edition: "تحقيق: قصي الحلاق، 1430هـ", reviewer: "يوسف العمري", status: "verified", note: "مطابقة لنسخة المعهد، اعتُمدت للعرض.", submitted: "5 محرم" },
  { id: "s2", textId: "t1", title: "نواقض الإسلام — ضمن مجموعة التوحيد", edition: "دار ابن الجوزي، 1428هـ", reviewer: "سلطان العنزي", status: "verified", note: "ضبط الألفاظ مراجَع.", submitted: "9 محرم" },
  { id: "s3", textId: "t4", title: "تحفة الأطفال — نسخة مضبوطة بالشكل", edition: "مكتبة الرشد، 1432هـ", reviewer: "—", status: "pending", note: "بانتظار تعيين مراجع من معلمي التجويد.", submitted: "12 صفر" },
  { id: "s4", textId: "t2", title: "القواعد الأربع — نسخة مضبوطة", edition: "دار العاصمة، 1425هـ", reviewer: "سلطان العنزي", status: "flagged", note: "اختلاف في لفظة واحدة في القاعدة الثالثة بين النسختين، يحتاج قرارًا.", submitted: "10 صفر" },
  { id: "s5", textId: "t3", title: "الأربعون النووية — نسخة صوتية مرجعية", edition: "قراءة: يوسف العمري", reviewer: "—", status: "pending", note: "تسجيل مرجعي للأداء الشفهي، بحاجة إلى مراجعة ثانية.", submitted: "14 صفر" },
];

export const initialTeachers: Teacher[] = [
  { id: "u3", name: "يوسف العمري", tracks: ["الحديث"], capacity: 8, load: 5 },
  { id: "u14", name: "سلطان العنزي", tracks: ["العقيدة"], capacity: 6, load: 6 },
];

export const initialReferrals: Referral[] = [
  { id: "r1", studentId: "u2", student: "مريم القحطاني", assistant: "لمى السبيعي", topic: "سؤال عن اختلاف لفظ في الحديث الرابع", track: "الحديث", created: "قبل ساعتين", status: "open" },
  { id: "r2", studentId: "u1", student: "عبد الرحمن الحربي", assistant: "لمى السبيعي", topic: "طلب تسميع شفهي للناقض السابع", track: "العقيدة", created: "قبل 5 ساعات", status: "open" },
  { id: "r3", studentId: "u8", student: "فهد الدوسري", assistant: "سارة الزهراني", topic: "استفسار عن أهلية الدخول المباشر للمستوى الأول", track: "العقيدة", created: "أمس", status: "assigned", teacherId: "u14" },
  { id: "r4", studentId: "u6", student: "أحمد الشهري", assistant: "سارة الزهراني", topic: "طلب مراجعة أحكام الإدغام في التحفة", track: "التجويد والقراءات", created: "منذ 3 أيام", status: "open" },
  { id: "r5", studentId: "u11", student: "هند البقمي", assistant: "لمى السبيعي", topic: "سؤال عن ضبط راوي الحديث العاشر", track: "الحديث", created: "منذ 4 أيام", status: "closed", teacherId: "u3" },
];

export const initialAudit: AuditEntry[] = [
  { id: 1, at: "اليوم 09:12", actor: "طارق الشمري", action: "نشر نص", target: "الأربعون النووية — تحديث الوحدة 17", kind: "update" },
  { id: 2, at: "اليوم 08:40", actor: "النظام", action: "استقبال طلب اعتماد", target: "إبراهيم الغامدي", kind: "system" },
  { id: 3, at: "أمس 21:05", actor: "طارق الشمري", action: "اعتماد مصدر", target: "نواقض الإسلام — دار ابن الجوزي", kind: "approve" },
  { id: 4, at: "أمس 17:30", actor: "طارق الشمري", action: "تعديل مسودة سياسة", target: "سياسة التقييم — القسم الكتابي", kind: "update" },
];

export const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
