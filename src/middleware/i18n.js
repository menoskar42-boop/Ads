const { t, normalizeLang, pickContent, DEFAULT_LANG } = require('../i18n/strings');
const { safeUrl } = require('../lib/safeUrl');

// Decides which language to use for the current request based on:
//   1. URL ?lang=ar|en query param (one-time override; also writes cookie)
//   2. Logged-in admin's stored adminLang (session)  — for /admin and /company
//   3. Logged-in customer's stored customerLang (session) — for /customer
//   4. The `lang` cookie
//   5. DEFAULT_LANG ('ar')
//
// Exposes res.locals.lang, res.locals.dir, res.locals.t (string lookup helper)
// and res.locals.pickContent so every EJS template can use them.

module.exports = function i18nMiddleware(req, res, next) {
  let lang = null;

  // 1. ?lang=xx — explicit toggle, persists via cookie
  if (req.query && req.query.lang) {
    lang = normalizeLang(req.query.lang);
    res.cookie('lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false, sameSite: 'lax' });
  }

  // 2. Admin / company session lang (set when admin signs in or toggles).
  // The tenant back-offices (/clinic, /pharmacy, /food) are the same logged-in
  // owner as /company, so they follow the same stored preference — otherwise a
  // clinic that chose English would drop back to Arabic the moment it opened
  // its own admin.
  if (!lang && req.session) {
    const OWNER_AREAS = ['/admin', '/company', '/clinic', '/pharmacy', '/food'];
    if (req.session.adminLang && OWNER_AREAS.some((p) => req.path.startsWith(p))) {
      lang = normalizeLang(req.session.adminLang);
    } else if (req.session.customerLang && req.path.startsWith('/customer')) {
      lang = normalizeLang(req.session.customerLang);
    }
  }

  // 3. Cookie
  if (!lang && req.cookies && req.cookies.lang) {
    lang = normalizeLang(req.cookies.lang);
  }

  // 4. Default
  if (!lang) lang = DEFAULT_LANG;

  res.locals.lang = lang;
  res.locals.dir = lang === 'ar' ? 'rtl' : 'ltr';
  // Locale for toLocaleString/toLocaleDateString. Numbers and dates have to
  // follow the chosen language too — an English page showing ٥٠٠ ج and
  // «الاثنين ٣ أغسطس» is still an Arabic page. It lives here rather than in a
  // template because EJS compiles each include separately, so a `var` in the
  // header partial is not visible to the page that includes it.
  res.locals.LOC = lang === 'en' ? 'en-GB' : 'ar-EG';
  res.locals.t = (key) => t(key, lang);
  res.locals.pickContent = (row, field, companyContentI18n) =>
    pickContent(row, field, lang, companyContentI18n);
  // Defuse stored-XSS in merchant-controlled link fields (banner/ad target_url).
  res.locals.safeUrl = safeUrl;

  next();
};
