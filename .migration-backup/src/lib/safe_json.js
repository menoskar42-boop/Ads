'use strict';
/**
 * JSON that is safe to embed inside an inline `<script>`.
 *
 * `JSON.stringify` escapes quotes and backslashes and nothing else. It does NOT
 * escape `</script>`, so any string that reaches a script tag from outside —
 * a product review, a customer's name, a merchant's business description —
 * could close the tag and run:
 *
 *     </script><script>…
 *
 * That is a stored XSS on every visitor to the page, and it was live on the
 * product page (reviews, auto-approved) and on the company JSON-LD of every
 * tenant page.
 *
 * The escaped characters are `<`, `>` and `&` — enough that no tag can be
 * closed or opened — plus U+2028 and U+2029, which are legal inside a JSON
 * string but are line terminators to a JavaScript parser, so they break the
 * script without an angle bracket anywhere in sight.
 *
 * The output is still valid JSON: `<` parses back to `<`.
 *
 * It lives here rather than inline in server.js so the check scripts test THIS
 * function instead of a copy of it, and so a template rendered outside Express
 * can still get it.
 */
function safeJson(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

module.exports = { safeJson };
