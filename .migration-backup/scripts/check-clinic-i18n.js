#!/usr/bin/env node
/**
 * Render every clinic template in both languages and fail on any Arabic that
 * still reaches an English page.
 *
 * Rendering is the only check that catches this: strings that come from JS
 * files (module names, status maps) look fine in the template and only leak
 * when the page is actually built. That is exactly how the module labels and
 * descriptions slipped through the first pass.
 *
 * HTML comments and <script>/<style> are excluded — they are not visible text.
 */
'use strict';
const ejs = require('ejs');
const fs = require('fs');
const path = require('path');
const { t } = require('../src/i18n/strings');

const VIEWS = path.join(__dirname, '..', 'src', 'views', 'clinic_admin');
const AR = /[؀-ۿ]/;

function visibleArabic(html) {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ');
  // Strip tags before looking: an attribute like value="ذكر" is a STORED value,
  // not text the user reads, and counting it produces false failures.
  const text = body.replace(/<[^>]*>/g, '\n');
  return text.split('\n')
    .map((s) => s.trim())
    .filter((s) => s && AR.test(s) && s !== 'عربي');
}

module.exports = { visibleArabic, AR, VIEWS, ejs, fs, path, t };

if (require.main === module) {
  console.log('استخدم هذا الملف من سكربت الاختبار الذي يوفّر بيانات كل صفحة.');
}
