const fs = require('fs');
const M = [];
// الغنايم 47
for (const f of fs.readdirSync('json').filter((f) => /^scd\d\.\d\.json$/.test(f)).sort()) {
  const c = f.match(/scd(\d\.\d)/)[1];
  M.push({ json: 'json/' + f, key: `ghanayem-${c}`, central: 'الغنايم', cabinet: c, title: 'ASSIUT-Elghanayem — Secondary Cable Diagram',
    name: 'secondary-dwg.webp', caption: `الشبكة الثانوية — كابينة ${c} (من ملف الأوتوكاد Scd${c}.dwg)` });
}
// دير الجنادلة: الكهربى
for (const c of ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2'])
  M.push({ json: `dje/${c}drgndel.json`, key: `dergndla-${c.replace('-', '.')}`, central: 'دير الجنادلة', cabinet: c.replace('-', '.'),
    title: `ELECTRIC SECONDARY DIAGRAM — دير الجنادلة ${c}`, name: 'secondary-dwg.webp', caption: `الشبكة الثانوية — كابينة ${c} (من ملف الأوتوكاد ${c}DRGNDEL.dwg)` });
for (const n of [1, 2, 3])
  M.push({ json: `dje/cable-${n}.json`, key: 'dergndla-primary', central: 'دير الجنادلة', cabinet: 'الشبكة الابتدائية', title: 'ELECTRIC PRIMARY DIAGRAM — دير الجنادلة',
    name: `primary-${n}.webp`, caption: `الشبكة الابتدائية C NO:${n} (من ملف الأوتوكاد CABLE-${n}.dwg)` });
// دير الجنادلة: اللوحات المساحية — جنب كهربى كل كابينة اسمها مكتوب فيها، والباقى فى «اللوحات المساحية العامة»
const CABS = new Set(['1-1', '1-2', '2-1', '2-2', '3-1', '3-2']);
for (const f of fs.readdirSync('dj').sort()) {
  const db = JSON.parse(fs.readFileSync('dj/' + f, 'utf8'));
  const sheet = f.replace('.json', '');
  const cnt = {};
  for (const e of db.entities) if (e.type === 'TEXT' || e.type === 'MTEXT') { const s = String(e.text || '').replace(/\s/g, ''); if (/^\d-\d$/.test(s)) cnt[s] = (cnt[s] || 0) + 1; }
  const cabs = /^5000/.test(sheet) ? [] : Object.keys(cnt).filter((c) => CABS.has(c)).sort();
  const base = { json: 'dj/' + f, central: 'دير الجنادلة', name: `asbuilt-${sheet}.webp`, sheet };
  if (!cabs.length) M.push({ ...base, key: 'dergndla-asbuilt', cabinet: 'اللوحات المساحية العامة', title: 'AS-BUILT DWG — دير الجنادلة',
    caption: `لوحة As-Built ${sheet} (مساحى 1:500)` });
  for (const c of cabs) M.push({ ...base, key: `dergndla-${c.replace('-', '.')}`, cabinet: c.replace('-', '.'), title: `ELECTRIC SECONDARY DIAGRAM — دير الجنادلة ${c}`,
    caption: `لوحة As-Built ${sheet} (مساحى 1:500)${cabs.length > 1 ? ` — فيها كمان ${cabs.filter((x) => x !== c).join(' و')}` : ''}` });
}
fs.writeFileSync('manifest.json', JSON.stringify(M, null, 1));
const renders = [...new Set(M.map((m) => m.json))];
console.log('uploads', M.length, 'renders', renders.length, 'maps', new Set(M.map((m) => m.key)).size);
