#!/usr/bin/env node
/**
 * A vault with no door.
 *
 * The AES-256 vault, the encrypted column, the "resolved at run time, never
 * shown to the model" plumbing — all of it was built and none of it could be
 * used, because there was nowhere to type a password. So the only way to give
 * Sokro a login was to say it in the chat, which sends it through the model and
 * writes it into the transcript. That is precisely what the vault exists to
 * prevent, and the missing form made it the ONLY option.
 *
 * The door has three properties that matter more than the door:
 *
 *   · **names come back, values never do** — the listing API returns names, and
 *     the screen shows names;
 *   · **the field empties on submit, success or failure** — a password left
 *     sitting in a form is the next person who opens this laptop's problem;
 *   · **it says where the value goes** — encrypted on the server, used at run
 *     time, never sent to the AI. A person typing a real password deserves to
 *     read that before they type it, not after.
 *
 *   node scripts/check-secrets-ui.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const ui = fs.readFileSync(path.join(ROOT, 'sokro/ui/app.html'), 'utf8');
const nl = (m) => m.replace(/[^\n]/g, ' ');
const router = fs.readFileSync(path.join(ROOT, 'sokro/router.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

/* ── The door exists ───────────────────────────────────────────────────── */
{
  check('فيه خانة اسم وخانة كلمة سر', /id="secName"/.test(ui) && /id="secValue"/.test(ui));
  check('وكلمة السر خانة password مش نص ظاهر', /id="secValue"[^>]*type="password"/.test(ui));
  check('ومفيش ملء تلقائي بكلمة سر قديمة', /autocomplete="new-password"/.test(ui));
  check('وفيه زرار حفظ موصول', /id="secAdd"/.test(ui) && /\$\('#secAdd'\)\.addEventListener\('click', saveSecret\)/.test(ui));
  check('والقايمة بتتحمّل مع الإعدادات', /refreshGmail\(\); refreshSecrets\(\);/.test(ui));
}

/* ── What it does with the value ───────────────────────────────────────── */
{
  const fn = (ui.match(/async function saveSecret\(\)[\s\S]*?\n  \}/) || [''])[0];
  check('الحفظ بيبعت للراوت المتشفّر', /fetch\('\/api\/secrets',\{method:'POST'/.test(fn));
  // Both paths clear the box: a failure that leaves the password on screen is
  // the same exposure as a success that does.
  check('والخانة بتتفضّى بعد الحفظ', /v\.value=''; n\.value='';/.test(fn));
  check('وبتتفضّى كمان لو الحفظ فشل', /catch\(e\)\{ v\.value='';/.test(fn));
  check('والنتيجة بتتقال (نجح ولا لأ)', /مااتحفظتش/.test(fn) && /اتحفظت/.test(fn));
  check('ومفيش قيمة بتترسم على الشاشة', !/secValue'\)\.value\s*\+/.test(ui) && !/textContent=.*value/.test(fn));
}

/* ── Listing and deleting ──────────────────────────────────────────────── */
{
  const fn = (ui.match(/async function refreshSecrets\(\)[\s\S]*?\n  \}/) || [''])[0];
  check('القايمة بتعرض الأسماء بس', /'🔑 '\+sec\.name/.test(fn) && !/sec\.value/.test(fn));
  check('والفاضي بيتقال', /مفيش كلمات سر محفوظة/.test(fn));
  check('والحذف بيسأل الأول', /confirm\('تحذف كلمة سر/.test(fn));
  check('والحذف بيروح للراوت الصح', /fetch\('\/api\/secrets\/'\+encodeURIComponent\(sec\.name\)/.test(fn));
}

/* ── And the server still refuses to hand values back ──────────────────── */
{
  check('الراوت بيرجّع أسماء بس',
    /SELECT name, updated_at FROM sokro_secrets/.test(router) && !/SELECT ciphertext[\s\S]{0,80}res\.json/.test(router));
  check('والتخزين متشفّر', /vault\.encrypt\(value\)/.test(router));
  check('ومن غير مفتاح الخزنة بيرفض بدل ما يخزّن خام', /vault\.configured\(\)/.test(router));
  check('والتحديث بيستبدل مش بيكرّر', /ON CONFLICT \(user_id, name\) DO UPDATE SET ciphertext/.test(router));
  check('وكل عملية متقيّدة بصاحبها', /DELETE FROM sokro_secrets WHERE user_id = \$1 AND name = \$2/.test(router));
  // The whole point of the door: the value must never travel through a prompt.
  const fill = fs.readFileSync(path.join(ROOT, 'sokro/actions/FillSubmitAction.js'), 'utf8');
  check('والقيمة بتتفكّ وقت التنفيذ بس', /vault\.decrypt\(row\.ciphertext\)/.test(fill));
  check('والموديل بيشوف `{{secret:name}}` مش القيمة', /\{\{\\s\*secret:\(\[\\w\.-\]\+\)\\s\*\}\}/.test(fill.replace(/\\\\/g, '\\')) || /secret:/.test(fill));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني المستخدم ممكن يضطر يكتب كلمة سره في الشات.`
  : '\nللخزنة باب: الاسم بيتحفظ، القيمة بتتشفّر وتختفي، والشات مالوش دعوة.');
process.exit(fail ? 1 : 0);
