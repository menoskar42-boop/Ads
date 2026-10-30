# برومبت الإكستنشن: نص الأسفار القانونية التانية كامل من الأنبا تكلا (عن طريق موقعنا)

> طلب المالك ٢٠٢٦-١٠-٣٠: «ازاى عندنا الأسفار القانونيه مش كامله» ← «اه اعمل البرومبت».
> اللى متخزّن عندنا (`mybible/data/deutero/` و`apocrypha-content.ts`) مقتطفات بس، فالقطمارس بيعرض ١٢ نبوة بنصها
> من ٤١. تبويب «الأسفار القانونية» فى الأرثوذكسيات بيعرض الأسفار كاملة بس **بيجيبها لحظياً من الأنبا تكلا**
> ومابيحتفظش بنسخة. البرومبت ده بيجمع نفس النص (نفس المصدر ونفس المحلّل اللى الزوار بيشوفوه) فى ملف واحد
> يترفع على GitHub فى فرع لوحده، وكلود يحطه فى `data/deutero` ويختبره آية آية قدّام مراجع القطمارس قبل ما يتعرض.
> بيئة كلود مقفول فيها موقعنا والأنبا تكلا (403 من البروكسى)، عشان كده من متصفح المالك.
> **Trigger:** «ابعتلي برومبت الأسفار القانونية».

```
مهمتك تجمع نص الأسفار القانونية التانية كامل (٧ أسفار — ١٣٧ إصحاح) من موقع الكتاب المقدس
بتاعنا فى ملف واحد، وترفعه على GitHub فى فرع لوحده. قراية بس من الموقع.

خطوط حمرا (ممنوع تتخطّاها):
- على mybible.oscardevs.com: طلبات GET بس على المسار المكتوب تحت. ماتسجّلش دخول، وماتفتحش أى
  صفحة أدمن، وماتبعتش أى طلب POST، وماتستخدمش أى مفتاح (MYBIBLE_SEED_KEY أو غيره)، وماتلمسش
  مسارات import أو seed أو fix.
- ماتفتحش st-takla.org بنفسك — موقعنا هو اللى بيجيب منه.
- طلب واحد كل ٣ ثوانى على الأقل. لو أكتر من ١٠ إصحاحات فشلت: وقّف وقولّى.
- على GitHub: ارفع الملف ده بس فى الفرع الجديد. ماتعدّلش أى ملف تانى، وماتعملش Pull Request،
  وماتغيّرش أى إعداد.

الخطوة ١ — افتح تاب جديد على:
  https://mybible.oscardevs.com/
وشغّل الكود ده فى الصفحة (Console أو أداة تشغيل JavaScript). بيشتغل فى الخلفية حوالى ٨ دقايق:

(() => {
  const BOOKS = { 67: 14, 68: 16, 69: 19, 70: 51, 71: 6, 72: 16, 73: 15 };
  const out = { source: null, fetchedAt: new Date().toISOString(), books: [], failed: [] };
  window.__deutero = out; window.__deuteroDone = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    for (const [id, n] of Object.entries(BOOKS)) {
      const book = { siteBookId: Number(id), name: null, chapters: [] };
      out.books.push(book);
      for (let ch = 1; ch <= n; ch++) {
        let ok = false;
        for (let t = 0; t < 3 && !ok; t++) {
          await sleep(3000);
          try {
            const r = await fetch(`/api/deutero/sttakla/books/${id}/chapters/${ch}`);
            const j = await r.json();
            if (r.ok && j.ok && Array.isArray(j.verses) && j.verses.length) {
              book.name = j.book.name; out.source = j.source;
              book.chapters.push({ chapter: ch, sourceUrl: j.sourceUrl, verses: j.verses });
              ok = true;
            }
          } catch (e) {}
        }
        if (!ok) out.failed.push(`${id}:${ch}`);
        window.__deuteroProgress = `${id}:${ch}`;
      }
    }
    window.__deuteroDone = true;
  })();
  return "اتبدأ";
})();

الخطوة ٢ — كل دقيقة شوف التقدّم بالكود ده لحد ما done تبقى true:

({ done: window.__deuteroDone, at: window.__deuteroProgress, failed: window.__deutero.failed.length })

الخطوة ٣ — لما يخلص، شغّل الكود ده وابعتلى نتيجته كاملة:

(() => {
  const d = window.__deutero;
  return {
    source: d.source, failed: d.failed,
    books: d.books.map((b) => ({
      id: b.siteBookId, name: b.name, chapters: b.chapters.length,
      verses: b.chapters.reduce((s, c) => s + c.verses.length, 0),
      gaps: b.chapters.filter((c) => c.verses.some((v, i) => v.verse !== i + 1)).map((c) => c.chapter),
    })),
    sample: d.books[0]?.chapters[1]?.verses[0]?.text?.slice(0, 120),
  };
})();

لو failed فيها أكتر من ١٠ — وقّف هنا وابعتلى النتيجة بس.

الخطوة ٤ — نزّل الملف بالكود ده (هينزل فى Downloads باسم sttakla-deutero.json):

(() => {
  const blob = new Blob([JSON.stringify(window.__deutero)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "sttakla-deutero.json"; a.click();
  return "اتنزّل";
})();

الخطوة ٥ — ارفعه على GitHub:
- افتح: https://github.com/menoskar42-boop/Ads/upload/claude/build-oscardevs-ads-mvp-8krfN/mybible/data/deutero
- ارفع ملف sttakla-deutero.json من Downloads. لو مش قادر تختار ملف من الجهاز: وقّف وقولّى
  «محتاج تسحب الملف بإيدك»، والمالك هيسحبه على الصفحة.
- رسالة الـcommit: deutero: St-Takla deuterocanon text export (data only)
- اختار «Create a new branch for this commit» واسم الفرع بالظبط: deutero-sttakla-import
- دوس «Propose changes». الصفحة اللى بعدها (Open a pull request) ماتعملش فيها حاجة — اقفلها.

فى الآخر ابعتلى: نتيجة الخطوة ٣، واسم الفرع، وهل الرفع تم.
```

## بعد ما الملف يوصل (شغل كلود)

- `git fetch origin deutero-sttakla-import` وناخد `mybible/data/deutero/sttakla-deutero.json` بس.
- ⚠️ أرقام الأسفار فى الملف أرقام موقعنا (`STTAKLA_BOOKS` فى `server/deutero.ts`: ٦٧ طوبيا · ٦٨ يهوديت · ٦٩ الحكمة ·
  ٧٠ يشوع بن سيراخ · ٧١ باروخ · ٧٢ المكابيين الأول · ٧٣ المكابيين الثانى) — **مش** أرقام katameros (٦٧ باروخ ·
  ٦٨ طوبيا…). الربط بالاسم.
- اختبار `katameros-text.test.ts` بيتأكد إن كل نبوة طالعة بعدد آياتها. وقبل ما أعتمد ترقيم الترجمة دى بقارن
  بداية ونهاية كل نبوة بالمقتطفات اللى عندنا (طوبيا بالذات بيختلف ترقيمه من ترجمة لترجمة)، وأى قراءة مش مطابقة
  تفضل مرجع من غير نص.
- الفرع `deutero-sttakla-import` يتمسح بعدها (المالك من GitHub).
