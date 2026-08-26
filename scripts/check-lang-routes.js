#!/usr/bin/env node
/**
 * تقسيم اللغة في الرابط: التحويلات صح، والإنجليزي مايتفتحش فاضي.
 *
 * ── الخطر اللي الفحص ده بيقف قدّامه ────────────────────────────────────
 *
 * نقل الصفحات العامة على `/ar/…` بيلمس كل صفحة مفهرسة عندنا مرة واحدة.
 * فيه تلات طرق يبوظ بيها، وكل واحدة بتبان بعد أسابيع في نتايج البحث مش
 * دلوقتي:
 *
 * ١. **صفحة تاجر تتحوّل بالغلط.** الراوترات العامة بتشتغل قبل
 *    `tenantMiddleware`، فلو التحويل ماسألش عن الهوست، أول طلب لأي
 *    `<slug>.oscardevs.com/` كان هيتحوّل على `/ar/` — الصفحة الرئيسية
 *    لكل تاجر عندنا بتقع مرة واحدة.
 *
 * ٢. **رابط توكن يتلمس.** `/apply/track/:token` و`/qastly/s/:token`
 *    مبعوتين لعملاء على واتساب. لينك اتبعت مايتسحبش.
 *
 * ٣. **`/en/` يفتح على محتوى عربي.** الصفحات العامة عربي ثابت في
 *    القالب (صفر `t()`)، فنسخة إنجليزية دلوقتي = نفس المحتوى على رابطين
 *    + `hreflang` بيعلن نسخة مش موجودة. مانوس وكلود الاتنين منعوا
 *    «الصفحات شبه الفارغة» بالحرف.
 *
 * Usage: node scripts/check-lang-routes.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let failed = 0;
const check = (label, ok, why) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok ? '' : '\n   ' + why));
  if (!ok) failed += 1;
};

const langRoutes = require('../src/lib/lang_routes');
const PUBLIC_SET = langRoutes.publicPaths();
const makeMw = require('../src/middleware/lang_prefix');
const mw = makeMw();

/** يشغّل الميدل‌وير على طلب وهمي ويرجّع اللي حصل. */
function run(host, method, url) {
  return new Promise((resolve) => {
    const req = { headers: { host }, hostname: host, method, url, path: url.split('?')[0] };
    const res = {
      locals: {},
      redirect: (code, to) => resolve({ kind: 'redirect', code, to }),
    };
    mw(req, res, () => resolve({ kind: 'next', url: req.url, lang: res.locals.lang || null }));
  });
}

