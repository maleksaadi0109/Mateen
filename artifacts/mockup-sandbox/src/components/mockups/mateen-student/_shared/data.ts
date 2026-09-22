export const MOCK_LABEL = "نموذج تفاعلي — بيانات توضيحية";

export type PageKey =
  | "home"
  | "tracks"
  | "track"
  | "book"
  | "exam"
  | "performance"
  | "scholars"
  | "scholar"
  | "messages";

export interface Route {
  page: PageKey;
  trackId?: string;
  levelId?: string;
  scholarId?: string;
  threadId?: string;
}

export interface TextSection {
  id: string;
  title: string;
  body: string;
}

export interface Level {
  id: string;
  name: string;
  order: number;
  bookTitle: string;
  author: string;
  description: string;
  sections: TextSection[];
  /** Short well-known excerpts used only as the local sample prompt pool. */
  samplePool: string[];
  available: boolean;
}

export interface Track {
  id: string;
  name: string;
  subtitle: string;
  tone: "primary" | "secondary" | "tertiary";
  levels: Level[];
}

export const student = {
  name: "عبدالرحمن بن صالح الحربي",
  short: "عبدالرحمن",
  initials: "ع",
  joined: "ربيع الآخر ١٤٤٧",
  streakDays: 12,
  totalMinutes: 1436,
  memorizedSections: 9,
  weeklyGoalMinutes: 210,
  weeklyMinutes: 164,
};

