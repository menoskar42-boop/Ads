const fs = require('fs');
const { extractBoxes } = require('./boxes.cjs');
const { extractNetwork, GHANAYEM, DERGNDLA } = require('./cables.cjs');
const M = [];
/** تفريغ آلى: الكابينة + البكسيات (رقم · البلوك · فرعات الخرج). المكرر والرقم «0» عليهم «يتراجع»، والأرقام الناقصة فى الملاحظات. */
function autoData(jsonPath, layerRe, central, cabinet, title, net) {
  const db = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const bx = extractBoxes(db, layerRe);
  // الكابلات (المالك ٢٠٢٦-١١-١٩: «اشتغل واعمل بيانات من الكهربى عادى»): تتبّع خطوط طبقة الكابلات بين الكابينة والوصلات والبكسيات
  // + نص «طول/أزواج"/قطر» جنب كل خط. اتجرّب على 6.7: ٧٠ من ٧٢ كابل زى التفريغ بالإيد بالحرف، ومفيش كابل غلط.
  const r = net ? extractNetwork(db, { ...net, cabName: cabinet }) : null;   // اسم الكابينة: لو فيه رسمة كابينة تانية متنسخة فى الملف
  const segs = r ? r.segs : [];
  const perBox = {}; segs.forEach((g) => [g.from, g.to].forEach((n) => { if (/^B/.test(n)) perBox[n] = (perBox[n] || 0) + 1; }));
  const seen = {}; bx.forEach((b) => (seen[b.box] = (seen[b.box] || 0) + 1));
  const boxes = bx.map((b) => {
    const joint = segs.find((g) => g.to === 'B' + b.box)?.from || '';
    const issues = [];
    if (seen[b.box] > 1) issues.push('الرقم ده متكرر فى الخريطة');
    if (b.box === '0') issues.push('رقم 0 — يتراجع على الخريطة');
    if ((perBox['B' + b.box] || 0) > 1) issues.push('التفريغ الآلى لقى أكتر من كابل للبكس ده');
    if (r && r.boxes.some((x) => x.id === 'B' + b.box && x.noSym)) issues.push('رمز البكس مش مرسوم فى الخريطة — مكانه آخر الكابل اللى جنب رقمه');
    return { box: b.box, block: b.block, pairs: b.pairs, joint, ...(issues.length ? { uncertain: true, notes: issues.join(' · ') } : {}) };
  }).sort((a, b) => parseInt(a.box) - parseInt(b.box));
  const segments = segs.map((g) => ({ from: g.from, to: g.to, lengthM: g.lengthM, pairs: g.pairs, gaugeMm: g.gaugeMm,
    ...(g.dead ? { dead: g.dead } : {}), ...(g.marker ? { marker: g.marker } : {}),
    ...((perBox[g.to] || 0) > 1 || g.lengthM == null ? { uncertain: true } : {}),
    ...(g.nolabel ? { notes: 'الخط مرسوم فى الخريطة بس الطول مش مكتوب جنبه — اكتب الطول من الورقة والمسافات اللى بعده هتتحسب' } : {}),
    ...(g.noLine ? { uncertain: true, notes: 'الخط مش مرسوم بين الوصلة والبكس — اتوصّل بالنص المكتوب بينهم، يتراجع' } : {}),
    ...(g.cabGuess ? { uncertain: true, notes: 'الخط فى الرسم واقف قبل الكابينة بشوية — اتوصّل بالكابينة، يتراجع' } : {}),
    ...(g.markerSum ? { uncertain: true, notes: `الكابل معدّى على علامة الوصل ${g.marker} ومكتوب عليه طولين (${g.label}) — اتجمعوا، يتراجع على الخريطة` } : {}) }));
  const nums = bx.map((b) => parseInt(b.box)).filter((n) => n > 0); const max = Math.max(0, ...nums); const missing = [];
  for (let i = 1; i <= max; i++) if (!nums.includes(i)) missing.push(i);
  const notes = [];
  if (missing.length) notes.push(`أرقام بكسيات مش ظاهرة فى الخريطة: ${missing.join('، ')}`);
  if (r && r.unusedLabels.length) notes.push(`كابلات مكتوب نصها فى الخريطة ومالقيناش خطها (تتضاف بإيد): ${r.unusedLabels.join(' · ')}`);
  if (r) { const off = boxes.filter((b) => !r.reached.has('B' + b.box)).map((b) => b.box); if (off.length) notes.push(`بكسيات مش متوصّلة بالكابينة فى التفريغ الآلى (ناقصها كابل فى النص): ${off.join('، ')}`); }
  if (r) { const an = r.joints.filter((j) => j.anon).map((j) => j.id); if (an.length) notes.push(`وصلات مرسومة من غير رقم فى الخريطة (اتسمّت مؤقتاً): ${an.join(' · ')}`); }
  const cg = segs.filter((g) => g.cabGuess); if (cg.length) notes.push(`كابلات خطها واقف قبل الكابينة فى الرسم (اتوصّلت بالكابينة — تتراجع): ${cg.map((g) => g.from + ' ← ' + g.to).join(' · ')}`);
  const nol = segs.filter((g) => g.nolabel); if (nol.length) notes.push(`كابلات مرسومة من غير طول مكتوب (البكسيات اللى بعدها مالهاش مسافة لحد ما الطول يتكتب): ${nol.map((g) => g.from + ' ← ' + g.to).join(' · ')}`);
  return { meta: { central, cabinet, title, notes: 'تفريغ آلى من ملف الأوتوكاد: الكابينة والبكسيات والكابلات (من ← إلى · الطول · الأزواج · القطر). اللى عليه «يتراجع» والملاحظات محتاجين مراجعة على الخريطة.' },
    segments, boxes, spares: [], markers: [], notes };
}
// المالك ٢٠٢٦-١١-١٩: «الخريطة الكهربية لازم يبقى فيها كابينة وبكس — لا تعتمد بدون كابينة وبكسيات».
// ⇒ الرسمة تتسجّل «الشبكة الثانوية» بس لو فيها رقم الكابينة + مربعات البكسيات (فرعات الخرج 31-40 …) + كابلات (46.0/50"/0.4).
// غير كده (الابتدائى · اللوحات المساحية) = **مرجع** جنبها، ومابيتحسبش منه مكان عطل ولا تفريغ.
function texts(db) {
  const t = [], blocks = {}; (db.tables?.BLOCK_RECORD?.entries || []).forEach((b) => (blocks[b.name] = b));
  const walk = (es, d) => { for (const e of es || []) { if (/TEXT|ATTRIB/.test(e.type)) t.push(String(e.text || '').replace(/\s/g, ''));
    if (e.type === 'INSERT' && d < 4) { walk(blocks[e.name]?.entities, d + 1); for (const a of e.attribs || []) t.push(String(a.text || '').replace(/\s/g, '')); } } };
  walk(db.entities, 0); return t;
}
function isElectrical(jsonPath, cab) {
  const t = texts(JSON.parse(fs.readFileSync(jsonPath, 'utf8')));
  const v = [cab, cab.replace('.', '-'), cab.replace('-', '.')];
  const hasCab = t.some((s) => v.includes(s));
  const boxes = t.filter((s) => /^\d{1,3}-\d{1,3}$/.test(s) && !v.includes(s)).length;
  const cables = t.filter((s) => /^\d+(\.\d+)?\/\d+/.test(s) && /0\.\d/.test(s)).length;
  if (!(hasCab && boxes >= 5 && cables >= 5)) { console.warn('⛔ مش كهربى (ناقصه كابينة/بكسيات):', jsonPath, { hasCab, boxes, cables }); return false; }
  return true;
}
// الغنايم 47
for (const f of fs.readdirSync('json').filter((f) => /^scd\d\.\d\.json$/.test(f)).sort()) {
  const c = f.match(/scd(\d\.\d)/)[1];
  if (!isElectrical('json/' + f, c)) continue;
  M.push({ json: 'json/' + f, key: `ghanayem-${c}`, central: 'الغنايم', cabinet: c, title: 'ASSIUT-Elghanayem — Secondary Cable Diagram',
    data: autoData('json/' + f, /P_DP_TXT/, 'الغنايم', c, 'ASSIUT-Elghanayem — Secondary Cable Diagram', GHANAYEM),
    name: 'secondary-dwg.webp', caption: `الشبكة الثانوية — كابينة ${c} (من ملف الأوتوكاد Scd${c}.dwg)` });
}
// دير الجنادلة: الكهربى
for (const c of ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2'])
  if (isElectrical(`dje/${c}drgndel.json`, c)) M.push({ json: `dje/${c}drgndel.json`, key: `dergndla-${c.replace('-', '.')}`, central: 'دير الجنادلة', cabinet: c.replace('-', '.'),
    data: autoData(`dje/${c}drgndel.json`, /TEXT-BOX/, 'دير الجنادلة', c.replace('-', '.'), `ELECTRIC SECONDARY DIAGRAM — دير الجنادلة ${c}`, DERGNDLA),
    title: `ELECTRIC SECONDARY DIAGRAM — دير الجنادلة ${c}`, name: 'secondary-dwg.webp', caption: `الشبكة الثانوية — كابينة ${c} (من ملف الأوتوكاد ${c}DRGNDEL.dwg)` });
for (const n of [1, 2, 3])
  M.push({ json: `dje/cable-${n}.json`, key: 'dergndla-primary', central: 'دير الجنادلة', cabinet: 'الشبكة الابتدائية (مرجع)', title: 'ELECTRIC PRIMARY DIAGRAM — دير الجنادلة',
    name: `primary-${n}.webp`, caption: `مرجع — الشبكة الابتدائية C NO:${n} (من الـMDF للكباين، مافيهاش بكسيات) · CABLE-${n}.dwg` });
// دير الجنادلة: اللوحات المساحية — جنب كهربى كل كابينة اسمها مكتوب فيها، والباقى فى «اللوحات المساحية العامة»
const CABS = new Set(['1-1', '1-2', '2-1', '2-2', '3-1', '3-2']);
for (const f of fs.readdirSync('dj').sort()) {
  const db = JSON.parse(fs.readFileSync('dj/' + f, 'utf8'));
  const sheet = f.replace('.json', '');
  const cnt = {};
  for (const e of db.entities) if (e.type === 'TEXT' || e.type === 'MTEXT') { const s = String(e.text || '').replace(/\s/g, ''); if (/^\d-\d$/.test(s)) cnt[s] = (cnt[s] || 0) + 1; }
  const cabs = /^5000/.test(sheet) ? [] : Object.keys(cnt).filter((c) => CABS.has(c)).sort();
  const base = { json: 'dj/' + f, central: 'دير الجنادلة', name: `asbuilt-${sheet}.webp`, sheet };
  if (!cabs.length) M.push({ ...base, key: 'dergndla-asbuilt', cabinet: 'اللوحات المساحية العامة (مرجع)', title: 'AS-BUILT DWG — دير الجنادلة',
    caption: `مرجع مساحى — لوحة As-Built ${sheet} (مش خريطة كهربية)` });
  for (const c of cabs) M.push({ ...base, key: `dergndla-${c.replace('-', '.')}`, cabinet: c.replace('-', '.'), title: `ELECTRIC SECONDARY DIAGRAM — دير الجنادلة ${c}`,
    caption: `مرجع مساحى — لوحة As-Built ${sheet} (مكان البكسيات على الأرض، مش خريطة كهربية)${cabs.length > 1 ? ` — فيها كمان ${cabs.filter((x) => x !== c).join(' و')}` : ''}` });
}
fs.writeFileSync('manifest.json', JSON.stringify(M, null, 1));
const renders = [...new Set(M.map((m) => m.json))];
console.log('uploads', M.length, 'renders', renders.length, 'maps', new Set(M.map((m) => m.key)).size);
