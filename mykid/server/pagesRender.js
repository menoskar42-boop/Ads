// ===== الصفحات الثابتة: حول التطبيق + سياسة الخصوصية =====
// صفحات حقيقية قابلة للأرشفة تبني ثقة الآباء وتدعم متطلبات نشر تطبيقات الأطفال.
import { SITE } from "./seoContent.js";

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// قالب صفحة موحّد (يعيد استخدام أنماط seo.css)
function page({ slug, title, description, h1, emoji, bodyHtml, type = "website" }) {
  const url = `${SITE.url}/${slug}`;
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="${type}" />
<meta property="og:site_name" content="${esc(SITE.name)}" />
<meta property="og:locale" content="${SITE.locale}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${SITE.url}/og.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${SITE.url}/og.png" />
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${emoji}</text></svg>" />
<link rel="stylesheet" href="/css/seo.css" />
</head>
<body>
<header class="seo-header">
  <a class="seo-logo" href="/">🦁 عالم الاستكشاف السحري</a>
</header>
<main class="seo-main">
  <p class="seo-crumbs"><a href="/">الرئيسية</a> › ${esc(h1)}</p>
  <h1>${emoji} ${esc(h1)}</h1>
  <article class="seo-article">${bodyHtml}</article>
  <nav class="seo-related" aria-label="روابط">
    <ul>
      <li><a href="/about">ℹ️ حول التطبيق</a></li>
      <li><a href="/privacy">🔒 سياسة الخصوصية</a></li>
      <li><a href="/contact">✉️ تواصل معنا</a></li>
      <li><a href="/guides">📚 أدلة الآباء</a></li>
      <li><a href="/app">🦁 افتح التطبيق</a></li>
    </ul>
  </nav>
</main>
<footer class="seo-footer">
  <p>عالم الاستكشاف السحري — تطبيق تعليمي تفاعلي للأطفال من ٣ إلى ٦ سنوات.</p>
  <p><a href="/">العودة إلى صفحة الاستكشاف</a></p>
</footer>
</body>
</html>`;
}

export function renderAboutPage() {
  const body = `
<section>
  <p>«عالم الاستكشاف السحري» (Safari Kids Adventure) تطبيق ويب تعليمي تفاعلي للأطفال من عمر ٣ إلى ٦ سنوات. صُمّم على هيئة مغامرة ولعبة بمكافآت، ليتعلّم الطفل الحروف العربية والإنجليزية والأرقام والحيوانات والأسماك والطيور والفواكه والألوان والأشكال — بأسلوب اللعب لا التلقين.</p>
</section>
<section>
  <h2>ماذا يتعلّم طفلك؟</h2>
  <p>الحروف العربية من الألف إلى الياء مع الحركات، والحروف الإنجليزية من A إلى Z، والأرقام والعدّ من ١ إلى ٢٠ بالعربية والإنجليزية، إضافة إلى الحيوانات وأصواتها والأسماك والطيور والفواكه والألوان والأشكال الهندسية.</p>
</section>
<section>
  <h2>فلسفتنا في التعليم</h2>
  <p>نؤمن أن الطفل يتعلّم أسرع وأعمق حين يلعب. لذلك حوّلنا كل درس إلى مهمة ممتعة: اصطياد الحروف، رسمها بالإصبع، عدّ الكنوز، مطابقة الظل، أصوات الحيوانات. ويجمع الطفل النجوم والكنوز لتنمو «حديقة أحلامه» كلما تعلّم أكثر.</p>
</section>
<section>
  <h2>مصمّم للآباء أيضاً</h2>
  <p>يوفّر التطبيق لوحة متابعة لولي الأمر لمعرفة تقدّم الطفل في كل قسم، ومجموعة <a href="/guides">أدلة عملية</a> تساعدك على تعليم طفلك بطريقة صحيحة وممتعة. التطبيق يعمل على الهاتف والتابلت والكمبيوتر، ويمكن تثبيته كتطبيق ويعمل دون اتصال بالإنترنت.</p>
</section>
<a class="seo-play" href="/app">▶ افتح التطبيق الآن</a>`;
  return page({
    slug: "about",
    emoji: "ℹ️",
    h1: "حول عالم الاستكشاف السحري",
    title: "حول التطبيق — عالم الاستكشاف السحري | تطبيق تعليمي للأطفال",
    description:
      "تعرّف على عالم الاستكشاف السحري، تطبيق تعليمي تفاعلي للأطفال من ٣ إلى ٦ سنوات لتعليم الحروف والأرقام والحيوانات والألوان والأشكال بأسلوب اللعب والمكافآت.",
    bodyHtml: body,
  });
}

export function renderPrivacyPage() {
  const body = `
<section>
  <p>خصوصية طفلك أولويتنا. صُمّم «عالم الاستكشاف السحري» ليكون آمناً للأطفال، وهذه الصفحة توضّح ممارساتنا بشأن البيانات بلغة بسيطة وواضحة.</p>
  <p class="seo-meta">آخر تحديث: ٢٠٢٦</p>
</section>
<section>
  <h2>لا نجمع بيانات شخصية</h2>
  <p>لا يطلب التطبيق اسم الطفل أو بريداً إلكترونياً أو رقم هاتف أو أي معلومات تعريف شخصية. لا توجد حسابات ولا تسجيل دخول.</p>
</section>
<section>
  <h2>أين يُحفظ تقدّم الطفل؟</h2>
  <p>يُحفظ تقدّم الطفل (النجوم، الكنوز، المناطق المكتملة) محلياً على جهازك فقط عبر تخزين المتصفح (localStorage)، ولا يُرسل إلى أي خادم. يمكنك محوه في أي وقت من لوحة ولي الأمر داخل التطبيق.</p>
</section>
<section>
  <h2>الميكروفون والكاميرا</h2>
  <p>تُستخدم الكاميرا فقط عند فتح ميزة «الواقع المعزّز»، ويُستخدم الميكروفون فقط عند الضغط على زر «المساعد الصوتي». لا نسجّل ولا نخزّن أي صوت أو صورة؛ تُعالَج اللحظة الآنية فقط ثم تُهمَل، ولا يحدث شيء دون ضغط الطفل على الزر المخصّص.</p>
</section>
<section>
  <h2>خدمات الذكاء الاصطناعي</h2>
  <p>عند تفعيل ميزات الصوت والمساعد الذكي، يمرّر خادمنا الطلب إلى مزوّد الذكاء الاصطناعي (OpenAI) لتوليد النطق أو الإجابة، دون إرفاق أي بيانات تعريف عن الطفل. إن لم تُفعَّل هذه الميزات، يعمل التطبيق بنطق المتصفح المدمج بالكامل.</p>
</section>
<section>
  <h2>الإعلانات وملفات تعريف الارتباط (Cookies)</h2>
  <p><strong>لا يعرض هذا التطبيق أيّ إعلانات حاليّاً</strong>، ولا يستخدم ملفات تعريف ارتباط إعلانية، ولا يشارك أيّ بيانات مع شبكات أو شركاء إعلانيين. يُحفظ تقدّم الطفل على جهازه فقط (تخزين محلّي)، ويمكن لوليّ الأمر تعطيل ميزات الإنترنت والصوت بالكامل من «لوحة ولي الأمر» داخل التطبيق.</p>
</section>
<section>
  <h2>تواصل معنا</h2>
  <p>لأي استفسار حول الخصوصية، تواصل عبر البريد: <a href="mailto:privacy@oscardevs.com">privacy@oscardevs.com</a>.</p>
</section>`;
  return page({
    slug: "privacy",
    emoji: "🔒",
    h1: "سياسة الخصوصية",
    title: "سياسة الخصوصية — عالم الاستكشاف السحري | تطبيق آمن للأطفال",
    description:
      "سياسة خصوصية عالم الاستكشاف السحري: لا نجمع بيانات شخصية للأطفال، يُحفظ التقدّم محلياً على الجهاز، ولا يعرض التطبيق أيّ إعلانات. تطبيق آمن للأطفال.",
    bodyHtml: body,
  });
}

export function renderContactPage() {
  const body = `
<section>
  <p>يسعدنا تواصلك معنا! فريق «عالم الاستكشاف السحري» جاهز للإجابة عن أسئلتك واقتراحاتك بخصوص التطبيق أو الخصوصية أو الشراكات.</p>
</section>
<section>
  <h2>البريد الإلكتروني</h2>
  <p>للاستفسارات العامّة والدعم: <a href="mailto:hello@oscardevs.com">hello@oscardevs.com</a></p>
  <p>لاستفسارات الخصوصية وحماية الأطفال: <a href="mailto:privacy@oscardevs.com">privacy@oscardevs.com</a></p>
</section>
<section>
  <h2>الناشر</h2>
  <p>يُدار هذا الموقع بواسطة <strong>OscarDevs</strong>. نحرص على تقديم محتوى تعليمي آمن وأصلي للأطفال، ونلتزم بسياسات النشر وحماية خصوصية الأطفال.</p>
</section>
<section>
  <h2>ملاحظات أولياء الأمور</h2>
  <p>إن لاحظت أي محتوى غير مناسب، راسلنا فوراً وسنعالج الأمر بأسرع وقت. سلامة طفلك وتجربته أولويتنا.</p>
</section>`;
  return page({
    slug: "contact",
    emoji: "✉️",
    h1: "تواصل معنا",
    title: "تواصل معنا — عالم الاستكشاف السحري | الدعم والخصوصية",
    description:
      "تواصل مع فريق عالم الاستكشاف السحري للدعم والاستفسارات حول التطبيق التعليمي للأطفال والخصوصية والشراكات.",
    bodyHtml: body,
  });
}
