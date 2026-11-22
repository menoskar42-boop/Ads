#!/usr/bin/env node
/**
 * أصوات ElevenLabs بالباقة المجانية (المالك ٢٠٢٦-١١-١٩: «لو متاح مجانى كل يوم اعملها كل يوم»): الـAPI المجانى بيرفض أصوات المكتبة،
 * فكلود بيولّد الجمل من موقع ElevenLabs (Flows) على دفعات، ويكتب لينكاتها فى drive-web/voice/el-fetch.json، والسكربت ده
 * (فى Shell ريبليت — بيئة كلود مقفول فيها موقع ملفات ElevenLabs) بينزّلها بأسمائها الصح ويحدّث الـmanifest:
 *   node scripts/oscar-voice-fetch.js
 * اللينكات بتخلص بعد ساعتين تقريباً، فيتشغّل على طول. مابيمسحش ولا ملف صوت موجود.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const V = require('../src/drive/voice');

const LIST = path.join(V.VOICE_DIR, 'el-fetch.json');

(async () => {
  const items = fs.existsSync(LIST) ? JSON.parse(fs.readFileSync(LIST, 'utf8')) : [];
  let ok = 0, failed = 0;
  const left = [];
  for (const it of items) {
    if (!V.isEl(it.v) || !/^[0-9a-f]{32}\.mp3$/.test(it.f) || !/^https:\/\/[a-z0-9.-]*elevenlabs(usercontent)?\.(io|com)\//.test(it.url)) { failed++; continue; }
    const dst = path.join(V.VOICE_DIR, it.v, it.f);
    if (fs.existsSync(dst)) { ok++; continue; }
    try {
      const r = await fetch(it.url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1000) throw new Error('too small');
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst + '.tmp', buf); fs.renameSync(dst + '.tmp', dst);
      ok++; console.log('  ✓', it.v, it.f);
    } catch (e) { failed++; left.push(it); console.warn('  ✗', it.v, it.f, e.message); }
  }
  for (const v of Object.keys(V.EL_VOICES)) fs.writeFileSync(path.join(V.VOICE_DIR, v, 'manifest.json'), JSON.stringify(V.manifest(v)));
  if (left.length) fs.writeFileSync(LIST, JSON.stringify(left, null, 1)); else if (fs.existsSync(LIST)) fs.unlinkSync(LIST);
  console.log(`اتنزّل ${ok} · فشل ${failed} · الـmanifest اتحدّث`);
})();
