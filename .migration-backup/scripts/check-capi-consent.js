#!/usr/bin/env node
/**
 * الطلب اللي اتحسب مرتين، والبيكسل اللي اشتغل من غير ما حد يوافق.
 *
 * ── ١. رقم الحدث واحد ────────────────────────────────────────────────────
 *
 * البيكسل في المتصفح بيضيع كتير: مانع إعلانات، متصفح بيقفل الكوكيز التانية،
 * تبويب بيتقفل بدري. عشان كده الشراء بقى بيتبعت من السيرفر كمان (Conversion
 * API). بس ده بيفتح باب أسوأ من اللي بيقفله لو الرقم مش واحد: نفس الطلب
 * بيتسجّل مرتين، والتاجر يفتكر إن الإعلان بيجيب الضعف ويزوّد الميزانية على
 * رقم مش حقيقي.
 *
 * فالرقم مشتق من رقم الطلب (`order-<id>`) — نفس الرقم في المتصفح وفي السيرفر،
 * وثابت مع إعادة التحميل وإعادة الإرسال.
 *
 * ── ٢. البيانات الشخصية مهشّرة ───────────────────────────────────────────
 *
 * الإيميل والموبايل بيتبعتوا SHA-256 بعد تنضيف — مفيش إرسال خام. والتوكن
 * مشفّر في الخزنة زي مفاتيح بوابات الدفع، ومابيرجعش للفورم ولا بيتكتب في لوج.
 *
 * ── ٣. الموافقة بتمنع التحميل، مش بتخفي الشريط ──────────────────────────
 *
 * «اسأل الأول» معناها إن السكربت **مايتحمّلش** لحد ما الزائر يوافق. بانر
 * بيتعرض والبيكسل شغّال ورا مالوش أي معنى.
 *
 *   node scripts/check-capi-consent.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const capi = require('../src/lib/capi');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));
const raw = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ── ١. رقم الحدث ──────────────────────────────────────────────────────── */
{
  check('الرقم مشتق من رقم الطلب', capi.eventIdFor(41) === 'order-41');
  check('وثابت مع كل استدعاء (مش عشوائي)',
    capi.eventIdFor(41) === capi.eventIdFor('41'));
  const p1 = capi.purchasePayload({ id: 41, total_amount: 250 });
  check('والجسم بيحمله', p1.event_id === 'order-41');

  const success = raw('src/views/shop/success.ejs');
  check('والمتصفح بيبعت نفس الرقم',
    /eventId: <%- jsonLd\('order-' \+ String\(order\.id\)\)/.test(success));
  const px = raw('src/views/partials/merchant_pixels.ejs');
  check('وميتا بتستلمه في مكانه الصح (eventID)', /\{ eventID: evId \}/.test(px));
  check('وتيك توك في مكانها هي (event_id)', /\{ event_id: evId \}/.test(px));
  check('واللي مابعتش رقم مابيتبعتش undefined غلط',
    /evId \? \{ eventID: evId \} : undefined/.test(px));
}

/* ── ٢. الجسم اللي بيتبعت ──────────────────────────────────────────────── */
{
  const p = capi.purchasePayload(
    { id: 7, total_amount: '199.5', customer_email: '  Ali@Example.COM ', customer_phone: '+20 100 123 4567' },
    { currency: 'egp', items: 3, ip: '1.2.3.4', userAgent: 'UA', at: '2026-08-19T10:00:00Z' });

  check('الاسم Purchase', p.event_name === 'Purchase');
  check('والوقت بالثواني مش بالملي ثانية', String(p.event_time).length === 10, String(p.event_time));
  check('والقيمة رقم متقرّب لقرشين', p.custom_data.value === 199.5);
  check('والعملة بحروف كبيرة', p.custom_data.currency === 'EGP');
  check('ورقم الطلب جوّه البيانات', p.custom_data.order_id === '7');

  // التهشير: نفس اللي ميتا بتعمله — trim + lowercase للإيميل، أرقام بس للموبايل.
  const em = crypto.createHash('sha256').update('ali@example.com').digest('hex');
  const ph = crypto.createHash('sha256').update('201001234567').digest('hex');
  check('الإيميل مهشّر بعد تنضيف', p.user_data.em[0] === em);
  check('والموبايل بأرقامه بس', p.user_data.ph[0] === ph);
  check('ومفيش أي بيان خام في الجسم',
    !JSON.stringify(p).includes('example.com') && !JSON.stringify(p).includes('4567'));
  check('واللي مش موجود مابيتخترعش',
    capi.purchasePayload({ id: 1 }).user_data.em === undefined);
  check('والـIP وuser agent بيعدّوا زي ما هما',
    p.user_data.client_ip_address === '1.2.3.4' && p.user_data.client_user_agent === 'UA');
}

