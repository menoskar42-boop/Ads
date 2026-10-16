---
name: replit-publish
description: سحب آخر تعديلات الفرع claude/build-oscardevs-ads-mvp-8krfN فى مشروع ريبليت «sf» وعمل Republish، والتأكد إن الموقع شغّال — عن طريق كلود كروم (Claude in Chrome). نفّذها على طول من غير سؤال لما المالك يقول «انشر» / «اسحب وانشر» / «Republish» / «نزّل التعديلات على الموقع» / «اعمل pull و Republish»، أو بعد ما تخلّص تعديلات اتعملها push والمالك عايزها تنزل على الموقع.
---

# اسحب وانشر — مشروع ريبليت «sf»

**«انشر» = نفّذ على طول من غير ما تسأل** (قرار المالك ٢٠٢٦-١٠-١٥) — الإذن للسحب والنشر بس.

قرار المالك (٢٠٢٦-١٠-١٥): السحب والنشر بيتعملوا من جلسة على جهازه (Local) فيها كلود كروم،
والتعديلات نفسها ممكن تتعمل من أى جلسة (Cloud أو Local) وتتعمل push على نفس الفرع.

- المشروع: https://replit.com/@menoskar42/sf (اسمه كان `Ads`، دلوقتى `sf`)
- الفرع الوحيد: `claude/build-oscardevs-ads-mvp-8krfN`
- الموقع المنشور: https://sf-menoskar42.replit.app/ (وعليه oscardevs.com، mykid، Service Flow، mybible)

## قبل ما تبدأ

1. **لازم أدوات كلود كروم** (`mcp__claude-in-chrome__*`). اقرا skill `anthropic-skills:chrome-browser`
   الأول لو موجودة. لو الأدوات مش موجودة (جلسة Cloud مثلاً) ⇒ **متكمّلش**، وقول للمالك
   فى سطرين إن النشر محتاج جلسة Local فيها كلود كروم، واديله الأمرين يعملهم بإيده (الخطوة ٢ و٤).
2. لو المستودع عندك: `git fetch origin claude/build-oscardevs-ads-mvp-8krfN` واحفظ آخر commit
   (`git log --oneline -1 origin/claude/build-oscardevs-ads-mvp-8krfN`) — عشان تقارنه باللى هيطلع فى ريبليت.
   ولو عندك تعديلات لسه مااترفعتش ⇒ اعملها commit و push الأول (بنفس قواعد CLAUDE.md).

## الخطوات

### ١) افتح المشروع
تاب جديد فى كروم على https://replit.com/@menoskar42/sf (أو استخدم تاب مفتوح عليه).
لو طلب تسجيل دخول ⇒ اقف وقول للمالك يسجّل دخول بنفسه. **متكتبش كلمات سر.**

### ٢) اسحب
افتح تاب **Shell** (لو مش ظاهر: «+» ← Shell) واكتب:

```
cd ~/workspace && git pull origin claude/build-oscardevs-ads-mvp-8krfN
```

استنى لحد ما يرجع `~/workspace$`.
- `Fast-forward` / `files changed` / `Already up to date` ⇒ تمام.
- `index.lock` أو `Another git process` ⇒ `rm -f ~/workspace/.git/index.lock` وأعد السحب **مرة واحدة**.
- `CONFLICT` / `would be overwritten` / `Please commit your changes` / أى `error` ⇒ **اقف ومتنشرش**،
  وانقل الرسالة للمالك زى ما هى. ممنوع reset أو stash أو checkout أو force.

بعدها `git log --oneline -1` ولازم يطابق آخر commit على GitHub (من «قبل ما تبدأ»).

### ٣) أصوات mykid (لو التعديلات فيها كلام جديد لميزو)
```
cd ~/workspace/mykid && node --import ./server/_node-shim.mjs server/warm-tts.js --dry
```
- `ناقص: 0` ⇒ كمّل للنشر.
- فيه ناقص ⇒ `npm run warm-tts` (بيطبع ✓ لكل جملة، وممكن ياخد وقت — استنى لحد ما يخلص)، وبعدين:
  ```
  cd ~/workspace && git add mykid/server/tts-prebuilt && git commit -m "mykid: أصوات جديدة" && git push origin claude/build-oscardevs-ads-mvp-8krfN
  ```
  (ده الـpush الوحيد المسموح من ريبليت. ولو المستودع عندك محلياً اعمل `git pull` بعدها.)

### ٤) Republish
زرار **Republish** فوق على اليمين (جنب Invite). لو فتح لوحة Publishing دوس Republish/Publish جوّاها.
**متغيّرش أى إعداد** (نوع الجهاز، الدومين، الـSecrets، أوامر التشغيل).
استنى لحد ما يظهر إنه اتنشر بنجاح (عادةً ٣–١٠ دقايق). لو فشل: انقل رسالة الخطأ وآخر سطور
الـlogs زى ما هى، ومتحاولش تصلّح من غير ما تقول للمالك.

### ٥) اتأكد
- افتح https://sf-menoskar42.replit.app/ — لازم تفتح عادى (مش صفحة خطأ).
- لو التعديل فى حاجة معيّنة (صفحة فى mykid، تقرير فى Service Flow…) افتحها واتأكد إن التعديل ظاهر،
  وخد صورة. (mykid بيستخدم service worker — لو شايف النسخة القديمة اعمل reload مرتين.)

## خطوط حمرا
- متكتبش فى شات **Agent** بتاع ريبليت خالص (بيصرف كريدت) — الـShell وزرار Republish بس.
- متفتحش الـSecrets ولا تعرض أى قيمة منها، ولا تغيّر إعدادات النشر أو الدومين.
- مفيش push من ريبليت غير ملفات `mykid/server/tts-prebuilt` فى الخطوة ٣.
- أى طلب دفع أو «Upgrade» أو زيادة خطة ⇒ اقف وقول للمالك.
- الـShell فى ريبليت ممكن يوصل لقاعدة بيانات غير اللى الموقع بيقرا منها (`docs/HANDOVER.md`) —
  متشغّلش أى SQL أو سكربت بيكتب فى القاعدة من الـShell فى السكيل دى.

## التقرير للمالك (بالمذكّر، من غير ☺️/😊)
١) نتيجة السحب + سطر `git log --oneline -1`.
٢) الأصوات: ناقص كام واتسجّلت ولا لأ.
٣) الـRepublish: نجح ولا فشل.
٤) الموقع فتح + صورة للتعديل لو فيه.
