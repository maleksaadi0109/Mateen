"""Apply visually inspected sanad crops to the exact supplied opening page.

No assessment reference text changes. All coordinates use native 652x964 pixels.
"""
import hashlib
import json
from pathlib import Path

root=Path(__file__).resolve().parents[2]
path=root/"artifacts/api-server/src/data/nawawi-page-map.json"
data=json.loads(path.read_text())
h=data["hadiths"][0]
if h.get("canonicalText"):
    raise SystemExit("Sanad correction already applied; refusing to shift indices twice.")
prefix="عن أمير المؤمنين أبي حفص عمر بن الخطاب رضي الله تعالى عنه قال سمعت رسول الله صلى الله عليه وسلم يقول"
boxes=[
    (437,302,32,44,1),(391,301,37,44,1),(315,302,65,43,1),
    (274,299,31,47,1),(202,303,55,42,1),(144,302,51,43,1),(108,305,27,41,1),
    (493,344,69,42,1),(422,349,50,37,1),(389,343,30,43,1),
    (340,349,46,37,1),(305,353,33,30,1),(248,347,33,36,1),
    (167,346,65,36,1),(109,345,54,42,1),
    (532,389,29,39,1),(489,390,38,37,4),(435,390,45,39,1),
]
regions=[]
idx=0
for x,y,w,height,n in boxes:
    regions.append(dict(page=3,x=x,y=y,width=w,height=height,wordIndices=list(range(idx,idx+n))))
    idx+=n
assert idx==len(prefix.split())
for r in h["regions"]:
    regions.append({**r,"wordIndices":[i+idx for i in r["wordIndices"]]})
h["canonicalText"]=h["text"]
h["text"]=prefix+" "+h["text"]
h["textHash"]=hashlib.sha256(h["text"].encode()).hexdigest()
h["regions"]=regions
h["title"]="لا عمل إلا بنية"
h["heading"]=dict(page=3,x=211,y=216,width=245,height=69)
path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n")
corrections_path=root/"attached_assets/nawawi-page-source/corrections.json"
c=json.loads(corrections_path.read_text())
c["1"].update({key:h[key] for key in ["regions","text","canonicalText","title","heading"]})
corrections_path.write_text(json.dumps(c,ensure_ascii=False,indent=2)+"\n")
print("Applied source-page opening narration; assessment matn unchanged.")