export const tracks: Track[] = [
  {
    id: "aqeedah",
    name: "العقيدة",
    subtitle: "أصول الاعتقاد ونواقضه",
    tone: "primary",
    levels: [
      {
        id: "aqeedah-0",
        name: "المستوى التمهيدي",
        order: 0,
        bookTitle: "نواقض الإسلام",
        author: "الشيخ محمد بن عبدالوهاب",
        description:
          "متن مختصر في عشرة نواقض، يُحفظ نصًّا ويُراجع مع المشرف لضبط الترتيب والألفاظ.",
        available: true,
        sections: [
          { id: "n1", title: "الناقض الأول", body: "الشرك في عبادة الله." },
          {
            id: "n2",
            title: "الناقض الثاني",
            body: "من جعل بينه وبين الله وسائط يدعوهم ويسألهم الشفاعة ويتوكل عليهم كفر إجماعًا.",
          },
          {
            id: "n3",
            title: "الناقض الثالث",
            body: "من لم يكفر المشركين أو شك في كفرهم أو صحح مذهبهم كفر.",
          },
          {
            id: "n4",
            title: "الناقض الرابع",
            body: "من اعتقد أن غير هدي النبي صلى الله عليه وسلم أكمل من هديه، أو أن حكم غيره أحسن من حكمه فهو كافر.",
          },
          {
            id: "n5",
            title: "الناقض الخامس",
            body: "من أبغض شيئًا مما جاء به الرسول صلى الله عليه وسلم ولو عمل به كفر.",
          },
          {
            id: "n6",
            title: "الناقض السادس",
            body: "من استهزأ بشيء من دين الرسول صلى الله عليه وسلم أو ثوابه أو عقابه كفر.",
          },
          { id: "n7", title: "الناقض السابع", body: "السحر، ومنه الصرف والعطف، فمن فعله أو رضي به كفر." },
          {
            id: "n8",
            title: "الناقض الثامن",
            body: "مظاهرة المشركين ومعاونتهم على المسلمين.",
          },
          {
            id: "n9",
            title: "الناقض التاسع",
            body: "من اعتقد أن بعض الناس يسعه الخروج عن شريعة محمد صلى الله عليه وسلم فهو كافر.",
          },
          {
            id: "n10",
            title: "الناقض العاشر",
            body: "الإعراض عن دين الله لا يتعلمه ولا يعمل به.",
          },
        ],
        samplePool: [
          "الشرك في عبادة الله",
          "من لم يكفر المشركين أو شك في كفرهم أو صحح مذهبهم كفر",
          "مظاهرة المشركين ومعاونتهم على المسلمين",
          "الإعراض عن دين الله لا يتعلمه ولا يعمل به",
          "السحر ومنه الصرف والعطف فمن فعله أو رضي به كفر",
        ],
      },
      {
        id: "aqeedah-1",
        name: "المستوى الأول",
        order: 1,
        bookTitle: "القواعد الأربع",
        author: "الشيخ محمد بن عبدالوهاب",
        description:
          "رسالة وجيزة تقرر أربع قواعد في معرفة التوحيد، تُحفظ بعد إتقان المتن التمهيدي.",
        available: true,
        sections: [
          {
            id: "q0",
            title: "المقدمة",
            body: "اعلم أرشدك الله لطاعته أن الحنيفية ملة إبراهيم أن تعبد الله وحده مخلصًا له الدين.",
          },
          { id: "q1", title: "القاعدة الأولى", body: "(يُعرض النص المعتمد هنا بعد اعتماد المشرف)" },
          { id: "q2", title: "القاعدة الثانية", body: "(يُعرض النص المعتمد هنا بعد اعتماد المشرف)" },
          { id: "q3", title: "القاعدة الثالثة", body: "(يُعرض النص المعتمد هنا بعد اعتماد المشرف)" },
          { id: "q4", title: "القاعدة الرابعة", body: "(يُعرض النص المعتمد هنا بعد اعتماد المشرف)" },
        ],
        samplePool: [
          "اعلم أرشدك الله لطاعته أن الحنيفية ملة إبراهيم",
          "أن تعبد الله وحده مخلصا له الدين",
        ],
      },
    ],
  },
  {
    id: "hadith",
    name: "الحديث",
    subtitle: "جوامع الكلم النبوي",
    tone: "secondary",
    levels: [
      {
        id: "hadith-0",
        name: "المستوى التمهيدي",
        order: 0,
        bookTitle: "الأربعون النووية",
        author: "الإمام النووي",
        description:
          "اثنان وأربعون حديثًا جامعة، تُحفظ بألفاظها مع أسماء رواتها ومخرّجيها.",
        available: true,
        sections: [
          {
            id: "h1",
            title: "الحديث الأول",
            body: "عن أمير المؤمنين عمر بن الخطاب رضي الله عنه قال: سمعت رسول الله صلى الله عليه وسلم يقول: إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى…",
          },
          {
            id: "h2",
            title: "الحديث الثاني",
            body: "حديث جبريل في الإسلام والإيمان والإحسان (يُعرض النص المعتمد كاملًا في النسخة النهائية).",
          },
          {
            id: "h3",
            title: "الحديث الثالث",
            body: "بني الإسلام على خمس (يُعرض النص المعتمد كاملًا في النسخة النهائية).",
          },
          { id: "h4", title: "الحديث الرابع", body: "(يُعرض النص المعتمد هنا بعد اعتماد المشرف)" },
          { id: "h5", title: "الحديث الخامس", body: "(يُعرض النص المعتمد هنا بعد اعتماد المشرف)" },
          { id: "h6", title: "الحديث السادس", body: "(يُعرض النص المعتمد هنا بعد اعتماد المشرف)" },
        ],
        samplePool: [
          "إنما الأعمال بالنيات وإنما لكل امرئ ما نوى",
          "عن أمير المؤمنين عمر بن الخطاب رضي الله عنه قال",
        ],
      },
    ],
  },
  {
    id: "tajweed",
    name: "التجويد والقراءات",
    subtitle: "منظومات الأداء وضبط التلاوة",
    tone: "tertiary",
    levels: [
      {
        id: "tajweed-0",
        name: "المستوى التمهيدي",
        order: 0,
        bookTitle: "تحفة الأطفال",
        author: "الشيخ سليمان الجمزوري",
        description:
          "منظومة في أحكام النون الساكنة والتنوين والميم الساكنة والمدود، تُحفظ أبياتًا مرتّبة.",
        available: true,
        sections: [
          {
            id: "t1",
            title: "المقدمة",
            body: "يقول راجي رحمة الغفور — دومًا سليمان هو الجمزوري",
          },
          { id: "t2", title: "أحكام النون الساكنة والتنوين", body: "(تُعرض الأبيات المعتمدة هنا بعد اعتماد المشرف)" },
          { id: "t3", title: "أحكام الميم والنون المشددتين", body: "(تُعرض الأبيات المعتمدة هنا بعد اعتماد المشرف)" },
          { id: "t4", title: "أحكام الميم الساكنة", body: "(تُعرض الأبيات المعتمدة هنا بعد اعتماد المشرف)" },
          { id: "t5", title: "أحكام المد", body: "(تُعرض الأبيات المعتمدة هنا بعد اعتماد المشرف)" },
        ],
        samplePool: [
          "يقول راجي رحمة الغفور دوما سليمان هو الجمزوري",
        ],
      },
    ],
  },
];

