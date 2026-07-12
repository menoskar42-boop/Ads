'use strict';

// ── Public, indexable content pages for Sokro ────────────────────────────────
// Real, server-rendered Arabic guides that target genuine search intents and
// build topical authority (a single landing page can't). Each page ships proper
// SEO meta (title ≤60, description ~150, canonical, OG), a single H1, honest
// content matching real capabilities, internal links, and a CTA to /app.
const config = require('./core/config');

const O = config.origin;

// Each page: { slug, title(≤60), desc(~150), h1, lead, sections:[{h2, html}],
// faq:[{q,a}] }. Body kept honest — only capabilities Sokro actually has today.
const PAGES = [
  {
    slug: 'market-research',
    title: 'بحث سوق وتقارير Excel بالذكاء الاصطناعي | Sokro',
    desc: 'خلّي وكيل ذكاء اصطناعي عربي يعمل بحث سوق سريع: يجمع أسعار ومنتجات ومصادر من الويب، ويطلّعلك تقرير Excel/PDF منظّم وجاهز للتنزيل.',
    h1: 'بحث سوق وتقارير Excel بالذكاء الاصطناعي',
    lead: 'بدل ما تقعد ساعات تجمّع بيانات وتنسّقها يدوي، تقول لـ Sokro اللي محتاجه وهو يبحث، يلخّص المصادر، ويطلّعلك تقرير منظّم تقدر تنزّله Excel أو PDF أو Markdown.',
    sections: [
      { h2: 'المشكلة اللي بيحلّها', html: '<p>البحث السوقي اليدوي بطيء ومتفرّق: تفتح عشر تابات، تنسخ أسعار، تحطّها في شيت، وتنسّقها. Sokro بيختصر ده في أمر واحد — تكتب أو تقول طلبك، وهو ينفّذ الخطوات ويجمّع النتيجة في مكان واحد.</p>' },
      { h2: 'إزاي تستخدمه', html: '<ul><li>اكتب أو قُل: «ابحثلي عن أسعار [منتج] في مصر واعملّي تقرير».</li><li>Sokro يبحث في الويب، يجمع النتائج ذات الصلة، ويلخّصها.</li><li>يطلّعلك ملخّص + مصادر، وتقدر تنزّلها <strong>Excel</strong> أو <strong>PDF</strong> أو <strong>Markdown</strong> بضغطة.</li></ul>' },
      { h2: 'مناسب لمين', html: '<p>أصحاب المتاجر اللي بيسعّروا منتجات، فرق التسويق اللي بتعمل رصد منافسين، الفريلانسر اللي بيجهّز عروض للعملاء، وأي حد محتاج «خلاصة سوق» سريعة بدل بحث متعب.</p>' },
    ],
    faq: [
      { q: 'التقرير بيطلع بأي صيغة؟', a: 'Excel و PDF و Markdown — تختار الصيغة وتنزّلها على طول من المحادثة.' },
      { q: 'النتائج دقيقة؟', a: 'Sokro يجمع من مصادر الويب المتاحة، فالأفضل تراجع النتيجة قبل قرار مهم — هو أداة مساعدة تسرّعك، مش بديل عن مراجعتك.' },
    ],
  },
  {
    slug: 'voice-to-report',
    title: 'من أمر صوتي لتقرير أو صورة جاهزة | Sokro',
    desc: 'قول طلبك بصوتك، و Sokro يفهمه، يخطّط الخطوات، وينفّذ — يطلّعلك تقرير أو صورة أو ملخّص جاهز. إدخال صوتي عربي بمخرجات قابلة للاستخدام.',
    h1: 'من أمر صوتي لمخرجات جاهزة',
    lead: 'Sokro مش مجرد مساعد صوتي بيرد كلام. تقوله بصوتك اللي محتاجه، وهو يحوّله لخطة وينفّذها ويطلّعلك نتيجة تقدر تستخدمها — تقرير، صورة، أو ملخّص.',
    sections: [
      { h2: 'الفرق بين «يرد» و«ينفّذ»', html: '<p>أغلب المساعدات الصوتية بتجاوب بس. Sokro بياخد الأمر الصوتي، يفهم القصد، يرسم خطوات، وينفّذها بأدوات فعلية (بحث، توليد صور، تلخيص، تقارير) — والنتيجة مخرَج جاهز مش مجرد كلام.</p>' },
      { h2: 'أمثلة أوامر صوتية', html: '<ul><li>«ابحثلي عن [موضوع] واعملّي تقرير Excel».</li><li>«ارسملي صورة [وصف] وابعتهالي».</li><li>«لخّصلي الصفحة دي في نقاط».</li></ul>' },
      { h2: 'اللغة والصوت', html: '<p>تقدر تختار لغة الرد (مصري افتراضياً، فصحى، أو إنجليزي)، وصوت المساعد (أنثى/ذكر)، واسمه وشخصيته من الإعدادات. الإدخال الصوتي بيتحوّل لنص بدقة عالية.</p>' },
    ],
    faq: [
      { q: 'لازم أتكلم بالفصحى؟', a: 'لأ، Sokro يفهم العامية المصرية والفصحى. تكلّم عادي.' },
      { q: 'ينفّذ أي حاجة من غير إذن؟', a: 'المهام العادية (بحث/صورة/تلخيص) بتتنفّذ على طول؛ أي خطوة حسّاسة بتوقف وتطلب موافقتك الأول.' },
    ],
  },
  {
    slug: 'ai-agent-arabic-business',
    title: 'وكيل ذكاء اصطناعي للشركات العربية — دليل عملي | Sokro',
    desc: 'دليل عملي لاستخدام وكيل ذكاء اصطناعي (AI agent) في شغل الشركات الصغيرة العربية: بحث وتقارير، محتوى بصري، وتلخيص — بأمان وبموافقة على الخطوات الحسّاسة.',
    h1: 'دليل عملي: وكيل ذكاء اصطناعي للشركات العربية',
    lead: 'الـ AI agent بقى أداة شغل حقيقية، مش رفاهية. الدليل ده بيوضّح إزاي شركة صغيرة عربية تستفيد من وكيل زي Sokro في مهام يومية — من غير مبالغة في الوعود.',
    sections: [
      { h2: 'إيه هو الـ AI agent؟', html: '<p>وكيل ذكاء اصطناعي بياخد هدف، يخطّط خطوات، وينفّذها بأدوات — مش بس بيرد على سؤال. الفرق إنه بيوصّلك <em>مخرَج جاهز</em> (تقرير/صورة/خلاصة) بدل نص تقعد تعمله بنفسك.</p>' },
      { h2: 'مهام تبدأ بيها', html: '<ul><li><strong>بحث سوق وتقارير:</strong> رصد أسعار ومنافسين في تقرير Excel.</li><li><strong>محتوى بصري:</strong> توليد صور لمنشور أو فكرة منتج.</li><li><strong>تلخيص:</strong> تحويل صفحات طويلة لنقاط.</li></ul>' },
      { h2: 'الأمان قبل التوسّع', html: '<p>ابدأ بمهمة أو اتنين متقنين قبل ما توسّع. Sokro بيطلب موافقتك قبل أي خطوة حسّاسة (تشغيل متصفّح/تعبئة نموذج)، وبيشفّر أي بيانات اعتماد وماينقلهاش للموديل — ده أساس استخدام آمن في بيئة شغل.</p>' },
    ],
    faq: [
      { q: 'محتاج خبرة تقنية؟', a: 'لأ. بتكلّمه بلغتك الطبيعية (صوت أو كتابة) وهو يتصرّف. مفيش أكواد ولا إعدادات معقّدة.' },
      { q: 'بيشتغل على الموبايل؟', a: 'أيوه، من المتصفح على الموبايل والكمبيوتر بنفس الحساب، وتقدر تثبّته كتطبيق.' },
    ],
  },
];

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function otherLinks(current) {
  return PAGES.filter((p) => p.slug !== current)
    .map((p) => `<a href="${O}/guides/${p.slug}">${esc(p.h1)}</a>`).join(' · ');
}

