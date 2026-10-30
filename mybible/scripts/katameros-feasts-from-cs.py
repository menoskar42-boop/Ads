#!/usr/bin/env python3
"""
قراءات الأعياد من كود katameros-api (C#) ⇒ data/katameros/feasts-readings.json

قراءات الأعياد (الميلاد، الغطاس، البصخة، القيامة…) مكتوبة فى الكود مش فى قاعدة البيانات، فالسكربت ده
بيقرا ملفات reference-src/Factories كنص (مابيشغّلش أى كود منهم) ويطلّع منها نفس الأقسام بنفس الترتيب.
وفى الآخر بيعدّ نداءات Make* فى المصدر (من غير التعليقات) ويتأكد إنها نفس عدد اللى طلع — مفيش قراءة تقع.

Usage (من فولدر mybible):  python3 -I scripts/katameros-feasts-from-cs.py
"""
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "data", "katameros", "reference-src", "Factories")
OUT = os.path.join(ROOT, "data", "katameros", "feasts-readings.json")

SECTION_IDS = {
    "Vespers": "vespers", "Matins": "matins", "Liturgy": "liturgy",
    "FirstHour": "hour-1", "ThirdHour": "hour-3", "SixthHour": "hour-6", "NinthHour": "hour-9",
    "EleventhHour": "hour-11", "TwelfthHour": "hour-12",
    "EveFirstHour": "eve-hour-1", "EveThirdHour": "eve-hour-3", "EveSixthHour": "eve-hour-6",
    "EveNinthHour": "eve-hour-9", "EveEleventhHour": "eve-hour-11",
}
MONTHS = {"Thout": 1, "Babah": 2, "Hatour": 3, "Kiahk": 4, "Toubah": 5, "Amshir": 6, "Baramhat": 7,
          "Baramoudah": 8, "Bashans": 9, "Baounah": 10, "Abib": 11, "Misra": 12, "Nasie": 13}
SUB_CALLS = ["MakeOldTestament", "MakePsalmAndGospelLent", "MakePsalmsAndGospels", "MakePsalmAndGospel",
             "MakePauline", "MakeCatholic", "MakeActs", "MakePsalm"]
SECTION_CALLS = ["MakeVespers", "MakeMatins", "MakeLitugy"]


def strip_comments(s):
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    return re.sub(r"//[^\n]*", "", s)


def balanced(s, i):
    """s[i] == '(' ⇒ النص اللى جوّه القوسين ومكان آخرهم."""
    depth, j, in_str = 0, i, False
    while j < len(s):
        c = s[j]
        if in_str:
            if c == '"':
                in_str = False
        elif c == '"':
            in_str = True
        elif c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return s[i + 1:j], j
        j += 1
    raise ValueError("قوس مفتوح")


def args(text):
    """«"a", null, Tk.A("x","y")» ⇒ ["a", None, ["x","y"]]."""
    out, i = [], 0
    while i < len(text):
        c = text[i]
        if c == '"':
            j = text.index('"', i + 1)
            out.append(text[i + 1:j]); i = j + 1
        elif text.startswith("null", i):
            out.append(None); i += 4
        elif text.startswith("Tk.A(", i):
            inner, j = balanced(text, i + 4)
            out.append(args(inner)); i = j + 1
        elif c in " ,\n\r\t":
            i += 1
        else:
            raise ValueError("معامل مش متوقّع: " + text[i:i + 40])
    return out


def psalm_gospel(a, joyous):
    if len(a) == 3:   # MakePsalmAndGospel(psalm, psalm2, gospel)
        return {"type": "psalm-gospel", "psalms": [a[0], a[1]], "gospels": [a[2]], "joyous": joyous}
    return {"type": "psalm-gospel", "psalms": [a[0]] if a[0] else [], "gospels": [a[1]], "joyous": joyous}


def section_from(call, a):
    sid = {"MakeVespers": "vespers", "MakeMatins": "matins", "MakeLitugy": "liturgy"}[call]
    subs = []
    if call in ("MakeVespers", "MakeMatins"):
        if len(a) > 2 and a[2]:
            subs.append({"type": "prophecy", "ref": a[2]})
        subs.append(psalm_gospel(a[:2], True))
    else:
        p, c, x, ps, g = a
        subs += [{"type": "pauline", "ref": p}, {"type": "catholic", "ref": c}, {"type": "acts", "ref": x},
                 {"type": "synaxarium"}]
        if g:
            subs.append(psalm_gospel([ps, g], True))
    return {"id": sid, "title": None, "subSections": subs}


