// Returns a URL that is safe to place in an href/src attribute, or '#' for
// anything using a dangerous scheme (javascript:, data:, vbscript:, …) or a
// protocol-relative //host bypass. Allows absolute http(s) URLs and same-site
// relative paths. Used to defuse stored-XSS via merchant-controlled link fields
// (banner target_url, ad links, etc.).
function safeUrl(url) {
  if (!url) return '#';
  const s = String(url).trim();
  if (!s) return '#';
  if (s.startsWith('/') && !s.startsWith('//')) return s; // same-site relative
  if (/^https?:\/\//i.test(s)) return s;                  // absolute http(s)
  return '#';                                             // block everything else
}

// Save-time variant: returns a cleaned URL to store, or null when unsafe (so a
// dangerous value is never persisted in the first place).
function cleanUrlForStore(url) {
  const safe = safeUrl(url);
  return safe === '#' ? null : safe;
}

module.exports = { safeUrl, cleanUrlForStore };
