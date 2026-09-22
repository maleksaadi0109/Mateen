# Landing Page Master Specification — Mateen Platform (`landing-page-spec.md`)

This document is the single source of truth for building and updating the **Landing Page** of the **Mateen Platform (منصة مَتِين)**. It is specifically designed for AI Coding Agents (e.g., Replit Agent) to generate production-ready React 18 + TypeScript + Tailwind CSS code from scratch without requiring prior context.

---

## 1. Project Tech Stack & Configuration

* **Framework:** React 18+ (Vite)
* **Language:** TypeScript (`.tsx`)
* **Styling:** Tailwind CSS with RTL support (`dir="rtl"`)
* **Icons:** `lucide-react`
* **Animations:** `framer-motion`
* **State Management:** React Context API
* **Typography:** Traditional Arabic Typography (e.g., 'Amiri', 'Traditional Arabic', or 'Scheherazade New' alongside 'Cairo' or 'Tajawal' for UI elements)

---

## 2. Global Design System & Themes

The application must support two distinct visual modes via a global `ThemeContext`:

1. **Natural Parchment Mode (القرطاس الطبيعي - Light Theme):**
   * Background: Warm parchment / off-white (`#FDFBF7`, `#F4EFE6`)
   * Primary Text: Dark walnut / deep ink (`#1E293B`, `#2C1810`)
   * Accent Colors: Islamic Olive Green (`#15803D`), Terracotta / Crimson (`#7C2D12`)
2. **Night Manuscripts Mode (المخطوطات الليلية - Dark Theme):**
   * Background: Night blue-black (`#0F172A`, `#1E1E2E`)
   * Primary Text: Ivory / Soft Off-white (`#F8FAFC`, `#E2E8F0`)
   * Accent Colors: Muted Gold (`#D97706`), Emerald Green (`#059669`)

---

## 3. Global State & Modals Requirements

1. **`AuthModalContext`:**
   * Controls `UnifiedAuthModal` state: `isOpen: boolean`, `activeTab: 'student' | 'teacher'`, `mode: 'login' | 'register'`.
   * Function `openAuthModal(tab: 'student' | 'teacher', mode?: 'login' | 'register')`.
2. **`ThemeContext`:**
   * Toggles theme between `'parchment'` and `'night'`.
3. **`AudioContext` (Optional):**
   * Toggles background atmospheric recitations/ambient audio.

---

## 4. Component-by-Component Specifications

### 4.1. Header & Navigation (`Navbar.tsx`)
* **Layout:** Sticky header with blur backdrop.
* **Logo:** "مَتِين" typography logo with home scroll interaction.
* **Nav Links:**
  1. `عن المنصة` -> Navigates to `/about` page (renders a centered page with the word "قريباً").
  2. `المحاكي الذكي` -> Anchor link `#smart-emulator`
  3. `مزايا المنصة` -> Anchor link `#features` *(Note: strictly renamed from "المزايا السبع")*
  4. `المسارات الحالية` -> Anchor link `#tracks`
  5. `منهجية العمل` -> Anchor link `#methodology`
  6. `الأسئلة الشائعة` -> Anchor link `#faq`
* **Action Buttons:**
  * **Audio Toggle Button:** Mute/Unmute audio icon.
  * **Theme Switcher:** Toggles between Parchment / Night Manuscripts modes.
  * **Login CTA Button:** Opens `UnifiedAuthModal` in login mode.
* **STRICT RULE:** **REMOVE** the "اختبار المستوى" button from the Navbar entirely.

---

### 4.2. About Page (`AboutPage.tsx`)
* **Route:** `/about`
* **Content:** Simple layout displaying only the word **"قريباً"** centered vertically and horizontally, with a "العودة للرئيسية" back button.

---

### 4.3. Hero & Simulator (`HeroSection.tsx` & `InteractiveSimulatorPreview.tsx`)

* **Right Column (Hero Headline & CTAs):**
  * **Badge:** `"المنصة الذكية الأولى المتخصصة في متون ومنظومات علوم الشريعة"`
  * **Headline:** `"مساعدك الذكي للحفظ المتين"`
  * **Sub-headline:** `"نجمع بين جلال المتون العلمية ورسوخ شروحها الأثرية، وأحدث خوارزميات الاستماع الصوتي والذكاء الاصطناعي التوليدي. صحّح قراءتك وتشكيلك لحظياً، وتلقّ الدعم والتوجيه من المشائخ المتقنين بالمنصة."`
  * **CTA Buttons:**
    * Button 1: `"التسجيل كطالب"` -> triggers `openAuthModal('student', 'register')`
    * Button 2: `"التسجيل كمعلم وموجه"` -> triggers `openAuthModal('teacher', 'register')`
  * **Value Prop Bar:** `شروح محققة ✦ تصحيح لحظي ✦ توجيه ودعم بشري عند الحاجة`

