import { useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { getLocale, intlTag } from './i18n';

export const TEACHER_INTENT_KEY = 'mateen:signup-intent';

export const num = (n: number) => n.toLocaleString(intlTag());

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(getLocale() === 'ar' ? 'ar' : 'en-GB', { dateStyle: 'long', timeStyle: 'short' }).format(d);
}

// i18n-canonical: Arabic search normalisation
export function normalizeArabic(s: string) {
  return s
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    document.title = title;
    let m = document.querySelector('meta[name="description"]');
    if (!m) {
      m = document.createElement('meta');
      m.setAttribute('name', 'description');
      document.head.appendChild(m);
    }
    m.setAttribute('content', description);
  }, [title, description]);
}

/** True only once Clerk has loaded and a session exists: gate for protected queries. */
export function useAuthReady() {
  const { isLoaded, isSignedIn } = useAuth();
  return { isLoaded, isSignedIn: !!isSignedIn, ready: isLoaded && !!isSignedIn };
}

type FaqItem = { id: string; q: string; a: string };
const faq = (id: string, qAr: string, qEn: string, aAr: string, aEn: string): FaqItem => ({
  id,
  get q() { return getLocale() === 'en' ? qEn : qAr; },
  get a() { return getLocale() === 'en' ? aEn : aAr; },
});

// i18n-canonical: bilingual FAQ entries, read through locale-aware getters
export const FAQ: FaqItem[] = [
  faq('what', 'ما هي منصة مَتِين؟', 'What is Mateen?', 'بيئة عربية لدراسة المتون والمنظومات العلمية الشرعية على نصوص موثّقة بمصادرها، مع متابعة موضع التوقف والعلامات والمراجعة.', 'An Arabic environment for studying classical Islamic texts and didactic poems from source-referenced texts, with your stopping point, bookmarks and review tracked.'),
  faq('available', 'ما المتاح اليوم؟', 'What is available today?', 'متن «الأربعون النووية» في مسار الحديث (المستوى التمهيدي) وحده. بقية المتون والمسارات مغلقة بوسم «قريباً» ولا يمكن الدخول إليها.', 'Only al-Arba\'in al-Nawawiyya in the hadith track (introductory level). Other texts and tracks are locked as "coming soon" and can\'t be opened.'),
  faq('recitation', 'هل يوجد تسميع صوتي أو اختبارات؟', 'Is there voice recitation or exams?', 'ليسا متاحين بعد، وسيُعلن عنهما عند اكتمال التحقق منهما. لا تعرض المنصة أي نتائج أو درجات غير حقيقية.', 'Not yet; they will be announced once verified. The platform never shows unreal results or grades.'),
  faq('teacher-direct', 'هل يمكنني سؤال المعلم مباشرة؟', 'Can I ask a teacher directly?', 'لا. التواصل مع المعلم المعتمد يكون عبر إحالة من المساعد العلمي عند تفعيله، أما دليل المشايخ فللتعريف فقط.', 'No. Contact with an approved teacher happens through a referral from the study assistant when enabled; the scholars directory is for introduction only.'),
  faq('fatwa', 'هل المساعد يفتي؟', 'Does the assistant issue fatwas?', 'لا. المساعد العلمي، عند توفره، مقيّد بكتب الشروح المعتمدة ولا يفتي ولا يجتهد. وهذا المساعد التعريفي ليس مساعداً علمياً، وإنما يجيب عن معلومات المنصة فقط.', 'No. The study assistant, when available, is bound to approved commentaries and neither issues fatwas nor exercises ijtihad. The introductory helper is not a study assistant; it only answers questions about the platform.'),
  faq('certificates', 'هل تمنح المنصة شهادات؟', 'Does the platform grant certificates?', 'لا تعد المنصة بشهادات تلقائية.', 'The platform does not promise automatic certificates.'),
  faq('teacher-signup', 'كيف أسجّل كمعلم؟', 'How do I register as a teacher?', 'أنشئ حساباً واختر «معلم». احفظ ملفك وارفع وثائق مؤهلاتك الخاصة (PDF أو صورة حتى ١٠ م.ب) ثم أرسل الطلب للمراجعة. تبقى الوثائق خاصة ولا تُنشر، ولا يستقبل المعلم إحالات قبل اعتماد المنصة له.', 'Create an account and choose "Teacher". Save your profile, upload your private qualification documents (PDF or image up to 10 MB), then send the application for review. Documents stay private and are never published, and teachers receive no referrals before the platform approves them.'),
];
