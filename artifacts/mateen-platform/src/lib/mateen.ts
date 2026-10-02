import { useEffect } from 'react';
import { useAuth } from '@clerk/react';

export const TEACHER_INTENT_KEY = 'mateen:signup-intent';

export const num = (n: number) => n.toLocaleString('ar-EG');

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ar', { dateStyle: 'long', timeStyle: 'short' }).format(d);
}

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

export const FAQ: { q: string; a: string }[] = [
  { q: 'ما هي منصة مَتِين؟', a: 'بيئة عربية لدراسة المتون والمنظومات العلمية الشرعية على نصوص موثّقة بمصادرها، مع متابعة موضع التوقف والعلامات والمراجعة.' },
  { q: 'ما المتاح اليوم؟', a: 'متن «الأربعون النووية» في مسار الحديث (المستوى التمهيدي) وحده. بقية المتون والمسارات مغلقة بوسم «قريباً» ولا يمكن الدخول إليها.' },
  { q: 'هل يوجد تسميع صوتي أو اختبارات؟', a: 'ليسا متاحين بعد، وسيُعلن عنهما عند اكتمال التحقق منهما. لا تعرض المنصة أي نتائج أو درجات غير حقيقية.' },
  { q: 'هل يمكنني سؤال المعلم مباشرة؟', a: 'لا. التواصل مع المعلم المعتمد يكون عبر إحالة من المساعد العلمي عند تفعيله، أما دليل المشايخ فللتعريف فقط.' },
  { q: 'هل المساعد يفتي؟', a: 'لا. المساعد العلمي، عند توفره، مقيّد بكتب الشروح المعتمدة ولا يفتي ولا يجتهد. وهذا المساعد التعريفي ليس مساعداً علمياً، وإنما يجيب عن معلومات المنصة فقط.' },
  { q: 'هل تمنح المنصة شهادات؟', a: 'لا تعد المنصة بشهادات تلقائية.' },
  { q: 'كيف أسجّل كمعلم؟', a: 'أنشئ حساباً واختر «معلم». احفظ ملفك وارفع وثائق مؤهلاتك الخاصة (PDF أو صورة حتى ١٠ م.ب) ثم أرسل الطلب للمراجعة. تبقى الوثائق خاصة ولا تُنشر، ولا يستقبل المعلم إحالات قبل اعتماد المنصة له.' },
];