* **Left Column (`InteractiveSimulatorPreview.tsx`):**
  * **Track Selector Dropdown:**
    * **STRICT RULE:** **REMOVE** "سورة الفاتحة" completely. Only classical Islamic texts are permitted.
    * Allowed Options: `"الأصول الثلاثة"`, `"تحفة الأطفال"`.
  * **Simulator Card Features:**
    * Live AI STT Waveform visualization.
    * Interactive diacritics error highlighter card (e.g., highlighting tashkeel correction in red for words like `"رَبَّانِيّ"`).
    * Audio controls: Demo play, Microphone toggle, Audio speed selector.

---

### 4.4. Platform Features — 7 Pillars (`FeaturesSection.tsx`)

* **Section Header:**
  * **Headline:** `"دليلك الشامل نحو الإتقان والرسوخ"`
  * **Sub-headline:** `"سبع ركائز بنيت عليها منصة متين لتجمع بين أصالة الحلقات، وأحدث ما توصلت إليه تقنيات الذكاء الاصطناعي التوليدي."`
* **STRICT RULE:** Remove all English terms from badges/labels. Use pure Arabic badges.

#### Feature Cards Data:
1. **التصحيح الصوتي اللحظي** (Badge: `دقة صوتية فائقة`)
   * *Text:* "نموذج تعرّف صوتي استثنائي خُصص للنطق العربي الفصيح وقواعد القراءة. يستمع لتسميع الطالب حرفاً فحرفاً، ويكتشف أخطاء الحركات والتشكيل والإعراب فور النطق بها دون تأخير."
2. **المساعد التفاعلي مَتِين** (Badge: `شروح موثقة`)
   * *Text:* "اسأل المساعد الذكي عن أي لفظ غريب، أو إعراب معضل، أو استفسار عقدي أو فقهي، وسيجيبك في ثوانٍ مستنداً إلى أمهات الشروح المعتمدة لكل متن، مع العزو الدقيق للجزء والصفحة."
3. **توجيه بشري موثوق** (Badge: `توجيه بشري`)
   * *Text:* "التقنية وسيلة إتقان وتمكين وليست بديلاً عن الشيخ المعلم؛ توفر المنصة ربطاً مباشراً بشبكة من المقرئين المتقنين والمشايخ المجازين للتوجيه والإجابة عن الأسئلة المعقدة التي يمتنع المساعد الذكي "متين" عن إجابتها."
4. **تلقين صوتيات المتقنين** (Badge: `استمع وكرر`)
   * *Text:* "مكتبة صوتية نقية تضم تلاوات وقراءات لأكابر القراء والمشايخ المحققين، تتيح لك خاصية التكرار الذكي (3x, 5x, 7x) والمضاهاة الصوتية لترسيخ اللفظ السليم في ذاكرتك."
5. **متابعة وتحليل المستوى** (Badge: `تكرار متباعد`)
   * *Text:* "لوحة تحليلات ذكية ترصد منحنى أدائك وتحدد الكلمات التي يتكرر فيها ترددك، وتجدول لك مراجعات دورية ذكية متباعدة لضمان عدم نسيان ما حفظته."
6. **تدرج في التعلم** (Badge: `تأصيل منهجي`)
   * *Text:* "خطة دراسية أصيلة تبدأ بصغار المتون قبل كبارها، من المستوى التمهيدي وحتى المنظومات المتقدمة والمطولات، تحصيناً للطالب من التشتت وسيراً على سنن العلماء في التلقي."
7. **اختبار تحديد المستوى** (Badge: `اختصر وقتك`)
   * *Text:* "لا تبدأ من الصفر إذا كنت حافظاً؛ خُض اختباراً تشخيصياً تفاعلياً يقيس بدقة مستواك ليوجهك مباشرة إلى المرحلة التي تناسب حصيلتك العلمية."
   * *CTA Button inside card:* `"ابدأ الاختبار التشخيصي الآن"` -> triggers `openAuthModal('student', 'register')`.

---

### 4.5. Hadith Quote Section (`HadithQuoteSection.tsx`)

* **Top Badge:** `قال رسول الله ﷺ`
* **Hadith Text:**
  > «مَنْ سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا؛ سَهَّلَ اللَّهُ لَهُ بِهِ طَرِيقًا إِلَى الْجَنَّةِ»
* **Source:** `صحيح مسلم`
* **Interactions:**
  * **"نسخ الحديث" Button:** Copies Hadith and source to clipboard with a toast notification.
  * **"مشاركة" Button:** Invokes `navigator.share` (Web Share API) or fallback copy.

---

### 4.6. Active Learning Tracks (`TracksSection.tsx`)

