# برومبتين: جمع قراءات السنة من katameros والأنبا تكلا (والمقارنة عند كلود)

> المالك ٢٠٢٦-١٠-٣٠: برومبت المقارنة (`docs/KATAMEROS_COMPARE_PROMPT.md`) اتشغّل على مانوس و«المقارنة لم تكتمل» —
> رجع بس تجربة على يوم واحد (katameros رد 200) وسكربت `compare_readings.py` كان بيحاول يجيب الموقعين ويقارن
> فى نفس الوقت ويطبع فى الآخر بس، فلما وقف ضاع كل اللى اتجمع. وكمان كان بيوقف لو لقى كلمة captcha أو cloudflare
> فى أى صفحة — وصفحات الأنبا تكلا ممكن يبقى فيها الكلمة دى فى فورم التعليقات وهى شغّالة عادى.
> **البديل:** مانوس **يجمع بس** (من غير ما يفسّر ولا يقارن)، ويكتب كل يوم فى الملف أول ما يخلص (لو وقف بيكمّل من
> آخر يوم)، وكلود يعمل المقارنة هنا بالكود على محرّك القطمارس بتاعنا (`mybible/server/katameros-local.ts`).
> الملف بيوصل بنفس طريقة ملف الأسفار القانونية: txt من مانوس ← الإكستنشن يرفعه على فرع لوحده.
> **Trigger:** «ابعتلي برومبت جمع القطمارس».

## البرومبت ١ — لمانوس

```
عايزك تجمع قراءات القطمارس القبطى لكل يوم من ١١ سبتمبر ٢٠٢٦ لحد ١١ سبتمبر ٢٠٢٧ (٣٦٦ يوم) من موقعين،
وتحفظها زى ما هى فى ملف. **جمع بس** — ماتقارنش ولا تفسّر ولا تعدّل أى مرجع؛ المقارنة هتتعمل بعدين.

خطوط حمرا:
- طلبات GET بس. ماتسجّلش دخول ولا تملا أى فورم.
- ٣ ثوانى على الأقل بين أى طلبين لنفس الموقع.
- لو ظهر 403 أو 429 أو كابتشا أو حظر: وقّف فوراً وقولّى آخر يوم اتحفظ.

شغّل السكربت ده بـ python3 (محتاج requests وbeautifulsoup4). بيكتب سطر لكل يوم فى katameros-takla-1743.jsonl
أول ما اليوم يخلص، ولو اتقفل أو وقف شغّله تانى وهو بيكمّل من بعد آخر يوم محفوظ:

import json, os, time, sys
from datetime import date, timedelta
from urllib.parse import parse_qs, unquote
import requests
from bs4 import BeautifulSoup

OUT = "katameros-takla-1743.jsonl"
START, END = date(2026, 9, 11), date(2027, 9, 11)
H = {"User-Agent": "Mozilla/5.0 (compatible; katameros-collect/1.0)"}

def blocked(r):
    # بس 403/429 — صفحات الأنبا تكلا فيها كلمة captcha فى فورم التعليقات حتى وهى شغّالة عادى
    return r.status_code in (403, 429)

def katameros(d):
    r = requests.get(f"https://api.katameros.app/readings/gregorian/{d:%d-%m-%Y}?languageId=3", headers=H, timeout=45)
    if blocked(r): sys.exit(f"katameros اتقفل يوم {d} (HTTP {r.status_code})")
    if r.status_code != 200: return {"error": r.status_code}
    j = r.json()
    return {"title": j.get("title"), "periodInfo": j.get("periodInfo"), "sections": [
        {"title": s.get("title"), "subSections": [
            {"title": u.get("title"), "readings": [
                [{"bookId": p.get("bookId"), "chapter": p.get("chapter"), "ref": p.get("ref")} for p in (rd.get("passages") or [])]
                for rd in (u.get("readings") or [])]}
            for u in (s.get("subSections") or [])]}
        for s in (j.get("sections") or [])]}

def takla(d):
    url = (f"https://st-takla.org/zJ/index.php/ar-readings-katamares?view=today-arabic&dbl=ar"
           f"&iday={d.day:02d}&imonth={d.month:02d}&iyear={d.year}")
    r = requests.get(url, headers=H, timeout=45)
    if blocked(r): sys.exit(f"الأنبا تكلا اتقفل يوم {d} (HTTP {r.status_code})")
    if r.status_code != 200: return {"error": r.status_code}
    s = BeautifulSoup(r.text, "html.parser")
    node = s.find(string=lambda x: x and x.strip() == "العشية")
    if not node:
        if "captcha" in r.text.lower(): sys.exit(f"الأنبا تكلا طلب كابتشا يوم {d}")
        return {"error": "مفيش كلمة العشية فى الصفحة"}
    items = []
    for x in node.find_parent("div").find_all(["p", "a", "h1", "h2", "h3", "h4"]):
        txt = " ".join(x.get_text(" ", strip=True).split())
        if x.name == "a":
            href = x.get("href", "")
            q = parse_qs(href.split("?", 1)[1] if "?" in href else "")
            ref = unquote((q.get("E_Ref") or [""])[0])
            if ref: items.append({"a": txt, "ref": ref})
        elif txt and len(txt) < 200:
            items.append({"h": txt})
    return {"items": items}

done = set()
if os.path.exists(OUT):
    for line in open(OUT, encoding="utf-8"):
        try: done.add(json.loads(line)["date"])
        except Exception: pass
d = START
while d <= END:
    if d.isoformat() not in done:
        k = katameros(d); time.sleep(3)
        t = takla(d); time.sleep(3)
        with open(OUT, "a", encoding="utf-8") as f:
            f.write(json.dumps({"date": d.isoformat(), "katameros": k, "takla": t}, ensure_ascii=False) + "\n")
        print(d, "✓", flush=True)
    d += timedelta(days=1)
print("خلص:", len(open(OUT, encoding="utf-8").readlines()), "يوم")

لما يخلص (أو لو وقف ومش راضى يكمّل):
1) اعمل نسخة من الملف باسم katameros-takla-1743.txt (نفس المحتوى بالحرف) ونسخة zip، واديلى لينك تنزيل لكل واحد.
2) اكتبلى: عدد الأيام المحفوظة، أول وآخر يوم، وكام يوم فيه "error" فى كل موقع (وأمثلة منها).
```

