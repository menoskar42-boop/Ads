# برومبت Replit Agent: صور مطبات من الإنترنت لتدريب موديل المطبات (٢٠٢٦-١١-١٩)

**طلب المالك:** «خلّى ريبليت يدوّر على صور حتى للإنترنت لمطبات فى مصر تستخدمها فى التدريب للموديل».

**الشروط (كلود):**
- صور **برخصة مفتوحة بس** (CC0 · CC-BY · CC-BY-SA · MIT · Public Domain) — Wikimedia Commons وداتاسيتس مفتوحة على GitHub/Zenodo
  وما شابه. ممنوع صور جوجل العشوائية أو أى صورة من غير رخصة واضحة (حقوق نشر).
- ممنوع أى صورة فيها **لوحة عربية مقروءة أو وش واضح** (قاعدة المالك: الصور اللى فيها بيانات شخصية ماتتحفظش).
- مفيش مفاتيح ولا حسابات: ممنوع لمس الأسرار (ومنها `KAGGLE_*`)، وأى موقع محتاج تسجيل دخول يتساب.
- كل صورة تتصغّر (أطول ضلع ١٢٨٠ بكسل، JPEG جودة ٨٠)، والمجموع ≤ ٨٠ ميجا.
- فرع لوحده **`bump-images-egypt`** من نسخة مؤقتة (مش من ~/workspace) — الفرع الرئيسى مايتقلش.
- ملف `SOURCES.csv`: لكل صورة اسم الملف · رابط المصدر · الرخصة · صاحبها/المؤلف · بلد التصوير لو معروف · فيها labels ولا لأ.

**بعد ما يرفع:** كلود يراجع الفرع (الرخص والصور) قبل ما يتضاف أى حاجة لتدريب Kaggle (`oscardrive-android/vision-test/train/kaggle_train_bumps.py`).
الصور اللى من غير صناديق (labels) محتاجة تتعلّم قبل التدريب — الأفضل داتاسيتس فيها labels جاهزة (YOLO/COCO/VOC).

## النص اللى اتبعت للـAgent

```
Research + download task (no app code changes). Goal: openly-licensed photos of road speed bumps (and potholes), preferably in Egypt, to train our bump-detection model.

Rules:
1) Only images with a clear open license: CC0, Public Domain, CC-BY, CC-BY-SA, or MIT/Apache datasets. Good sources: Wikimedia Commons (search speed bump / مطب / road hump Egypt), and public datasets on GitHub or Zenodo that state such a license (speed bump / road anomaly detection, ideally with YOLO/COCO/VOC labels). Do NOT use random Google Images or anything without a stated license. Skip anything that needs a login or an API key. Do NOT read or use any Replit Secrets (including KAGGLE_*).
2) Skip any image where a car license plate or a person's face is clearly readable.
3) Resize every image so the longest side is at most 1280 px, JPEG quality 80. Keep the total under 80 MB. Keep labels files as they are if a dataset has them.
4) Create SOURCES.csv with one row per image: file, source_url, license, author, country (if known), has_labels (yes/no).
5) Work in a temporary clone, NOT in ~/workspace: git clone the repo into /tmp/bumps, create a new branch named bump-images-egypt from claude/build-oscardevs-ads-mvp-8krfN, put everything under datasets/bumps-egypt/ (images/, labels/ if any, SOURCES.csv, README.md with a short summary of sources and licenses), commit and push that branch only (git push origin bump-images-egypt). Do not push to any other branch. Do not add dependencies to the project, do not touch the app, the database, Secrets or publishing.
6) Reply with: number of images, how many are from Egypt, how many have labels, total size, and the list of sources with their licenses.
```