* **Badge:** `المناهج العلمية بالمنصة`
* **Headline:** **المسارات النشطة**
* **Sub-headline:** "اختر مسارك العلمي لتبدأ رحلة الحفظ المنهجي والتلقين الصوتي اللحظي عبر متون محققة على أيدي علماء الأمة."
* **STRICT RULE:** **REMOVE** all mentions of certificates ("شهادة" / "شهادات") from all tracks.

#### Track Cards:
1. **مسار العقيدة:**
   * *Sub-badge:* `رسوخ التوحيد والأدلة`
   * *Description:* "دراسة متدرجة لأهم المتون العقائدية المحررة لتأصيل طالب العلم في أبواب التوحيد والإيمان ومسائل الاعتقاد على منهج السلف الصالح."
   * *Hover Texts:* `نواقض الإسلام، القواعد الأربعة`
2. **مسار التجويد والقراءات:**
   * *Sub-badge:* `إتقان التلاوة وضبط الحروف`
   * *Description:* "مسار متخصص لضبط أحكام التلاوة ومخارج الحروف، ودراسة المنظومات العلمية الضابطة للأداء الصوتي السليم."
   * *Hover Texts:* `تحفة الأطفال`
3. **مسار الحديث:**
   * *Sub-badge:* `أصول الرواية وقواعد الأثر`
   * *Description:* "استكشاف واستظهار أمهات المتون الحديثية لتأسيس طالب العلم في السنة النبوية الشريفة ومعرفة جوامع الكلم."
   * *Hover Texts:* `الأربعون النووية`

---

### 4.7. How It Works Section (`HowItWorksSection.tsx`)

* **Badge:** `الهندسة البرمجية والأصالة التراثية`
* **Headline:** **كيف تعمل منصة مَتِين؟**
* **Sub-headline:** "معمارية متكاملة ثلاثية الأركان تضم دقة الفتوى وصحة التلاوة وحفظ المتون دون أي خلل."

#### The 3 Core Pillars:
1. **`01` — محرك النطق الصوتي:**
   "نموذج تعلم عميق مخصص للصوتيات العربية ومخارج الحروف وقواعد النطق، يحلل تسميع الطالب للمتون والمنظومات العلمية وحروفها بدقة عالية، ويطابق النطق مع التشكيل والضبط المعتمد للألفيات والمتون لضمان السلامة اللغوية والأداء المتقن."
2. **`02` — محرك RAG للشروحات المحققة:**
   "قاعدة بيانات شعاعية (Vector Database) تفهرس آلاف الصفحات من أمهات شروح المتون، وتسترجع النص الحرفي الدقيق بدلاً من التوليد العشوائي، لتجنب الوهم والخطأ."
3. **`03` — التدخل البشري عند الحاجة:**
   "لوحة مخصصة للمشايخ المتقنين تتيح لهم الإجابة عن الأسئلة عند إحالة الطالب إليهم من قبل المساعد الذكي، والرد على الاستفسارات المباشرة، وتوجيه وإرشاد طلاب المنصة."

---

### 4.8. FAQ Section (`FAQSection.tsx`)

* **Badge:** `إجابات شافية`
* **Headline:** **الأسئلة الشائعة**
* **Sub-headline:** "كل ما تود معرفته عن آلية الحفظ، ودقة الذكاء الاصطناعي، والإشراف الشرعي."

#### Accordion Data:
1. **Q: هل يغني الذكاء الاصطناعي في المنصة عن التلقي من المشايخ؟**
   * *A:* "قطعاً لا؛ إنما هو مساعد ذكي ومرافق يضبط لك الأوقات التي لا تجد فيها شيخاً يسمع لك، ويصحح لك أخطاء التشكيل والحفظ الأولية، حتى إذا رسخ حفظك عُرضت قراءتك النهائية على الشيوخ المعتمدين للإجازة."
2. **Q: كيف تضمن المنصة صحة إجابات المساعد "مَتِين" وعدم خطئه في الفتوى؟**
   * *A:* "تم بناء المساعد عبر تقنية الـ RAG الصارمة والمغلقة، بحيث لا يولد إجابات من خياله، بل يستخرج النصوص نصياً من الشروح المعتمدة فقط (مثل شرح ابن عثيمين، والنووي، وابن حجر) مع ذكر الكتاب والصفحة، ولا يفتي في النوازل المعاصرة بل يحيل إلى العلماء."
3. **Q: هل المنصة مجانية أم تتطلب اشتراكاً؟**
   * *A:* "مسارات الحفظ الأساسية والمحاكي الصوتي اللحظي متاحة كوقف علمي مجاني لجميع طلاب العلم حول العالم، وهناك خدمات توجيه شخصي مكثف ودورات إجازة خاصة يدعم ريعها البنية السحابية للمشروع."