function render(page) {
  const url = `${O}/guides/${page.slug}`;
  const sections = page.sections.map((s) => `<h2>${esc(s.h2)}</h2>${s.html}`).join('\n');
  const faqHtml = (page.faq || []).map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n');
  const faqLd = (page.faq || []).length
    ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: page.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) })}</script>` : '';
  return `<!doctype html>
<html lang="ar" dir="rtl"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.desc)}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${esc(page.title)}" />
<meta property="og:description" content="${esc(page.desc)}" />
<meta property="og:url" content="${url}" />
<meta property="og:locale" content="ar_EG" />
<meta property="og:image" content="https://oscardevs.com/og-default.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="theme-color" content="#0b1020" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet" />
<style>
  *{box-sizing:border-box;font-family:'Cairo',system-ui,sans-serif;margin:0}
  body{background:radial-gradient(1200px 600px at 50% -10%,#1b2550,#0b1020);color:#eef1ff;min-height:100vh;line-height:1.95}
  .wrap{max-width:760px;margin:0 auto;padding:48px 22px}
  .crumb{font-size:.85rem;color:#8ea2ff;margin-bottom:14px}
  h1{font-size:clamp(1.6rem,5vw,2.3rem);font-weight:900;margin-bottom:12px}
  h1 span,.brand span{background:linear-gradient(90deg,#7c8bff,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent}
  .lead{color:#c3c9ee;font-size:1.08rem;margin-bottom:8px}
  h2{font-size:1.35rem;margin:34px 0 10px;font-weight:900}
  p,li{color:#c3c9ee}ul{margin:8px 24px}li{margin-bottom:6px}
  .cta{display:inline-block;margin:26px 0;background:linear-gradient(90deg,#5b6cff,#22d3ee);color:#08122b;font-weight:800;text-decoration:none;border-radius:100px;padding:13px 30px}
  details{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px 18px;margin:10px 0}
  details summary{cursor:pointer;font-weight:700;color:#eef1ff}details p{margin-top:8px}
  .more{margin-top:30px;font-size:.92rem;color:#b9c0e6}
  footer{margin-top:40px;color:#8b93c0;font-size:.82rem;text-align:center;padding:22px;border-top:1px solid rgba(255,255,255,.06)}
  a{color:#8ea2ff}
</style></head><body>
<main class="wrap">
  <div class="crumb"><a href="${O}/">Sokro</a> ← ${esc(page.h1)}</div>
  <h1>${esc(page.h1)}</h1>
  <p class="lead">${esc(page.lead)}</p>
  <a class="cta" href="${O}/app">جرّب Sokro دلوقتي</a>
  ${sections}
  ${faqHtml ? '<h2>أسئلة شائعة</h2>' + faqHtml : ''}
  <div class="more">أدلة تانية: ${otherLinks(page.slug)}</div>
</main>
<footer>Sokro — أحد منتجات <a href="https://oscardevs.com/our-work">OscarDevs</a> · <a href="https://oscardevs.com/privacy">الخصوصية</a> · <a href="https://oscardevs.com/terms">الشروط</a></footer>
${faqLd}
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":${JSON.stringify(page.h1)},"description":${JSON.stringify(page.desc)},"inLanguage":"ar","mainEntityOfPage":"${url}","author":{"@type":"Organization","name":"OscarDevs"},"publisher":{"@type":"Organization","name":"OscarDevs","url":"https://oscardevs.com"}}</script>
</body></html>`;
}

function get(slug) { return PAGES.find((p) => p.slug === slug) || null; }

module.exports = { PAGES, render, get };
