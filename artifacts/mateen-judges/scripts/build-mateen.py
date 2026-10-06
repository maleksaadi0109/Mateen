"""Adapt the supplied presentation template, retaining original artwork."""
from pathlib import Path
import copy
import json
import re
import shutil
import yaml
from PIL import Image
yaml.SafeDumper.add_representer(str, lambda dumper, value: dumper.represent_scalar("tag:yaml.org,2002:str", value, style='"'))

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "src/data/slides-manifest.json"
ARCHIVE = ROOT / "reference/imported-template"
if not ARCHIVE.exists():
    ARCHIVE.mkdir(parents=True)
    shutil.copy2(MANIFEST, ARCHIVE / "manifest.json")
    for path in (ROOT / "src/data/slides").glob("*.yaml"):
        shutil.copy2(path, ARCHIVE / path.name)
original = json.loads((ARCHIVE / "manifest.json").read_text())
def donor(n):
    return yaml.safe_load((ARCHIVE / Path(original[n-1]["filepath"]).name).read_text())

THEME = {"colors": {"background": "#12183F", "foreground": "#F2F4FF",
                    "accent": "#2EF2C2", "surface": "#6150EA", "panel": "#1D2557"},
         "fonts": {"display": "Readex Pro", "body": "Readex Pro"}}
def color(token):
    return {"kind": "token", "token": token}
def text(id, value, x, y, w, h, size=24, token="foreground", bold=False, align="right", url=None):
    # The shared renderer has no paragraph-direction field. Unicode bidi
    # controls preserve Arabic reading order in browser and Office exports.
    def bidi(line):
        if not re.search(r"[\u0600-\u06ff]", line):
            return line
        line = re.sub(r"[A-Za-z][A-Za-z0-9.+/_-]*(?: [A-Za-z][A-Za-z0-9.+/_-]*)*",
                      lambda match: "\u2066"+match.group()+"\u2069", line)
        return "\u202b"+line+"\u202c"
    value = "\n".join(bidi(line) for line in value.split("\n"))
    run = {"text": value}
    if url:
        run["action"] = {"kind": "openUrl", "url": url, "target": "newWindow"}
    return {"id": id, "type": "text", "frame": {"x": x, "y": y, "width": w, "height": h},
            "body": {"paragraphs": [{"runs": [run], "align": align, "lineHeight": 1.25,
                      "spaceAfterPt": 0, "defaultRunStyle": {
                          "font": {"kind": "token", "token": "body"}, "sizePt": size,
                          "weight": 700 if bold else 400, "color": color(token)}}]}}
def shape(id, x, y, w, h, token="surface"):
    return {"id": id, "type": "shape", "frame": {"x": x, "y": y, "width": w, "height": h},
            "geometry": {"kind": "preset", "preset": "roundRect", "cornerRadius": 18},
            "fill": {"kind": "solid", "color": color(token)}}
def image(id, asset, x,y,w,h):
    return {"id": id, "type": "image", "assetId": asset, "fit": "contain",
            "frame": {"x":x,"y":y,"width":w,"height":h}}
def base(n, title, section, subtitle=""):
    d = donor(29)
    d["theme"] = copy.deepcopy(THEME)
    # Keep the source background and challenge logo once, not inherited duplicates.
    d["elements"] = [copy.deepcopy(d["elements"][0]), copy.deepcopy(d["elements"][2])]
    d["elements"][0]["fit"] = "contain"
    d["elements"][1]["fit"] = "contain"
    d["elements"] += [
        text("section",section,1080,102,688,62,17,"accent"),
        text("title",title,148,205,1620,150,36,bold=True),
        text("footer","تحدي الذكاء الاصطناعي في خدمة المحتوى الإسلامي",800,1000,968,48,14.5),
        text("number",f"{n:02}",112,1000,100,48,16,align="left")]
    if subtitle:
        d["elements"].append(text("subtitle",subtitle,148,350,1620,100,21))
    return d