4. **Q: كيف أبدأ الدراسة كطالب، وهل يلزم التسجيل الفوري؟**
   * *A:* "يمكنك البدء فوراً بالنقر على زر «اختبار تحديد المستوى» لتقييم حفظك في 3 دقائق، أو الضغط على «التسجيل كطالب» لإنشاء حساب وتتبع محفوظاتك عبر لوحة تحليلاتك الشخصية."

---

### 4.9. Call To Action & Footer (`CallToAction.tsx` & `Footer.tsx`)

* **CTA Banner (`CallToAction.tsx`):**
  * **Headline:** **"ابدأ رحلتك المباركة في حفظ متون ومنظومات علوم الشريعة اليوم"**
  * **Sub-headline:** "كن من أوائل المنضمين لضبط محفوظاتك وتأسيس علمك المنهجي عبر أحدث تقنيات الذكاء الاصطناعي الموجهة لخدمة العلوم الشرعية."
  * **Button:** Only ONE button: `"سجل كطالب مجاناً"` -> triggers `openAuthModal('student', 'register')`. *(Level test button is removed here)*.

* **Footer (`Footer.tsx`):**
  * **About Text:** "مَتِين؛ أول منصة تعليمية تفاعلية تدمج بين أصالة المتون العلمية وتقنيات الذكاء الاصطناعي الحديثة لخدمة طالب العلم وتأصيله وضبط قراءته ومحفوظاته بإشراف مشايخ موثوقين."
  * **Track Links:** `مسار العقيدة` | `مسار التجويد والقراءات` | `مسار الحديث` | `المحاكي الصوتي التفاعلي`.
  * **Copyright & Compliance:** "© 2026 منصة متين (Mateen) التعليمية. جميع الحقوق محفوظة لخدمة علوم الشريعة." | "خالية تماماً من ذوات الأرواح • معايير إمكانية الوصول WCAG 2.2 AA".

---

### 4.10. Unified Auth Modal (`UnifiedAuthModal.tsx`)

* **Tabs:**
  1. `[حساب طالب علم]`
  2. `[طلب انضمام معلم/موجه]`
* **Sub-toggle:** Allows switching between "تسجيل الدخول" (Login) and "إنشاء حساب" (Register).
* **Behavior:** Modal dynamically opens and activates the selected tab depending on the trigger button.

---

### 4.11. Landing Assistant Drawer (`MateenAssistantDrawer.tsx`)

A sliding side drawer dedicated exclusively to answering landing page informational questions.

#### Pre-configured Quick Action Buttons & Answers:
1. **ما هي منصة مَتِين؟**
   * *Answer:* "منصة «مَتِين» هي أول منصة تعليمية تفاعلية تدمج بين أصالة المتون والمنظومات العلمية وتقنيات الذكاء الاصطناعي الحديثة ومحركات النطق الصوتي؛ لتوفير بيئة متكاملة لطلاب العلم لضبط وتكرار ومراجعة حفظهم للمتون الشرعية بإشراف وتوجيه مشايخ موثوقين."
2. **لمن منصة مَتِين؟**
   * *Answer:* "تستهدف المنصة جميع طلاب وطالبات العلم الشرعي في مختلف المستويات؛ بدءاً من المبتدئين الراغبين في ضبط صغار المتون وتأسيس حصيلتهم العلمية، وحتى المتقدمين والمستظهرين للمنظومات الذين يبحثون عن أداة ذكية للمراجعة، والتسميع اللحظي، والربط بالشروحات المحققة."
3. **كيف يتم اختيار المشايخ في المنصة؟**
   * *Answer:* "نحرص في «مَتِين» على أعلى معايير الوثوقية والضبط العلمي؛ حيث يُشترط لانضمام المشايخ والمعلمين الحصول على إجازات علمية معتمدة، وتخضع جميع الإجازات لعملية تدقيق وتحقق صارمة من قِبل إدارة المنصة قبل القبول. كما تتيح المنصة للطالب الاطلاع المباشر على الملف الشخصي (البروفايل) للشيخ، ومعرفة شيوخه وأسانيده ومعاينة إجازاته بكل شفافية."

#### Custom Input Fallback Behavior:
* Whenever the user types a custom question into the input field, reply with:
  > "للحصول على إجابات مخصصة والاستفادة الكاملة من قدرات المساعد الذكي وتسميع المتون، يرجى تسجيل الدخول إلى حسابك."
* **Action Button:** Render a prominent button below the message: **`تسجيل الدخول`** which closes the drawer and opens `UnifiedAuthModal`.

---

## 5. Strict Negative Constraints

1. **NO Living Creature Icons/Graphics:** Ensure no icons or illustrations contain images/vectors of humans, animals, or living creatures.
2. **NO Surah Al-Fatiha in Simulator:** The simulator is exclusively for Islamic texts (*المتون الشرعية*).
3. **NO Certificate Promises:** Do not display text promising certificates (*شهادة*) in track cards.
4. **NO Level Test Button in Navbar:** Keep Navbar clean without level test CTA.