export function findLevel(levelId: string): { track: Track; level: Level } | null {
  for (const t of tracks) {
    const l = t.levels.find((x) => x.id === levelId);
    if (l) return { track: t, level: l };
  }
  return null;
}

/* ---------- Progress & exam state ---------- */

export interface ExamResult {
  score: number; // 0..100
  date: string;
  mode: "after-study" | "placement";
  detail: string;
}

export interface LevelProgress {
  completedSections: string[];
  lastSectionId: string | null;
  minutes: number;
  oral: ExamResult | null;
  written: ExamResult | null;
}

export type ProgressMap = Record<string, LevelProgress>;

export const initialProgress: ProgressMap = {
  "aqeedah-0": {
    completedSections: ["n1", "n2", "n3", "n4", "n5", "n6", "n7"],
    lastSectionId: "n8",
    minutes: 412,
    oral: null,
    written: null,
  },
  "aqeedah-1": { completedSections: [], lastSectionId: null, minutes: 0, oral: null, written: null },
  "hadith-0": {
    completedSections: ["h1", "h2"],
    lastSectionId: "h3",
    minutes: 298,
    oral: null,
    written: null,
  },
  "tajweed-0": { completedSections: [], lastSectionId: null, minutes: 24, oral: null, written: null },
};

export const DEMO_PASS_THRESHOLD = 80;

/* ---------- Performance ---------- */

export const weeklyActivity = [
  { day: "السبت", minutes: 32, reviews: 5 },
  { day: "الأحد", minutes: 18, reviews: 3 },
  { day: "الاثنين", minutes: 41, reviews: 7 },
  { day: "الثلاثاء", minutes: 0, reviews: 0 },
  { day: "الأربعاء", minutes: 27, reviews: 4 },
  { day: "الخميس", minutes: 46, reviews: 8 },
  { day: "الجمعة", minutes: 0, reviews: 0 },
];

export const retentionCurve = [62, 68, 71, 70, 76, 81, 79, 84, 87, 86, 90, 91];

export interface Mistake {
  id: string;
  book: string;
  section: string;
  expected: string;
  got: string;
  kind: "كلمة ناقصة" | "كلمة مبدّلة" | "تقديم وتأخير" | "زيادة";
  date: string;
  fixed: boolean;
}