/* ── ٣. الإرسال مابيوقعش الصفحة ───────────────────────────────────────── */
{
  const mod = code('src/lib/capi.js');
  check('مفيش توكن = مفيش إرسال، وبسبب واسمه',
    /if \(!pixel \|\| !token\) return \{ ok: false, why: 'not_configured' \}/.test(mod));
  check('والفشل بيرجع سبب مابيرميش',
    /catch \(e\) \{[\s\S]{0,200}?return \{ ok: false, why: 'network' \}/.test(mod));
  check('والتوكن في جسم الطلب مش في الرابط',
    /access_token: token/.test(mod) && !/access_token=\$\{|access_token=' \+/.test(mod));
  check('واللوج مابيكتبش التوكن',
    /access_token=•••/.test(mod));

  const shop = code('src/routes/shop.js');
  check('صفحة النجاح بتبعت من غير ما تستنى',
    /capi\.sendPurchase\(company, order,[\s\S]{0,600}?\)\.catch\(/.test(shop));
  check('ومابتبعتش من غير بيكسل وتوكن',
    /if \(company\.fb_pixel_id && company\.fb_capi_token_enc\)/.test(shop));
  check('والتوكن بيتفك من الخزنة مش من عمود نص',
    /pay_vault'\)\.read\(company\.fb_capi_token_enc/.test(shop));
}

/* ── ٤. التوكن سرّ ─────────────────────────────────────────────────────── */
{
  const route = code('src/routes/company.js');
  const post = (route.match(/router\.post\('\/marketing'[\s\S]*?\n\}\);/) || [''])[0];
  check('التخزين مشفّر', /vault\.encrypt\(rawToken\)/.test(post));
  check('والخزنة المش متظبّطة = رفض مش نص صريح',
    /if \(!vault\.configured\(\)\) return res\.redirect\('\/company\/marketing\?capi=vault'\)/.test(post));
  check('والخانة الفاضية مابتمسحش التوكن',
    /tokenEnc !== undefined/.test(post));
  check('وفيه طريقة صريحة للمسح', /__clear__/.test(post));

  const view = raw('src/views/company/marketing.ejs');
  check('والتوكن مابيرجعش للفورم أبداً',
    !/value="<%= *company\.fb_capi_token/.test(view) && /name="fb_capi_token" type="password"/.test(view));
  check('والصفحة بتقول إن فيه واحد متخزّن من غير ما تعرضه', /capiStored/.test(view));
}

/* ── ٥. الموافقة بتمنع التحميل ────────────────────────────────────────── */
{
  const px = raw('src/views/partials/merchant_pixels.ejs');
  check('اللودرات بقت دوال بتتنده', /function loadAll\(\)/.test(px));
  check('و«اسأل الأول» مابتحمّلش من غير رد',
    /if \(CONSENT !== 'ask'\) loadAll\(\);/.test(px)
    && /else if \(stored\(\) === 'yes'\) loadAll\(\);/.test(px));
  check('والرفض متخزّن زي الموافقة', /stored\(\) !== 'no'/.test(px));
  check('والشريط تحت مش طبقة فوق المحتوى',
    /position:fixed;inset-inline:0;bottom:0/.test(px));
  check('والتحميل مابيتكررش لو اتنده مرتين', /__odvPixelsLoaded/.test(px));
  // خط أحمر: الشريط ده عن بيكسلات التاجر — أدسنس ليها آلية جوجل، وماينفعش
  // نلعب فيها من هنا.
  check('ومابيلمسش لودر إعلاناتنا', !/ads_loader|adsbygoogle/.test(px));

  const server = code('server.js');
  check('والافتراضي في القاعدة off',
    /consent_mode TEXT NOT NULL DEFAULT 'off'/.test(server));
  const route = code('src/routes/company.js');
  check('والقيمة من قايمة السيرفر مش من الفورم',
    /b\.consent_mode === 'ask' \? 'ask' : 'off'/.test(route));
}

console.log(fail === 0
  ? '\n✅ الشراء بيتبعت مرتين وبيتحسب مرة، والبيكسل مابيشتغلش قبل ما الزائر يوافق.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
