// رفع صور خرايط الأوتوكاد لبرنامج الكوابل ⇒ R2 (POST /api/cfm/maps/import، صورة لكل طلب).
// التوكن (سرّ CFM_MAP_IMPORT_TOKEN فى ريبليت) مش فى الكود ولا فى الأوامر: بيتحط فى الهيدر X-Cfm-Import-Token
// من بيئة التشغيل (فى جلسة كلود: البروكسى بيحطه بنفسه). usage: node upload.js <manifest.json> <outDir> [baseUrl] [--only key]
const fs = require('fs'); const path = require('path');
// ٢٠٢٦-١١-١٩: «--only» كان بيتقري كـbaseUrl ⇒ الخيارات بتتشال الأول. وفى بيئة كلود: NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt
const argv = process.argv.slice(2); const oi = argv.indexOf('--only'); const only = oi >= 0 ? argv[oi + 1] : null; if (oi >= 0) argv.splice(oi, 2);
const [manifestPath, outDir, base = 'https://oscardevs.com/serviceflow'] = argv;
const token = process.env.CFM_IMPORT_TOKEN || 'set-by-proxy';
const M = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).filter((m) => !only || m.key === only);
const doneFile = path.join(outDir, 'uploaded.json');
const done = new Set(fs.existsSync(doneFile) ? JSON.parse(fs.readFileSync(doneFile, 'utf8')) : []);
(async () => {
  let ok = 0, fail = 0;
  for (const m of M) {
    const id = `${m.key}/${m.name}`;
    if (done.has(id)) continue;
    const file = path.join(outDir, m.json.replace(/\//g, '_').replace('.json', '.webp'));
    const body = JSON.stringify({ key: m.key, central: m.central, cabinet: m.cabinet, title: m.title, name: m.name, caption: m.caption,
      mime: 'image/webp', base64: fs.readFileSync(file).toString('base64'), ...(m.data ? { data: m.data } : {}) });
    let last = '';
    for (let a = 0; a < 4; a++) {
      try {
        const r = await fetch(`${base}/api/cfm/maps/import`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cfm-import-token': token }, body });
        const txt = await r.text(); last = `${r.status} ${txt.slice(0, 200)}`;
        // ٢٠٢٦-١١-١٩: لو المسار مش منشور، السيرفر بيرجّع صفحة الموقع (HTML) بـ200 ⇒ النجاح = JSON فيه ok بس.
        let j = null; try { j = JSON.parse(txt); } catch (e) {}
        if (r.ok && !(j && j.ok)) { last = `${r.status} مش رد الاستيراد (المسار مش منشور؟ pull + Republish)`; break; }
        if (r.ok) { done.add(id); fs.writeFileSync(doneFile, JSON.stringify([...done])); ok++; break; }
        if (r.status === 404 || r.status === 400) break;
      } catch (e) { last = e.message; }
      await new Promise((s) => setTimeout(s, 2000 * (a + 1)));
    }
    if (!done.has(id)) { fail++; console.log('FAIL', id, last); } else console.log('ok', id);
    if (fail >= 3 && !ok) { console.log('وقفت: ٣ فشل من غير ولا نجاح'); break; }
  }
  console.log(`done ok=${ok} fail=${fail} total=${done.size}/${M.length}`);
})();
