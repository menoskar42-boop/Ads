// إنشاء حسابات الأساطيل — من لوحة أدمن OscarDevs بس (المالك ٢٠٢٦-١٠-٠٩: «اعمل الأفضل
// من حيث الحماية»). مفيش تسجيل عام: كلمة السر بتتولّد عشوائية قوية وبتظهر للأدمن مرة واحدة
// يسلّمها للعميل، والعميل يقدر يغيّرها من لوحته.
'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { BCRYPT_COST } = require('../lib/password_cost');
const { pool } = require('./schema');

// حروف من غير اللى بتتلخبط مع بعض (O/0 · I/1/L) — السواق بيكتب الكود على شاشة العربية
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const pick = (alphabet, n) => {
  // rejection sampling: من غير انحياز لأول الحروف (256 مش مضاعف لطول الأبجدية)
  const out = [];
  const max = 256 - (256 % alphabet.length);
  while (out.length < n) {
    for (const b of crypto.randomBytes(n * 2)) {
      if (b < max && out.length < n) out.push(alphabet[b % alphabet.length]);
    }
  }
  return out.join('');
};
const newCode = () => pick(CODE_ALPHABET, 6);
// ١٤ حرف من ٥٥ ≈ ٨٠ بت — مستحيلة بالتخمين حتى من غير حدّ المحاولات
const newPassword = () => pick('ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789', 14);

async function createFleet(name) {
  const password = newPassword();
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  for (let i = 0; i < 6; i++) {
    try {
      const r = await pool.query(
        'INSERT INTO fleet_accounts (name, join_code, password_hash) VALUES ($1, $2, $3) RETURNING id, join_code',
        [name, newCode(), hash]);
      return { id: r.rows[0].id, code: r.rows[0].join_code, password };
    } catch (e) {
      if (e.code !== '23505') throw e;   // كود متكرر (نادر جداً) ⇒ كود تانى
    }
  }
  throw new Error('تعذّر توليد كود فريد');
}

async function resetPassword(id) {
  const password = newPassword();
  const r = await pool.query('UPDATE fleet_accounts SET password_hash = $2 WHERE id = $1 RETURNING join_code',
    [id, await bcrypt.hash(password, BCRYPT_COST)]);
  return r.rowCount ? { code: r.rows[0].join_code, password } : null;
}

module.exports = { createFleet, resetPassword, newCode, newPassword, CODE_ALPHABET };
