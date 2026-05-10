const { t, normalizeLang, pickContent, DEFAULT_LANG } = require('../i18n/strings');

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

  // 2. Admin / company session lang (set when admin signs in or toggles)
  if (!lang && req.session) {
    if (req.session.adminLang && (req.path.startsWith('/admin') || req.path.startsWith('/company'))) {
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
  res.locals.t = (key) => t(key, lang);
  res.locals.pickContent = (row, field, companyContentI18n) =>
    pickContent(row, field, lang, companyContentI18n);

  next();
};
