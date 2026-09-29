import fitz
from PIL import Image, ImageDraw
p='attached_assets/دليل_التحدي_1790705047295.pdf'
d=fitz.open(p)
print('pages:',len(d),'page0:',d[0].rect)
for i in [0,1,11,42]:
 if i>=len(d):continue
 pg=d[i]; pix=pg.get_pixmap(matrix=fitz.Matrix(1,1))
 pix.save(f'.agents/outputs/challenge-{i+1}.png')
 print('\n===PAGE',i+1,'===\n',pg.get_text()[:5000])
for i,p in enumerate(d):
 t=p.get_text()
 if any(w in t for w in ['العرض التقديمي','خطة الاستمرار','النتائج','صور المشروع']):
  print('MATCH',i+1,' '.join(t.split())[:1400])