def columns(d, items, y=425):
    for i,(head,body) in enumerate(items):
        x=1000 if i%2==0 else 180
        yy=y+(i//2)*280
        d["elements"] += [shape(f"card{i}",x-25,yy-15,810,280,"panel"),
                          text(f"h{i}",head,x,yy,760,80,27,"accent",True),
                          text(f"b{i}",body,x,yy+90,760,190,23)]
def flow(d, items):
    for i,(head,body) in enumerate(items):
        x=1440-i*420
        d["elements"] += [shape(f"box{i}",x,485,360,425),
                          text(f"step{i}",f"0{i+1}",x+25,510,310,70,25,"accent",True),
                          text(f"head{i}",head,x+25,590,310,125,24,bold=True),
                          text(f"body{i}",body,x+25,730,310,175,20)]
        if i<3:
            d["elements"].append(text(f"arrow{i}","←",x-58,620,50,75,25,"accent",align="center"))

public = ROOT/"public/images"
public.mkdir(parents=True,exist_ok=True)
captures=ROOT.parent/"mateen-intro/public/captures"
# Crop out account/navigation areas; originals remain unchanged.
for name,source in [("recitation","s09-recitation-hd.png"),("assistant","s14-answer.png"),
                    ("referral","s15-scholar-sent-demo.png")]:
    im=Image.open(captures/source)
    w,h=im.size
    im.crop((int(w*.15),int(h*.095),int(w*.79),int(h*.92))).save(public/f"{name}.png")
shutil.copy2(ROOT.parents[1]/"deliverables/mateen-registration/mateen-official-logo.png",public/"mateen-logo.png")
uploads=ROOT.parents[1]/"attached_assets"
for name,filename in [("home","image_1791308797591.png"),
                      ("journey","image_1791308985133.png"),
                      ("assistant","image_1791308986455.png")]:
    im=Image.open(uploads/filename)
    if name=="journey":
        # Remove only blank side margins; retain the original visible interface.
        im=im.crop((int(im.width*.27),0,int(im.width*.82),im.height))
    im.save(public/f"{name}.png")
slides=[]
def add(d,title,notes):
    slides.append((d,title,notes))

d=base(1,"","")
d["elements"]=[e for e in d["elements"] if e["id"] not in ("title","section")]
d["elements"][0]=copy.deepcopy(donor(8)["elements"][0])
d["elements"][0]["fit"]="contain"
d["assets"].update(donor(8)["assets"])
d["assets"].update(donor(31)["assets"])
d["assets"]["mateen"]={"src":"images/mateen-logo.png"}
d["elements"] += [shape("logoPanel",800,220,320,210,"foreground"),
                  image("mateenMark","mateen",820,235,280,180),
                  text("hero","مَتِين",260,455,1400,175,64,bold=True,align="center"),
                  text("tagline","حفظ المتون وفهمها في رحلة تعليمية واحدة",260,640,1400,170,31,align="center"),
                  text("coverDetail","عرض المشروع للمحكمين  •  فريق مَتِين",360,810,1200,80,23,"accent",align="center"),
                  image("bathel","image-3",1570,80,230,145),
                  image("aiYear","image-5",1210,80,290,150),
                  text("templateOrgs","شعارات الجهات كما وردت في قالب التحدي؛ لا تعني اعتماد مَتِين.",300,895,1320,50,14.5,align="center"),
                  image("sdaia","image-17",200,945,190,75),
                  image("future","image-18",460,945,175,75),
                  image("tts","image-19",710,945,175,75),
                  image("ministry","image-20",960,945,260,75)]
d["elements"]=[e for e in d["elements"] if e["id"]!="footer"]
add(d,"مَتِين","- قدّم مَتِين كبيئة تعليمية تربط القراءة والتسميع والفهم والتوجيه البشري.\n- شعارات التحدي جزء من القالب، وليست ادعاء شراكة أو اعتماد للمشروع.\n- حُذف رابط الغلاف الاختياري لعدم توفر وجهة مؤكدة؛ لا توجد شهادة مرفقة.")

d=base(2,"طالب المتون يحتاج أكثر من أداة منفردة","المشكلة")
columns(d,[("التسميع الذاتي","يصعب اكتشاف الكلمات المتروكة أو المستبدلة أثناء مراجعة الحفظ."),
           ("تشتّت الشروح","يتنقل الطالب بين النص والشرح وأدوات المتابعة."),
           ("حدود المساعد العام","الجواب المقنع لغويًا قد لا يستند إلى مرجع مناسب."),
           ("الوصول إلى المختص","تحتاج الأسئلة المعقدة إلى توجيه بشري، لا جواب آلي حاسم.")])
icons=donor(27)
d["assets"].update(icons["assets"])
for i,asset in enumerate(["image-11","image-12","image-13","image-14"]):
    d["elements"].append(image(f"templateIcon{i}",asset,1010 if i%2==0 else 190,435+(i//2)*280,50,50))
add(d,"المشكلة","- هذه احتياجات يعالجها المشروع، وليست نسبًا مقاسة في دراسة مستقلة.\n- لا تُستخدم نسبة الاستبيان لإثبات حجم المشكلة.")

d=base(3,"مَتِين يجمع الحفظ والفهم والتوجيه","الحل والإضافة النوعية")
d["assets"]["home"]={"src":"images/home.png"}
d["elements"] += [shape("homeFrame",150,400,1120,590,"foreground"),
                  image("homeScreen","home",165,415,1090,560),
                  text("homeLead","رحلة واحدة",1340,410,428,95,30,"accent",True),
                  text("homeBody","قراءة المتن\nتدريب التسميع\nفهم الحديث\nتوجيه بشري",1340,530,428,330,25),
                  text("homeCaption","الواجهة الرئيسية",1340,895,428,65,19)]
add(d,"الحل والإضافة النوعية","- الإضافة هي تكامل مراحل التعلم، لا ادعاء اختراع كل تقنية على حدة.\n- الإحالة ليست مكالمة صوتية أو سؤالًا مباشرًا من دليل المشايخ.\n- إتاحة الشروح المصدرية مرتبطة بالمراجعة والتقييم.")

d=base(4,"خطوات واضحة، من المتن إلى المراجعة","رحلة الطالب")
d["assets"]["journey"]={"src":"images/journey.png"}
d["elements"] += [shape("journeyFrame",200,350,550,620,"foreground"),
                  image("journeyScreen","journey",215,365,520,590)]
for i,(head,body) in enumerate([("اختيار المتن","النووية أو تحفة الأطفال"),
                              ("قراءة وتسميع","النص أولًا، ثم تدريب الكلمات"),
                              ("فهم وتوجيه","مساعد وإحالة عند الحاجة"),
                              ("مراجعة ومتابعة","عودة إلى الموضع وخطة يومية")]):
    yy=370+i*145
    d["elements"] += [shape(f"journeyCard{i}",860,yy,920,128,"panel"),
                      text(f"journeyNumber{i}",f"0{i+1}",1660,yy+20,90,80,26,"accent",True),
                      text(f"journeyHead{i}",head,900,yy+10,690,65,24,bold=True),
                      text(f"journeyBody{i}",body,900,yy+75,690,55,20)]
add(d,"رحلة الطالب","- المتنان متاحان للدراسة؛ بقية المحتوى بحسب حالته في المنصة.\n- المصدر العلمي المعتمد يظل شرطًا منفصلًا عن إتاحة واجهة الدراسة.")

def screen(n,title,asset,head,body,notice,notes):
    d=base(n,title,"من داخل المنصة")
    d["assets"][asset]={"src":f"images/{asset}.png"}
    d["elements"] += [shape("screenFrame",155,375,970,550,"foreground"),
                      image("capture",asset,175,390,930,520),
                      text("what",head,1200,430,568,90,26,"accent",True),
                      text("meaning",body,1200,545,568,355,23),
                      text("caption",notice,180,930,1588,60,15.5)]
    add(d,title,notes)
screen(5,"التسميع: النص ومطابقة الكلمات","recitation","قراءة وتدريب",
       "واجهة فعلية للأربعين النووية.\nتدريب على الكلمات؛ لا تقييم للتشكيل أو مخارج الحروف.",
       "لقطة من المشروع • قُصّت مناطق الحساب • ليست دليلًا على دقة التعرّف أو اعتماد علمي.",
       "- تظهر واجهة الدراسة الحقيقية من اللقطات الأصلية للمشروع.\n- أخطاء التعرّف على الكلام لا تُعامل تلقائيًا بوصفها أخطاء طالب مؤكدة.")
d=base(6,"اختر المتن، ثم ابدأ السؤال","المساعد التعليمي")
d["assets"]["assistant"]={"src":"images/assistant.png"}
d["elements"] += [shape("assistantFrame",205,325,625,650,"foreground"),
                  image("assistantScreen","assistant",220,340,595,620),
                  text("assistantLead","الحوار في سياق الدراسة",950,380,818,105,30,"accent",True),
                  text("assistantBody","اختيار الكتاب يحدّد سياق السؤال.\nمساران واضحان: شرح تعليمي،\nأو إجابة من المصادر.",950,520,818,265,25),
                  shape("assistantFeature",950,795,818,140,"panel"),
                  text("assistantFeatureText","عند الحاجة: إحالة إلى معلّم.",980,825,758,105,23)]
add(d,"المساعد التعليمي","- لقطة واجهة أرسلها المستخدم: حالة اختيار الكتاب قبل بدء المحادثة.\n- الشرح التعليمي غير مراجع؛ التشغيل المصدري مشروط بمصادر مؤهلة وتقييم مطابق.\n- الإحالة نصية بعد موافقة الطالب.")
screen(7,"الإحالة تبدأ بموافقة الطالب","referral","رسائل نصية فقط",
       "واجهة محادثة الإحالة ببيانات تجريبية.\nالتشغيل الفعلي يشترط معلّمًا معتمدًا ومتوافرًا.",
       "عرض تجريبي داخل الواجهة الحقيقية • لا يثبت اعتماد معلّم أو إرسال رسالة فعلية.",
       "- هذه لقطة أعدت للفيديو باستخدام بيانات عرض في المتصفح؛ ليست محادثة مستخدم حقيقية.\n- لا ننشئ حسابات مخولة أو موافقات لأغراض العرض.")

d=base(8,"الصوت له مساران مختلفان وحدود واضحة","تقنيات الصوت")
for i,(label,left,right) in enumerate([
    ("التسميع المباشر","تطبيع ومطابقة الكلمات\nوفق دعم المتصفح",
     "Web Speech API\nصوت مباشر إلى نص"),
    ("معالجة التسجيلات","محاذاة مع النص\nنتيجة أولية غير معتمدة",
     "Qwen3-ASR-0.6B\nتسجيل إلى نص محليًا")]):
    yy=430+i*260
    d["elements"] += [text(f"track{i}",label,1120,yy,648,70,26,"accent",True),
                      shape(f"inputPanel{i}",1050,yy+80,718,165),
                      shape(f"outputPanel{i}",180,yy+80,718,165),
                      text(f"input{i}",right,1080,yy+90,658,155,22),
                      text(f"output{i}",left,210,yy+90,658,155,22),
                      text(f"audioArrow{i}","←",925,yy+115,100,90,32,"accent",align="center")]
d["elements"].append(text("audioScope","لا تقييم للنطق أو التشكيل، ولا درجة معتمدة.",180,945,1588,60,20))
add(d,"تقنيات الصوت","- المساران ليسا محركًا واحدًا: المباشر يعتمد خدمة التعرّف في المتصفح، والتسجيلات تعتمد العامل المحلي.\n- جودة التعرّف العربي تحتاج قياسًا منفصلًا على تسجيلات مأذونة.\n- مخطط المباشر: صوت ← تفريغ المتصفح ← تطبيع الكلمات ← مطابقة. التسجيل: ملف ← Qwen ← تفريغ ← محاذاة أولية.")

d=base(9,"بحث نصّي ثم إعادة ترتيب دلالية","كيف يعمل RAG؟","مسار تقني منفّذ؛ إتاحته للطالب مشروطة بمصادر مؤهلة وتقييم مطابق")
flow(d,[("سؤال محدّد","المتن وسياق الطالب"),("ترشيح نصّي","تطبيع عربي؛ حتى 30 مقطعًا"),("ترتيب دلالي","نموذج لغوي؛ حتى 8 أدلة"),("اقتباس وتحقّق","نص مطابق ومرجع من الخادم")])
d["elements"].append(text("ragLimit","دون Embeddings أو قاعدة متجهات؛ الناتج اقتباسات فقط.",180,930,1588,65,21,"accent"))
add(d,"تقنيات RAG","- يُرشّح البحث النصي المقاطع أولًا، ثم يعيد النموذج اللغوي ترتيبها.\n- يُتحقق من معرف الاقتباس ومطابقته للنص المرسل فعلًا؛ بيانات المرجع تأتي من الخادم.\n- ذكر مرجع حقيقي لا يثبت أن الاقتباس مناسب للسؤال؛ لذلك يلزم تقييم مستقل.")

d=base(10,"الضوابط تقلّل المخاطر ولا تضمن السلامة","الموثوقية")
columns(d,[("حقوق ومراجعة مستقلة","إذن إعادة استخدام، إصدار محدّد، ومراجع مخوّل غير منشئ المصدر."),
           ("تقييم مرتبط بالمصدر","تغيّر النموذج أو المقاطع أو بيانات المرجع يستلزم إعادة التقييم."),
           ("امتناع بدل التخمين","عند غياب الدليل أو تعطل المزود؛ لا انتقال صامت إلى شرح عام."),
           ("إحالة عند الحاجة","طلب موافقة على نطاق المشاركة؛ التقنية لا تستبدل أهل العلم.")])
add(d,"ضوابط الموثوقية","- التحقق الحرفي يضبط الاقتباس لكنه لا يضمن ملاءمته أو صحة المصدر وحده.\n- تجهيز حزمة شرح محلية لا يساوي اعتمادها أو فهرستها للطلاب.\n- لا ندعي القضاء على الهلوسة.")

d=base(11,"تقنيات فعلية تدعم تجربة واحدة","التقنيات الداعمة")
columns(d,[("واجهة عربية","React • TypeScript • Vite\nTanStack Query لإدارة بيانات الخادم."),
           ("خادم وبيانات","Node.js • Express\nPostgreSQL • Drizzle ORM."),
           ("هوية وملفات","Clerk للمصادقة؛ صلاحيات وملكية في الخادم وتخزين ملفات خاص."),
           ("مزودون قابلون للاختيار","OpenRouter • NVIDIA • OpenAI\nدعم برمجي، لا تشغيل الجميع معًا.")])
add(d,"التقنيات الداعمة","- الأسماء مستندة إلى الحزم والكود الفعلي، لا إلى المواصفات القديمة وحدها.\n- دعم المزود في الكود لا يثبت توافره أو جودة العربية في كل جلسة.\n- لا نعرض مفاتيح أو بيانات جلسات أو روابط ملفات خاصة.")

d=base(12,"المسار المفتوح يناسب تكامل الحل","لماذا المسار المفتوح؟")
columns(d,[("الشمولية والتكامل","رحلة متون كاملة بدل أداة منفردة للتفريغ أو الأسئلة."),
           ("توظيف تقنيات متعددة","معالجة الصوت واسترجاع مقيد بالمراجع ضمن تجربة واحدة."),
           ("الاستجابة للمشكلة","التسميع الذاتي وتشتّت الشروح والحاجة إلى توجيه بشري."),
           ("معنى «المفتوح» هنا","اختيار مسار المشاركة؛ ليس إعلانًا بأن البرمجيات مفتوحة المصدر أو ضمانًا علميًا.")])
add(d,"لماذا المسار المفتوح؟","- نبرر اختيار مسار المشاركة بطبيعة المشروع المتكاملة.\n- لا نساوي اسم المسار بترخيص الشيفرة أو اعتماد الجودة العلمية.")

d=base(13,"قبول الفكرة لا يثبت جودة المنتج","الأثر والتحقق")
d["elements"] += [text("stat","78.7%",1000,405,768,240,92,"accent",True,align="center"),
                  text("attribution","بحسب الاستبيان الذي جمعه فريق مَتِين",1000,700,768,130,24,align="center"),
                  text("evidenceTitle","ما الذي نعرفه؟",180,450,720,80,29,"accent",True),
                  text("evidence","نسبة الفريق دون تحقق مستقل.\nلا نستنتج سؤالًا أو عينة أو منهجية.\nجودة المنتج والأثر لم يُقاسا بعد.",180,555,720,340,22),
                  text("future","الأثر المستهدف: انتظام الدراسة والفهم والمراجعة.",180,920,1588,65,21)]
add(d,"الأثر والاستبيان","- أكد المستخدم أن نسبة 78.7% من استبيان جمعه الفريق، وطلب الاستمرار.\n- لا يوجد رابط للاستبيان أو نص سؤال متحقق؛ لا نخلطها بنسبة مختلفة وردت في عرض سابق.\n- القياس القادم يستهدف الاستمرار وجودة كشف الكلمات ومناسبة الأدلة، لا وقت الاستخدام وحده.")

d=base(14,"المراجع وروابطها وحالة اعتمادها","المصادر")
refs=[
 ("شرح الأربعين النووية — ابن عثيمين","https://aljam3.com/3190/7673/7","حزمة تجهيز محلية قيد المراجعة؛ غير معتمدة للطلاب."),
 ("شرح الأربعين النووية — ابن عثيمين (الشاملة)","https://shamela.ws/book/21812","مقتطفات إلكترونية مرجعية غير مراجعة؛ ليست corpus معتمدًا."),
 ("فتح القوي المتين — عبد المحسن العباد","https://shamela.ws/book/11325","مرجع مقتطفات إلكترونية غير معتمد علميًا داخل مَتِين."),
 ("Web Speech API — مرجع التقنية","https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API","التعرّف على الكلام في المتصفح يعتمد الدعم والإذن والاتصال."),
 ("Qwen3-ASR-0.6B — بطاقة النموذج","https://huggingface.co/Qwen/Qwen3-ASR-0.6B","مرجع النموذج؛ لا يثبت دقة تطبيق مَتِين أو صلاحيته للتقييم.")
]
for i,(head,url,desc) in enumerate(refs):
    yy=385+i*115
    d["elements"] += [text(f"ref{i}",head,180,yy,1588,60,24,"accent",True,url=url),
                      text(f"desc{i}",desc,180,yy+60,1588,55,20)]
add(d,"المصادر","- الروابط عامة قابلة للنقر؛ لا توجد مستندات خاصة أو رابط شهادة مختلق.\n- هوية شرح ابن عثيمين مثبتة من بيانات صفحة المصدر المحفوظة.\n- مصادر الحقائق الداخلية: docs/mateen-rag.md، docs/scholarly-assistant-operations.md، وتقرير التحقق من التسميع والكود الفعلي.\n- حزمة الجامع غير مفهرسة للطلاب؛ المقابلة الجزئية ليست مراجعة علمية كاملة.")

# Keep the manifest free of instruction/example slides and orphan documents.
for f in (ROOT/"src/data/slides").glob("*.yaml"):
    f.unlink()
manifest=[]
for n,(doc,title,notes) in enumerate(slides,1):
    id=f"mateen-{n:02}"
    path=f"src/data/slides/{id}.sdm.yaml"
    (ROOT/path).write_text(yaml.safe_dump(doc,allow_unicode=True,sort_keys=False),encoding="utf-8")
    manifest.append({"id":id,"position":n,"kind":"sdm","filepath":path,
                     "title":title,"description":title,"speakerNotes":notes})
MANIFEST.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
