export type Note = { rect: [number, number, number, number]; text: string; at?: number };
export type Shot = {
  media: string;
  heading: string;
  label: string;
  note?: Note;
  start?: number;
  rate?: number;
  aspect?: number;
  fit?: 'cover';
  intro?: boolean;
  demo?: boolean;
};

// Real platform UI. The teacher directory/conversation use browser-only
// fixtures and are explicitly labelled; recitation video was owner-supplied.
export const shots: Shot[] = [
  { media: 's01-role.png', heading: 'ابدأ باختيار دورك', label: 'صفحة الترحيب', intro: true,
    note: { rect: [0.185, 0.485, 0.255, 0.18], text: 'طالب علم أو معلم', at: 1900 } },
  { media: 's02-memorized.mp4', heading: 'تعريف قصير بحفظك وهدفك', label: 'أسئلة التهيئة', rate: 1.1 },
  { media: 's04-home.png', heading: 'برنامجك اليوم', label: 'الصفحة الرئيسية',
    note: { rect: [0.099, 0.316, 0.6146, 0.4068], text: 'من حيث توقفت' } },
  { media: 's05-tracks.mp4', heading: 'المسارات العلمية', label: 'المسارات',
    note: { rect: [0.099, 0.397, 0.6146, 0.529], text: 'الأربعون النووية', at: 3200 } },
  { media: 's06-map.mp4', heading: 'رحلة الأربعين مرحلةً مرحلة', label: 'خريطة التعلّم' },
  { media: 's07-stage.mp4', heading: 'حدّد مقطعًا واسأل عنه', label: 'مرحلة الحديث الأول', rate: 1.45 },
  { media: 's07b-stage-answer.png', heading: 'شرح بجانب النص', label: 'مساعد الحديث',
    note: { rect: [0.099, 0.111, 0.25, 0.86], text: 'يساعدك على فهم الحديث' } },
  { media: 'recitation.mp4', heading: 'مساعد ذكي يستمع إلى تسميعك', label: 'تسجيل شاشة من التسميع', start: 5, fit: 'cover' },
  { media: 's09-recitation-close.png', heading: 'ينبّهك إلى ما فاتك من كلمات', label: 'ميزة تجريبية — لا تقيّم النطق والتشكيل', aspect: 1339 / 1199 },
  { media: 's10-study.png', heading: 'مكتبة الدراسة', label: 'قارئ الأربعين النووية',
    note: { rect: [0.5537, 0.2546, 0.1556, 0.0694], text: 'ابدأ التسميع من هنا' } },
  { media: 's11-scholars-close.png', heading: 'تعرّف على المشايخ وتخصصاتهم', label: 'التواصل عبر إحالة المساعد', aspect: 1170 / 773, demo: true },
  { media: 's12-words.mp4', heading: 'تمارين الكلمات الصعبة', label: 'الكلمات الصعبة' },
  { media: 's13-assistant.mp4', heading: 'مجلس السؤال', label: 'المساعد العلمي', rate: 1.1 },
  { media: 's14-answer.png', heading: 'مساعدك في تعلّم الحديث', label: 'المساعد العلمي',
    note: { rect: [0.0996, 0.1146, 0.4518, 0.7454], text: 'تعلّم الحديث وافهم معانيه' } },
  { media: 's15-ask-scholar-close.mp4', heading: 'اسأل الشيخ بعد الإحالة', label: 'عرض توضيحي — لا إرسال فعلي', rate: 1, aspect: 1074 / 852, demo: true },
];

export const titles = [...shots.map((s) => s.heading), 'رحلتك مع المتون'];

export const narration = [
  'مَتِين. رَفِيقُكَ فِي دِرَاسَةِ الْمُتُون.',
  'أَخْبِرْنَا عَنْ هَدَفِك. وَاخْتَرِ الْوَقْتَ الْمُنَاسِبَ لَك.',
  'تَجِدُ هُنَا بَرْنَامَجَكَ الْيَوْمِيّ. لِتُكْمِلَ دِرَاسَتَك.',
  'مَسَارٌ وَاضِحٌ لِدِرَاسَةِ الْأَرْبَعِينَ النَّوَوِيَّة.',
  'تَابِعْ رِحْلَتَكَ عَلَى الْخَرِيطَة. مَرْحَلَةً بَعْدَ مَرْحَلَة.',
  'حَدِّدْ كَلِمَةً مِنَ الْحَدِيث. وَاسْأَلْ عَنْ مَعْنَاهَا.',
  'مُسَاعِدُكَ فِي فَهْمِ الْحَدِيث، وَشَرْحِ مَعَانِي الْكَلِمَات.',
  'سَمِّعْ مِنْ حِفْظِك. وَالْمُسَاعِدُ الذَّكِيُّ يَسْتَمِعُ إِلَيْك.',
  'يُنَبِّهُكَ إِلَى الْكَلِمَاتِ النَّاقِصَة، أَوِ الَّتِي اسْتَبْدَلْتَهَا.',
  'مَكْتَبَةٌ تَجْمَعُ النُّصُوص. اِقْرَأْ وَرَاجِعْ بِسُهُولَة.',
  'تَعَرَّفْ عَلَى الْمَشَايِخ، وَتَخَصُّصَاتِهِمْ فِي الْحَدِيث.',
  'تَدَرَّبْ عَلَى الْكَلِمَاتِ الصَّعْبَة. وَكَرِّرْهَا مَرَّةً بَعْدَ مَرَّة.',
  'فِي مَجْلِسِ السُّؤَال. اُكْتُبْ سُؤَالَكَ عَنِ الْحَدِيث.',
  'إِجَابَاتٌ تُسَاعِدُكَ عَلَى تَعَلُّمِ الْحَدِيثِ وَفَهْمِ مَعَانِيه.',
  'بَعْدَ الْإِحَالَة، اِكْتُبْ سُؤَالَكَ لِلشَّيْخ. وَتَابِعِ الْحِوَار.',
  'مَتِين. يُسَاعِدُكَ فِي دِرَاسَةِ الْمُتُون.',
];

export const captions: [number, string][][] = narration.map((text) => [[0, text]]);