export const mistakes: Mistake[] = [
  {
    id: "m1",
    book: "نواقض الإسلام",
    section: "الناقض الثالث",
    expected: "أو شك في كفرهم",
    got: "أو شك بكفرهم",
    kind: "كلمة مبدّلة",
    date: "منذ يومين",
    fixed: false,
  },
  {
    id: "m2",
    book: "نواقض الإسلام",
    section: "الناقض السابع",
    expected: "ومنه الصرف والعطف",
    got: "ومنه الصرف",
    kind: "كلمة ناقصة",
    date: "منذ ٣ أيام",
    fixed: false,
  },
  {
    id: "m3",
    book: "الأربعون النووية",
    section: "الحديث الأول",
    expected: "وإنما لكل امرئ ما نوى",
    got: "ولكل امرئ ما نوى",
    kind: "كلمة ناقصة",
    date: "منذ أسبوع",
    fixed: true,
  },
  {
    id: "m4",
    book: "نواقض الإسلام",
    section: "الناقض الثامن",
    expected: "مظاهرة المشركين ومعاونتهم",
    got: "معاونة المشركين ومظاهرتهم",
    kind: "تقديم وتأخير",
    date: "منذ أسبوعين",
    fixed: true,
  },
];

/* ---------- Scholars ---------- */

export interface Scholar {
  id: string;
  name: string;
  initials: string;
  specialty: string;
  tracks: string[];
  city: string;
  available: boolean;
  nextSlot: string;
  bio: string;
  qualifications: { title: string; issuer: string; verified: boolean }[];
  ijazahTitle: string;
  students: number;
  years: number;
}

export const scholars: Scholar[] = [
  {
    id: "s1",
    name: "الشيخ د. ماجد بن ناصر العتيبي",
    initials: "م ع",
    specialty: "العقيدة ومتون السلف",
    tracks: ["العقيدة"],
    city: "الرياض",
    available: true,
    nextSlot: "اليوم ٨:٣٠ م",
    bio: "دكتوراه في العقيدة من جامعة الإمام، قرأ متون التوحيد على عدد من المشايخ ولازم حلقات التحفيظ العلمي عشرين عامًا. يركّز في الإشراف على ضبط اللفظ قبل الشرح.",
    qualifications: [
      { title: "دكتوراه في العقيدة", issuer: "جامعة الإمام محمد بن سعود", verified: true },
      { title: "إجازة في كتاب التوحيد", issuer: "بسند متصل — موثّقة", verified: true },
      { title: "إجازة في نواقض الإسلام والقواعد الأربع", issuer: "بسند متصل — موثّقة", verified: true },
    ],
    ijazahTitle: "إجازة في متون التوحيد",
    students: 38,
    years: 21,
  },
  {
    id: "s2",
    name: "الشيخة أ. نورة بنت عبدالله القحطاني",
    initials: "ن ق",
    specialty: "الحديث وعلومه",
    tracks: ["الحديث"],
    city: "مكة المكرمة",
    available: true,
    nextSlot: "غدًا ٤:٠٠ م",
    bio: "ماجستير في الحديث الشريف، حافظة للأربعين النووية ورياض الصالحين بأسانيدها، تُشرف على حلقات نسائية في الحرم منذ اثني عشر عامًا.",
    qualifications: [
      { title: "ماجستير في الحديث الشريف", issuer: "جامعة أم القرى", verified: true },
      { title: "إجازة في الأربعين النووية", issuer: "بسند متصل — موثّقة", verified: true },
      { title: "إجازة في صحيح البخاري", issuer: "قيد التوثيق", verified: false },
    ],
    ijazahTitle: "إجازة في الأربعين النووية",
    students: 54,
    years: 12,
  },
  {
    id: "s3",
    name: "الشيخ أ. حسان بن محمود الدمشقي",
    initials: "ح د",
    specialty: "التجويد والقراءات العشر",
    tracks: ["التجويد والقراءات"],
    city: "المدينة المنورة",
    available: false,
    nextSlot: "الأحد ٩:٠٠ م",
    bio: "مجاز بالقراءات العشر من طريقي الشاطبية والدرة، معلم في مجمع القراءات، يُعنى بمنظومات التجويد وشرح أبياتها للمبتدئين.",
    qualifications: [
      { title: "إجازة بالقراءات العشر الصغرى", issuer: "بسند متصل — موثّقة", verified: true },
      { title: "إجازة في تحفة الأطفال والجزرية", issuer: "بسند متصل — موثّقة", verified: true },
      { title: "بكالوريوس قراءات", issuer: "الجامعة الإسلامية بالمدينة", verified: true },
    ],
    ijazahTitle: "إجازة في تحفة الأطفال",
    students: 71,
    years: 17,
  },
  {
    id: "s4",
    name: "الشيخ د. يوسف بن إدريس السوسي",
    initials: "ي س",
    specialty: "العقيدة والحديث",
    tracks: ["العقيدة", "الحديث"],
    city: "فاس",
    available: true,
    nextSlot: "اليوم ١٠:٠٠ م",
    bio: "دكتوراه في أصول الدين من القرويين، جمع بين حفظ المتون العقدية وكتب السنة، ويهتم بتدريب الطلاب على المراجعة المتباعدة.",
    qualifications: [
      { title: "دكتوراه في أصول الدين", issuer: "جامعة القرويين", verified: true },
      { title: "إجازة في الأربعين النووية", issuer: "بسند متصل — موثّقة", verified: true },
    ],
    ijazahTitle: "إجازة في الأربعين النووية",
    students: 26,
    years: 9,
  },
  {
    id: "s5",
    name: "الشيخ أ. عمر بن خالد الزهراني",
    initials: "ع ز",
    specialty: "التجويد للمبتدئين",
    tracks: ["التجويد والقراءات"],
    city: "جدة",
    available: false,
    nextSlot: "الثلاثاء ٧:٠٠ م",
    bio: "مجاز برواية حفص عن عاصم، متخصص في تعليم منظومات التجويد للناشئة وضبط أبيات التحفة.",
    qualifications: [
      { title: "إجازة برواية حفص عن عاصم", issuer: "بسند متصل — موثّقة", verified: true },
      { title: "دبلوم تربوي", issuer: "جامعة الملك عبدالعزيز", verified: true },
    ],
    ijazahTitle: "إجازة في تحفة الأطفال",
    students: 43,
    years: 8,
  },
];

