# Sokro — AI Action Assistant (sokro.oscardevs.com)

نظام مساعد ذكي **بينفّذ مهام حقيقية** بأمر صوتي أو كتابي، مش مجرد شات. أحد منتجات
OscarDevs، مبني كـ sub-app موجَّه بالـ host (زي kakeibo/mykid) على نفس السيرفر.

> الفلسفة (قرار المالك): **text-first MVP** — النتيجة نص/ملفات/صور، الصوت اختياري
> (قراءة بصوت عند الطلب)، والمكالمة الحية ميزة Premium مؤجَّلة.

---

## المعمار (Modular Monolith)

```
sokro/
  router.js            راوتر الـ host (auth, actions, run, voice, report, settings, realtime, PWA, landing)
  core/config.js       الإعدادات + مفاتيح الموديلات (كلها env-overridable)
  llm/                 طبقة تجريد المزوّد (openai) — chat/json/embed
  ai/planner.js        plan(goal)→خطوات (LLM + heuristic fallback) + summarize(+achieved)
  actions/             الأدوات: search_web, generate_image, browse, extract_table, fill_submit
  registry.js          حلّال موحّد Actions + Skills
  skills/              مهارات مركّبة (ResearchReport)
  workflows/executor.js تنفيذ بإعادة محاولة self-healing + validator
  validation/          فحص نتيجة كل خطوة
  permissions/         SENSITIVE scopes + بوابة الموافقة
  memory/              محادثات/رسائل/سياق/مهام/سجل (Postgres: sokro_*)
  secrets/vault.js     AES-256-GCM (لا تُرجَع للموديل أبداً)
  auth/                JWT (HMAC) + bcrypt
  voice/               STT (gpt-4o-transcribe) + TTS (اختياري)
  realtime/            توكن مؤقّت للمكالمة الحية (GA client_secrets)
  reports/             md / csv / json / xlsx / pdf
  browser/             Playmright (container-safe) — لأكشنز التصفح على السيرفر
  extension/           إضافة كروم MV3 (تنفيذ في متصفح المستخدم الحي بموافقة بالدومين)
  extension-bridge/    طابور أوامر الإضافة (sokro_ext_commands)
  ui/app.html          الشاشة الواحدة (auth + شات + صوت + إعدادات + PWA)
```

المسار: **طلب → تخطيط → (موافقة لو حسّاس) → تنفيذ → تحقّق دلالي → تلخيص**.

---

## الموديلات (كلها OpenAI، وكلها env-overridable)

| الوظيفة | الافتراضي | المتغيّر |
|--------|-----------|----------|
| تخطيط/تفكير/تلخيص | `gpt-5` | `SOKRO_PLAN_MODEL` / `SOKRO_SMART_MODEL` |
| توليد صور | `gpt-image-1` | `SOKRO_IMAGE_MODEL` / `SOKRO_IMAGE_QUALITY` |
| تحويل كلام لنص | `gpt-4o-transcribe` | `SOKRO_STT_MODEL` |
| قراءة بصوت (TTS) | `gpt-4o-mini-tts` | `SOKRO_TTS_MODEL` |
| المكالمة الحية | `gpt-realtime` | `SOKRO_REALTIME_MODEL` (رقِّ لـ `gpt-realtime-2` وقت اللزوم) |
| Embeddings | `text-embedding-3-small` | — |

---

## الأمان (خلاصة)

- **بوابة موافقة موحّدة:** الأكشنز الحسّاسة (browser/login/social/payment…) ما تتنفّذش
  مباشرة — لا من `/api/actions/:name/run` ولا من الـ realtime — إلا عبر `/api/run`
  اللي بيوقف ويطلب موافقة.
- **SSRF guard** (`lib/urlGuard.js`): أكشنز التصفح بترفض localhost/الشبكات الخاصة/الـ
  metadata + DNS resolve.
- **الإضافة:** نافذة موافقة بالدومين قبل أي تنفيذ في المتصفح الحي.
- **JWT:** مفيش secret افتراضي معروف في الإنتاج (مفتاح عشوائي per-boot لو مفيش
  `SOKRO_JWT_SECRET`/`SESSION_SECRET`)، والكوكي `secure` في الإنتاج.
- **الأسرار:** AES-256-GCM، تُفكّ وقت التنفيذ فقط، وماتوصلش للموديل. القيم في النماذج
  ممكن تكون `{{secret:NAME}}` وتتحلّ في السيرفر.

## SEO / AdSense

- `/` صفحة عامة قابلة للفهرسة (محتوى + FAQ + JSON-LD + robots/sitemap للساب-دومين).
- `/app` عليها `noindex` — **ممنوع** أي AdSense داخل شاشة التطبيق (سياسة Google).
- لو هيبقى فيه إعلانات مستقبلاً → على صفحات المحتوى العام فقط؛ التطبيق اشتراك/رصيد.

## متغيّرات البيئة المهمة

`OPENAI_API_KEY` · `DATABASE_URL` · `SOKRO_JWT_SECRET` · `SOKRO_SECRET_KEY` (vault) ·
`SOKRO_CRON_KEY` · `SOKRO_CHROMIUM_PATH` (Playwright) · `OBJECT_STORAGE_BUCKET_ID`
(اختياري لتخزين الصور الدائم) · موديلات الجدول أعلاه.