(async () => {
  // ── ١) الصفحة العامة بتتحوّل ٣٠١ (مش ٣٠٢) ────────────────────────────
  //
  // ٣٠٢ بتقول لجوجل «القديم هو الأصل» فبتفضل مفهرساه — ونضيّع النقل كله.

  for (const [from, to] of [['/about', '/ar/about'], ['/', '/ar'],
    ['/blog/local-seo-egypt', '/ar/blog/local-seo-egypt'],
    ['/pharmacy-management-egypt', '/ar/pharmacy-management-egypt'],
    ['/crm-development-egypt', '/ar/crm-development-egypt']]) {
    const r = await run('oscardevs.com', 'GET', from);
    check(`${from} → ${to} بـ٣٠١`,
      r.kind === 'redirect' && r.code === 301 && r.to === to,
      `اللي حصل: ${JSON.stringify(r)}`);
  }

  // والـquery بتتحفظ — `?type=workshop` بيحدّد نوع النشاط في نموذج التقديم.
  const q = await run('oscardevs.com', 'GET', '/apply?type=workshop');
  check('الـquery بتعدّي مع التحويل', q.kind === 'redirect' && q.to === '/ar/apply?type=workshop',
    `اللي حصل: ${JSON.stringify(q)} — ضياعها معناه إن الزائر بيوصل لنموذج فاضي.`);

  /* ── ١ب) مفيش سلسلة تحويلات، ومفيش نسختين للجذر ─────────────────────
   *
   * تقرير السيو الخارجي بعد النشر مسك التلاتة دول كـP0:
   *   · `/` كان بيتحوّل على `/ar/` واللي بيتحوّل على `/ar` — تحويلتين.
   *   · السايت‌ماب كان بيدرج `/ar/` (اللي بيتحوّل) مش `/ar` (النهائي).
   *   · `hreflang` و`x-default` على `/ar/` بينما `canonical` على `/ar`.
   * كلهم من سبب واحد: `withLang('/')` كانت بتحط سلاش. */

  check('`withLang` بترجّع الجذر من غير سلاش',
    langRoutes.withLang('/', 'ar') === '/ar',
    `بترجّع «${langRoutes.withLang('/', 'ar')}». السلاش بيخلق نسخة تانية `
    + 'من الصفحة الرئيسية، والسايت‌ماب و`hreflang` بيدرجوها بدل النهائية.');

  const root = await run('oscardevs.com', 'GET', '/');
  check('`/` بتتحوّل على `/ar` **مرة واحدة**',
    root.kind === 'redirect' && root.to === '/ar',
    `بتوَدّي على «${root.to}» — لو فيها سلاش يبقى فيه تحويلة تانية بعدها.`);

  const slash = await run('oscardevs.com', 'GET', '/ar/');
  check('`/ar/` بتتحوّل ٣٠١ على `/ar`',
    slash.kind === 'redirect' && slash.code === 301 && slash.to === '/ar',
    `اللي حصل: ${JSON.stringify(slash)} — من غير كده الاتنين بيردّوا ٢٠٠ `
    + 'وجوجل بتشوف صفحتين بنفس المحتوى.');

  /* ── ١ج) الصفحات اللي كانت متسجّلة قبل الميدل‌وير ────────────────────
   *
   * `/radiology` و`/research` كانوا مسجّلين **قبل** `lang_prefix` في
   * `server.js`. النتيجة: `/ar/radiology` بيرجع ٤٠٤ (الراوتر عدّى قبل ما
   * العنوان يتعاد كتابته) و`/radiology` بيرد ٢٠٠ فمابيتحوّلش — نسختين،
   * والسايت‌ماب بيدرج اللي بيرجع ٤٠٤. مسكها تقرير السيو وتقرير الجيو
   * والـQA التلاتة.
   *
   * الفحص بيقرا `server.js` نفسه: كل راوت لصفحة عامة لازم يكون **بعد**
   * تسجيل الميدل‌وير. */

  /* ── ١د) مفيش رابط داخلي على `/ar/` (اللي بيتحوّل) ────────────────────
   *
   * بعد ما `/ar/` بقى تحويلة، كل رابط «الرئيسية» في الموقع كان لسه بيشاور
   * عليها — تسعتاشر ملف. الزائر مش هيلاحظ، بس كل نقرة بتعدّي على تحويلة،
   * وجوجل بتحسبها رابط داخلي لعنوان مش نهائي. */
  const viewsDir = path.join(ROOT, 'src/views');
  const stale = [];
  (function walk(dir) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, f.name);
      if (f.isDirectory()) walk(full);
      else if (f.name.endsWith('.ejs') && /href="\/ar\/"/.test(fs.readFileSync(full, 'utf8'))) {
        stale.push(path.relative(ROOT, full));
      }
    }
  }(viewsDir));
  check('مفيش رابط داخلي على `/ar/`', stale.length === 0,
    `${stale.length} ملف: ${stale.slice(0, 5).join('، ')}${stale.length > 5 ? ' …' : ''}. `
    + 'الشكل النهائي `/ar` من غير سلاش.');

  const server = read('server.js');
  const mwAt = server.indexOf("require('./src/middleware/lang_prefix')");
  check('`lang_prefix` متسجّل في `server.js`', mwAt > 0, 'مش لاقيه.');
  const late = [];
  for (const m of server.matchAll(/app\.use\('(\/[a-z-]+)',\s*require\(/g)) {
    if (!PUBLIC_SET.has(m[1])) continue;
    if (m.index < mwAt) late.push(m[1]);
  }
  check('كل راوت صفحة عامة متسجّل **بعد** الميدل‌وير', late.length === 0,
    `«${late.join('، ')}» متسجّلين قبله — يعني نسخة تحت \`/ar/\` بترجع ٤٠٤ `
    + 'ونسخة بلا prefix بترد ٢٠٠. دي بالظبط اللي حصلت مع radiology و research.');

  // ── ٢) صفحات المستأجرين مالهاش دعوة بالتحويل ─────────────────────────

  for (const host of ['hand.oscardevs.com', 'petra.oscardevs.com', 'adhd.oscardevs.com']) {
    for (const p of ['/', '/about']) {
      const r = await run(host, 'GET', p);
      check(`${host}${p} ماتحوّلش`, r.kind === 'next' && r.url === p,
        `اتحوّل: ${JSON.stringify(r)} — ده بيوقّع صفحة التاجر.`);
    }
  }

  // ── ٣) روابط التوكنات والإدارة ماتتلمسش ──────────────────────────────

  for (const p of ['/apply/track/abc', '/qastly/s/tok', '/track/tok',
    '/company/login', '/admin', '/shop/x/product/1']) {
    const r = await run('oscardevs.com', 'GET', p);
    check(`${p} ماتلمسش`, r.kind === 'next' && r.url === p,
      `اتغيّر: ${JSON.stringify(r)}`);
  }

  // ── ٤) POST مايتحوّلش ────────────────────────────────────────────────
  //
  // التحويل بيضيّع الـbody. `POST /apply` هو نموذج طلب العميل — تحويله
  // معناه إن بيانات عميل حقيقي بتتبخّر من غير رسالة خطأ.

  const post = await run('oscardevs.com', 'POST', '/apply');
  check('POST /apply مايتحوّلش', post.kind === 'next' && post.url === '/apply',
    `اتحوّل: ${JSON.stringify(post)} — ودي بيانات عميل بتضيع بلا أثر.`);

  // ── ٥) `/ar/` بيرندر، و`/ar/company/login` لأ ────────────────────────

  const ar = await run('oscardevs.com', 'GET', '/ar/about');
  check('/ar/about بيوصل للراوتر بالعنوان الأصلي',
    ar.kind === 'next' && ar.url === '/about' && ar.lang === 'ar',
    JSON.stringify(ar));

  const arAdmin = await run('oscardevs.com', 'GET', '/ar/company/login');
  check('/ar/company/login مالوش وجود (٤٠٤)',
    arAdmin.kind === 'next' && arAdmin.url === '/ar/company/login',
    'لوحات التحكم مش بتتقسّم بلغة في الرابط — ' + JSON.stringify(arAdmin));

  // ── ٦) الإنجليزي مقفول لحد ما يبقى فيه محتوى إنجليزي ─────────────────

  const en = await run('oscardevs.com', 'GET', '/en/about');
  check('/en/about بيرجع ٤٠٤ مش صفحة عربية',
    en.kind === 'next' && en.url === '/en/about',
    'لو ده رندر، يبقى فيه محتوى عربي تحت رابط إنجليزي.');

  /* والقفل ده مربوط بمحتوى حقيقي مش بمزاج: لو حد فتح `live: true`
   * للإنجليزي، لازم يكون القالب بيستخدم `t()` فعلاً. `home.ejs` هي
   * العيّنة — لو لسه صفر استدعاءات، يبقى الفتح سابق لأوانه. */
  const enLive = langRoutes.LANGS.en.live;
  const homeUsesT = (read('src/views/home.ejs').match(/\bt\(/g) || []).length;
  check('فتح الإنجليزي مربوط بوجود ترجمة فعلية',
    !enLive || homeUsesT > 0,
    `الإنجليزي مفتوح (\`live: true\`) لكن \`home.ejs\` فيها ${homeUsesT} استدعاء لـ\`t()\`. `
    + 'يعني الصفحة عربي ثابت وهتترندر عربي تحت `/en/` — محتوى مكرّر و`hreflang` بيكدب.');

  // ── ٧) قايمة الصفحات العامة محسوبة مش مكتوبة ─────────────────────────

  const src = read('src/lib/lang_routes.js');
  check('قايمة الصفحات مشتقّة من SECTORS و SERVICES و ARTICLES',
    /Object\.keys\(SECTORS\)/.test(src) && /Object\.keys\(SERVICES\)/.test(src)
    && /ARTICLES/.test(src),
    'لو القايمة اتكتبت بالإيد، أول نظام أو مقال جديد هيفضل شغّال على '
    + 'الرابط القديم من غير تحويل — يعني نسختين مفهرسين من نفس الصفحة.');

  const paths = langRoutes.publicPaths();
  const { ARTICLES } = require('../src/routes/blog_articles');
  const { SECTORS } = require('../src/lib/sector_landings');
  const { SERVICES } = require('../src/lib/services');
  const expect = ARTICLES.length + Object.keys(SECTORS).length + Object.keys(SERVICES).length;
  check(`القايمة فيها كل مقال وكل نظام وكل خدمة (${expect} + الصفحات الثابتة)`,
    paths.size >= expect,
    `القايمة ${paths.size} والمتوقّع على الأقل ${expect}.`);

  // ── ٨) السايت‌ماب و`llms.txt` بيدرجوا العنوان النهائي ────────────────

  const legal = read('src/routes/legal.js');
  check('السايت‌ماب بيدرج العنوان بعد التحويل', /const absLoc = \(loc\)/.test(legal)
    && /langRoutes\.withLang\(loc/.test(legal),
    'سايت‌ماب بيدرج عنوان بيتحوّل ٣٠١ بيوَدّي كل زاحف على تحويلة — '
    + 'وجوجل بتطلب العنوان النهائي.');
  check('`llms.txt` بياخد نفس المعاملة', /ORIGIN_RE/.test(legal),
    'الملف ده هو اللي محرّكات الإجابة بتقرا منه العناوين.');

  // ── ٩) و`hreflang` بيتكتب للصفحات العامة بس ──────────────────────────

  const meta = read('src/views/partials/seo_meta.ejs');
  check('`hreflang` مشروط بوجوده', /typeof hreflang !== 'undefined'/.test(meta),
    'من غير الشرط، صفحات المستأجرين ولوحات التحكم هتعلن نسخ لغوية مش موجودة.');
  check('و`x-default` موجود', /hreflang="x-default"/.test(meta),
    'جوجل بتستخدمه لما مافيش لغة مطابقة للزائر.');

  /* ── ٩-ب) مجموعة hreflang لازم تكون متبادلة وبلا وسم مكرّر ───────────
   *
   * قراءة مانوس للـHTML المنشور لقت الأربع صفحات خليج كلها بتقول
   * `hreflang="en"` على نفسها و`x-default` على نفسها. يعني صفحة السعودية
   * وصفحة الإمارات كل واحدة بتعلن إنها النسخة الإنجليزية الوحيدة وإنها
   * الافتراضي — مش مجموعة، دول مرشّحين لنفس المكان.
   *
   * السبب في الكود كان سطر واحد: `x-default` كان مكتوب من `hreflang[0]`
   * بالإيد، فأي صفحة بتوصل هنا بتعلن نفسها افتراضي. */
  check('`x-default` مش مكتوب من `hreflang[0]` بالإيد',
    !/hreflang="x-default"[^>]*hreflang\[0\]/.test(meta),
    'كل صفحة في المجموعة هتعلن نفسها الافتراضي — والافتراضي بيبقى اتنين.');
  check('و`x-default` بيتكتب بشرط', /typeof hreflangDefault !== 'undefined'/.test(meta),
    'مجموعة الخليج مافيهاش صفحة بلا استهداف إقليمي، فماينفعش نخترع واحدة.');

  const gulfPages = require('../src/lib/gulf_pages');
  const gp = gulfPages.pages();
  let bad = [];
  for (const p of gp) {
    const alts = gulfPages.alternatesFor(p.path);
    if (!alts) { bad.push(p.path + ': مالهاش بدائل'); continue; }
    // متبادلة: الصفحة نفسها لازم تكون عضو في مجموعتها.
    if (!alts.some((a) => a.path === p.path)) bad.push(p.path + ': مش عضو في مجموعتها');
    // وسم مكرّر = صفحتين على نفس المكان.
    const tags = alts.map((a) => a.lang);
    if (new Set(tags).size !== tags.length) bad.push(p.path + ': وسم مكرّر ' + tags.join('،'));
    // ووسم بلا إقليم (`en` مجرّد) بيرجّعنا للغلطة الأصلية.
    const plain = tags.filter((t) => !/^[a-z]{2}-[A-Z]{2}$/.test(t));
    if (plain.length) bad.push(p.path + ': وسم بلا إقليم ' + plain.join('،'));
  }
  check('مجموعة الخليج متبادلة وكل عضو بوسم إقليمي فريد', bad.length === 0,
    bad.join(' | ') || gp.length + ' صفحة');

  // ولازم كمان الصفحة تسرد **كل** أسواق موضوعها، مش نفسها بس.
  const markets = new Set(gp.map((p) => p.market));
  const short = gp.filter((p) => (gulfPages.alternatesFor(p.path) || []).length !== markets.size);
  check('وبتسرد كل أسواق موضوعها', short.length === 0,
    short.map((p) => p.path).join('، ') || markets.size + ' سوق');

  /* ── ١٠) `/workshop` المجرّد مايوَدّيش على بوابة دخول ──────────────────
   *
   * مراجعة الجيو سجّلته P0: عنوان شكله تسويقي بيحوّل على `/company/login`
   * — وده مسار محجوب في `robots.txt`، فالزاحف بيوصل لحيطة.
   *
   * ⚠️ والتحويل لازم يبقى **٣٠٢ مش ٣٠١**: الوجهة بتعتمد على حالة الجلسة،
   * و٣٠١ بيتخزّن في المتصفح للأبد — يعني صاحب الورشة اللي دخل وهو خارج
   * هيتحوّل على صفحة البيع حتى بعد ما يسجّل دخوله. */
  const srv = read('server.js').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const wsGet = srv.indexOf("app.get('/workshop'");
  const wsUse = srv.indexOf("app.use('/workshop'");
  check('`/workshop` المجرّد ليه راوت قبل ماونت اللوحة',
    wsGet > 0 && wsGet < wsUse,
    'من غيره الزائر غير المسجّل بيتحوّل على بوابة دخول داخلية.');
  check('وبيوَدّي على صفحة البيع مش على الدخول',
    /redirect\(302, langRoutes\.withLang\('\/car-workshop-management-egypt'/.test(srv),
    'الوجهة لازم تكون الصفحة العامة.');
  check('وبـ٣٠٢ + `no-store` مش ٣٠١',
    /Cache-Control', 'no-store'/.test(srv) && !/redirect\(301, langRoutes\.withLang\('\/car-workshop/.test(srv),
    '٣٠١ هيتخزّن في متصفح صاحب الورشة ويحوّله على صفحة البيع بعد ما يدخل.');
  check('واللي داخل بيكمّل عادي', /if \(req\.session && req\.session\.companyId\) return next\(\);/.test(srv.slice(wsGet, wsGet + 400)),
    'من غير الشرط ده، صاحب الورشة مش هيقدر يفتح لوحته خالص.');

  process.exit(failed ? 1 : 0);
})();