/* ---------- Messages ---------- */

export interface Message {
  id: string;
  from: "me" | "them";
  text: string;
  time: string;
}

export interface Thread {
  id: string;
  scholarId: string;
  messages: Message[];
  unread: number;
}

export const initialThreads: Thread[] = [
  {
    id: "th1",
    scholarId: "s1",
    unread: 1,
    messages: [
      { id: "a1", from: "them", text: "السلام عليكم عبدالرحمن، راجعتُ تسميعك للناقض الثالث. اللفظ «في كفرهم» لا «بكفرهم»، أعد تثبيته ثلاث مرات قبل حصة الغد.", time: "أمس ٩:١٢ م" },
      { id: "a2", from: "me", text: "وعليكم السلام ورحمة الله، جزاكم الله خيرًا. ضبطته وسأعيد التسميع الليلة.", time: "أمس ٩:٤٠ م" },
      { id: "a3", from: "them", text: "أحسنت. وعند بلوغك الناقض العاشر نحدد موعد الاختبار الشفهي.", time: "اليوم ٧:٠٥ ص" },
    ],
  },
  {
    id: "th2",
    scholarId: "s2",
    unread: 0,
    messages: [
      { id: "b1", from: "me", text: "شيختنا الفاضلة، هل أحفظ سند الحديث الأول كاملًا أم يكفي اسم الصحابي؟", time: "الأحد ٣:٢٠ م" },
      { id: "b2", from: "them", text: "يكفي في هذه المرحلة اسم الصحابي والمخرِّج، والسند التام يأتي في مستوى لاحق.", time: "الأحد ٥:٠٢ م" },
    ],
  },
];

/* ---------- Helpers ---------- */

const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

export function normalizeArabic(s: string): string {
  return s
    .replace(TASHKEEL, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\u0600-\u06FF\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toArabicDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}