## البرومبت ٢ — لكلود إكستنشن (بعد ما الملف ينزل فى Downloads)

```
مهمتك ترفع ملف واحد على GitHub فى فرع جديد وتبعتلى اللينك. مفيش أى حاجة تانية.

خطوط حمرا:
- ارفع الملف ده بس. ماتعدّلش ولا تمسح أى ملف تانى فى المستودع.
- ماتعملش Pull Request، وماتغيّرش أى إعداد، وماتلمسش فرع claude/build-oscardevs-ads-mvp-8krfN
  نفسه (الرفع بيروح لفرع جديد).

الخطوات:
1) لو الملف لسه مانزلش: افتح صفحة المشاركة بتاعة مانوس اللى المالك هيديهالك ودوس زرار التنزيل.
   الملف katameros-takla-1743.txt أو zip — أى واحد ينفع.
2) افتح:
   https://github.com/menoskar42-boop/Ads/upload/claude/build-oscardevs-ads-mvp-8krfN/mybible/data/katameros
3) ارفع الملف من Downloads. لو مش قادر تختار ملف من الجهاز: وقّف وقولّى «اسحب الملف بإيدك على
   الصفحة»، وكمّل بعد ما المالك يسحبه.
4) رسالة الـcommit: katameros: St-Takla and katameros readings for 1743 (data only)
5) اختار «Create a new branch for this commit» واسم الفرع بالظبط: katameros-takla-data
6) دوس «Propose changes». الصفحة اللى بعدها (Open a pull request) ماتعملش فيها حاجة.
7) ابعتلى لينك الملف فى الفرع، واسم الفرع، وحجم الملف.
```

## بعد ما الملف يوصل (شغل كلود)

- `git fetch origin katameros-takla-data` وناخد الملف بس لـ`mybible/data/katameros/review/`.
- مقارنة ١: محرّكنا (`getKatamerosPlan`) قدّام رد katameros يوم بيوم ⇒ أى فرق = غلطة فى النقل عندنا.
- مقارنة ٢: محرّكنا قدّام الأنبا تكلا (مراجع `E_Ref` بالإنجليزى ⇒ رقم السفر) ⇒ كل فرق يتصنّف: غلط عندهم / عندنا /
  محتاج القطمارس المطبوع. الجدول بيرجع للمالك.