def sub_from(call, a):
    if call == "MakeOldTestament":
        return {"type": "prophecy", "ref": a[0]}
    if call == "MakePsalmAndGospelLent":
        return psalm_gospel(a, False)
    if call == "MakePsalmAndGospel":
        return psalm_gospel(a, True)
    if call == "MakePsalmsAndGospels":
        return {"type": "psalm-gospel", "psalms": a[0], "gospels": a[1], "joyous": False, "simple": True}
    return {"type": {"MakePauline": "pauline", "MakeCatholic": "catholic", "MakeActs": "acts", "MakePsalm": "psalm"}[call], "ref": a[0]}


def parse_method(body):
    """جسم دالة Construct* ⇒ {sections} أو {annual: {month, day}}."""
    m = re.search(r"GetReadingsForAnnual\(\s*new LocalDate\(1,\s*CopticMonths\.(\w+),\s*(\d+)", body) \
        or re.search(r"GetReadingsForAnnual\(\s*CopticDateHelper\.CreateCopticDate\((\d+),\s*CopticMonths\.(\w+)\)", body)
    if m:
        a, b = m.group(1), m.group(2)
        month, day = (MONTHS[a], int(b)) if a in MONTHS else (MONTHS[b], int(a))
        return {"annual": {"month": month, "day": day}}
    sections, cur, calls = [], None, 0
    pat = re.compile(r"new Section\(SectionType\.(\w+)\)|Title = (\$\"[^\"]*\"|[A-Za-z]+)\s*,|_readingsRepository\.(" + "|".join(SECTION_CALLS + SUB_CALLS) + r")\(")
    i = 0
    while True:
        m = pat.search(body, i)
        if not m:
            break
        if m.group(1):
            cur = {"id": SECTION_IDS[m.group(1)], "title": None, "subSections": []}
            sections.append(cur); i = m.end()
        elif m.group(2) is not None:
            t = m.group(2)
            if cur is not None and not t.startswith("await"):
                cur["title"] = t[2:-1] if t.startswith('$"') else "{" + t + "}"
            i = m.end()
        else:
            call = m.group(3)
            inner, j = balanced(body, m.end() - 1)
            a = args(inner)
            calls += 1
            if call in SECTION_CALLS:
                cur = section_from(call, a)
                sections.append(cur)
            else:
                cur["subSections"].append(sub_from(call, a))
            i = j + 1
    nxt = re.search(r"var NextDay = await GetFeastTranslation\(Feast\.(\w+)\)", body)
    out = {"sections": sections, "calls": calls}
    if nxt:
        out["nextDayFeast"] = nxt.group(1)
    return out


def methods(src):
    for m in re.finditer(r"(?:private|public) async Task<DayReadings\??> (Construct\w+|Process)\(\)\s*\{", src):
        body, depth, j = "", 1, m.end()
        while depth:
            c = src[j]
            depth += (c == "{") - (c == "}")
            j += 1
        yield m.group(1), src[m.end():j - 1]


def main():
    result, expected, got = {}, 0, 0
    files = [os.path.join(SRC, "Feasts", f) for f in sorted(os.listdir(os.path.join(SRC, "Feasts"))) if f.endswith(".cs")]
    files.append(os.path.join(SRC, "SpecialCases", "Theophany.cs"))
    for path in files:
        src = strip_comments(open(path, encoding="utf-8-sig").read())
        for name, body in methods(src):
            if name == "Process":
                name = "ConstructTheophanyParamounSpecial"
            parsed = parse_method(body)
            n = parsed.pop("calls", 0)
            got += n
            expected += len(re.findall(r"_readingsRepository\.(?:" + "|".join(SECTION_CALLS + SUB_CALLS) + r")\(", body))
            result[name] = parsed
    # القيامة: الدالة بتبنى القداس فى MakeLiturgy() بمتغيّرات (مش نصوص مباشرة) ومن غير سنكسار — منقولة هنا
    # بالحرف من reference-src/Factories/Feasts/Easter.cs
    easter = result["ConstructEaster"]
    assert [s["id"] for s in easter["sections"]] == ["matins"], easter
    easter["sections"].append({"id": "liturgy", "title": None, "subSections": [
        {"type": "pauline", "ref": "46.15:23-50"}, {"type": "catholic", "ref": "60.3:15-4:6"},
        {"type": "acts", "ref": "44.2:22-35"},
        {"type": "psalm-gospel", "psalms": ["19.118:24,25,27"], "gospels": ["43.20:1-18"], "joyous": True}]})
    assert got == expected, (got, expected)
    json.dump(result, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(result)} عيد/حالة — {got} نداء من {expected} فى المصدر ⇒ {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    sys.exit(main())
