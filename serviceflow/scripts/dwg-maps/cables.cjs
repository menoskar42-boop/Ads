// تفريغ الكابلات من رسمة الأوتوكاد (الغنايم — Siemens): وصلة/بكس/كابينة ← تتبّع خطوط طبقة الكابلات ← نص «طول/أزواج"/قطر».
const { extractBoxes } = require('./boxes.cjs');
const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function segDist(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; const L = dx * dx + dy * dy; let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
const polyDist = (p, pts) => { let m = Infinity; for (let i = 1; i < pts.length; i++) m = Math.min(m, segDist(p, pts[i - 1], pts[i])); return m; };
const center = (e) => { const v = e.vertices; return [(v[0].x + v[v.length - 1].x) / 2, (v[0].y + v[v.length - 1].y) / 2]; };

function extractNetwork(db, cfg0) {
  const ents = db.entities;
  // كل المسافات مظبوطة على خرايط الغنايم (نص رقم البكس ٠٫٣٥) ⇒ بتتكبّر/تصغر حسب حجم النص فى الملف ده
  const hs = ents.filter((e) => e.type === 'TEXT' && cfg0.boxLayer.test(e.layer) && /^\d{1,3}$/.test(String(e.text).trim())).map((e) => e.textHeight || 0).filter(Boolean).sort((a, b) => a - b);
  const k = hs.length ? hs[Math.floor(hs.length * 0.75)] / 0.35 : 1;
  const cfg = { ...cfg0 }; for (const n of ['jointTextR', 'boxSymR', 'jointR', 'boxR', 'cabPad', 'tol', 'labelR', 'markerR', 'markerSame']) cfg[n] = (cfg0[n] || 0) * k;
  // ١) العُقد
  const joints = []; const boxes = []; const T = ents.filter((e) => e.type === 'TEXT');
  const dots = ents.filter((e) => cfg.isJointDot(e)).map(center);
  // نقط التقاء الكابلات (٣ أطراف خطوط أو أكتر فى نفس النقطة) — بديل لو رمز الوصلة مقاسه مختلف فى الملف ده
  const cendsAll = []; for (const e of ents.filter((e) => cfg.cableLayer.test(e.layer))) {
    const a = e.type === 'LINE' ? [[e.startPoint.x, e.startPoint.y], [e.endPoint.x, e.endPoint.y]] : e.type === 'LWPOLYLINE' && e.vertices?.length >= 2 ? e.vertices.map((v) => [v.x, v.y]) : null;
    if (a) cendsAll.push(a[0], a[a.length - 1]); }
  const hubs = []; for (const p of cendsAll) { const h = hubs.find((h) => D(h.p, p) < 0.05 * k); if (h) h.n++; else hubs.push({ p, n: 1 }); }
  const hubPts = hubs.filter((h) => h.n >= 3).map((h) => h.p);
  // تفرّع على شكل T: طرف خط واقف على نص خط تانى
  const segsAll = []; for (const e of ents.filter((e) => cfg.cableLayer.test(e.layer))) {
    const a = e.type === 'LINE' ? [[e.startPoint.x, e.startPoint.y], [e.endPoint.x, e.endPoint.y]] : e.type === 'LWPOLYLINE' && e.vertices?.length >= 2 ? e.vertices.map((v) => [v.x, v.y]) : null;
    if (a) for (let i = 1; i < a.length; i++) segsAll.push([a[i - 1], a[i]]); }
  for (const p of cendsAll) for (const [a, b] of segsAll) { if (D(p, a) < 0.05 * k || D(p, b) < 0.05 * k) continue; if (segDist(p, a, b) < 0.03 * k) { hubPts.push(p); break; } }
  for (const t of T.filter((t) => cfg.jointText.test(t.layer) && /^\d{1,2}$/.test(String(t.text).trim()))) {
    const p = [t.startPoint.x, t.startPoint.y]; const near = (arr) => arr.map((q) => [q, D(p, q)]).sort((a, b) => a[1] - b[1])[0];
    const d = near(dots); const h = near(hubPts);
    const pick = d && d[1] < cfg.jointTextR ? d[0] : h && h[1] < cfg.jointTextR * 1.3 ? h[0] : null;
    if (pick && !joints.some((j) => D(j.p, pick) < 0.05 * k)) joints.push({ id: 'J' + String(Number(t.text.trim())).padStart(2, '0'), num: String(Number(t.text.trim())), p: pick });
  }
  const labels = extractBoxes(db, cfg.boxLayer);
  const syms = ents.filter((e) => cfg.isBoxSym(e)).map((e) => (e.type === 'CIRCLE' ? [e.center.x, e.center.y] : center(e)));
  const usedSym = new Set();
  // كل بكس ⇒ أقرب رمز بكس (قلب/دايرة) فاضى
  const pairs = []; labels.forEach((b, i) => syms.forEach((s, j) => pairs.push([D([b.x, b.y], s), i, j])));
  pairs.sort((a, b) => a[0] - b[0]); const usedLab = new Set();
  for (const [d, i, j] of pairs) { if (usedLab.has(i) || usedSym.has(j) || d > cfg.boxSymR) continue; usedLab.add(i); usedSym.add(j); boxes.push({ id: 'B' + labels[i].box, p: syms[j], box: labels[i] }); }
  // الكابينة: مستطيل نصوص رسمة الكابينة
  const ct = T.filter((t) => cfg.cabText.test(t.layer)).map((t) => [t.startPoint.x, t.startPoint.y]);
  const cab = ct.length ? { x0: Math.min(...ct.map((p) => p[0])) - cfg.cabPad, x1: Math.max(...ct.map((p) => p[0])) + cfg.cabPad, y0: Math.min(...ct.map((p) => p[1])) - cfg.cabPad * 2.5, y1: Math.max(...ct.map((p) => p[1])) + cfg.cabPad } : null;
  // ٢) قطع الكابلات
  const pieces = [];
  for (const e of ents.filter((e) => cfg.cableLayer.test(e.layer) || (cfg.extraCableLines && e.type === 'LINE' && cfg.extraCableLines.test(e.layer)
    && (!cfg.extraLineType || cfg.extraLineType.test(String(e.lineType || 'BYLAYER')))))) {
    if (e.type === 'LINE') pieces.push([[e.startPoint.x, e.startPoint.y], [e.endPoint.x, e.endPoint.y]]);
    else if (e.type === 'LWPOLYLINE' && e.vertices?.length >= 2) pieces.push(e.vertices.map((v) => [v.x, v.y]));
    else if (e.type === 'ARC') { const a0 = e.startAngle, a1 = e.endAngle < a0 ? e.endAngle + 2 * Math.PI : e.endAngle; const pts = []; for (let i = 0; i <= 8; i++) { const a = a0 + (a1 - a0) * i / 8; pts.push([e.center.x + e.radius * Math.cos(a), e.center.y + e.radius * Math.sin(a)]); } pieces.push(pts); }
  }
  // ٢ب) الخط الرئيسى ساعات بيعدّى على كذا وصلة من غير ما يتقطع ⇒ نقطّعه عند كل وصلة بيعدّى عليها
  const splitAt = (pts) => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      for (const j of joints) {
        const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; if (!L) continue;
        const t = ((j.p[0] - a[0]) * dx + (j.p[1] - a[1]) * dy) / L; if (t <= 0.02 || t >= 0.98) continue;
        const q = [a[0] + t * dx, a[1] + t * dy]; if (D(q, j.p) > cfg.jointR) continue;
        return [...splitAt([...pts.slice(0, i), q]), ...splitAt([q, ...pts.slice(i)])];
      }
    }
    return [pts];
  };
  const raw = pieces.splice(0); for (const p of raw) pieces.push(...splitAt(p));
  // ٢ج) علامات الوصل (A–A · B–B): نفس الحرف مكتوب مرتين = نفس الكابل متكمّل ⇒ كل ظهور عقدة مؤقتة، وبعدين بنوصّلهم
  const marks = []; const mt = T.filter((t) => cfg.cableText.test(t.layer) && /^[A-Z]$/.test(String(t.text).trim()));
  for (const t of mt) { const name = String(t.text).trim(); const p = [t.startPoint.x, t.startPoint.y];
    const same = marks.filter((m) => m.name === name);
    // الحرف بيتكتب مرتين على نفس الخط (أول الخط وآخره) ⇒ لو فيه ظهور قريب (≤ ٢٫٥) يبقى نفس العلامة
    const close = same.find((m) => D(m.p, p) < cfg.markerSame); if (close) { close.extra.push(p); continue; }
    marks.push({ name, p, extra: [], id: `M:${name}#${same.length + 1}` }); }
  // مركز العلامة: نص الحرفين على جانبين الشَرطة، والكابل واقف على نص الشَرطة
  for (const m of marks) { const all = [m.p, ...m.extra]; m.c = [all.reduce((a, q) => a + q[0], 0) / all.length + (all.length === 1 ? 0 : 0.1), all.reduce((a, q) => a + q[1], 0) / all.length + 0.2]; }
  const markAt = (p) => { let best = null; for (const m of marks) { const d = D(p, m.c); if (d < cfg.markerR && (!best || d < best.d)) best = { id: m.id, d }; } return best && best.id; };
  // ٣) نقطة نهاية ⇒ عقدة (وصلة · بكس · كابينة) أو نقطة عادية
  const nodeAt = (p) => {
    let best = null;
    for (const j of joints) { const d = D(p, j.p); if (d < cfg.jointR && (!best || d < best.d)) best = { id: j.id, d }; }
    for (const b of boxes) { const d = D(p, b.p); if (d < cfg.boxR && (!best || d < best.d)) best = { id: b.id, d }; }
    if (!best) { const m = markAt(p); if (m) return m; }
    if (!best && cab && p[0] >= cab.x0 && p[0] <= cab.x1 && p[1] >= cab.y0 && p[1] <= cab.y1) best = { id: 'CAB', d: 0 };
    return best ? best.id : null;
  };
  const ends = []; pieces.forEach((pts, i) => { ends.push({ i, k: 0, p: pts[0] }); ends.push({ i, k: 1, p: pts[pts.length - 1] }); });
  const linked = (e) => ends.filter((o) => o.i !== e.i && D(o.p, e.p) < cfg.tol);
  // ٤) تتبّع: من كل طرف عند عقدة، امشى فى القطع المتوصّلة لحد عقدة تانية. عند التفرّع (تقاطع أو خط متكرر أو حتة زيادة)
  //    جرّب الاتجاهات بالترتيب (الأقل لفّاً الأول، ولحد ٤٥°) وخد أول واحد يوصل لعقدة.
  const paths = []; const seen = new Set();
  const walk = (cur, a, visited, pts, depth) => {
    if (depth > 120) return null;
    const piece = cur.k === 0 ? pieces[cur.i] : [...pieces[cur.i]].reverse();
    const P = pts.concat(piece); const far = { i: cur.i, k: 1 - cur.k, p: piece[piece.length - 1] };
    const n = nodeAt(far.p);
    const nx = linked(far).filter((o) => !visited.includes(o.i) && o.i !== cur.i);
    // البكس آخر الكابل: لو الخط مكمّل بعد رمز البكس (كابل رئيسى معدّى جنبه) ⇒ ماتقفش عنده
    if (n && n !== a && !(/^B/.test(n) && nx.length)) return { to: n, pts: P, used: [...visited, cur.i] };
    if (n === a && P.length > 2) return null;
    if (!nx.length) return null;
    const prev = piece[piece.length - 2] || piece[0], here = far.p; const dir = Math.atan2(here[1] - prev[1], here[0] - prev[0]);
    const sc = nx.map((o) => { const q = pieces[o.i]; const nxt = o.k === 0 ? q[1] : q[q.length - 2]; let ang = Math.abs(Math.atan2(nxt[1] - here[1], nxt[0] - here[0]) - dir); if (ang > Math.PI) ang = 2 * Math.PI - ang; return [ang, o]; })
      .sort((x, y) => x[0] - y[0]);
    const tries = nx.length === 1 ? sc : sc.filter((x) => x[0] <= Math.PI / 2 + 0.01);
    for (const [, o] of tries) { const r = walk(o, a, [...visited, cur.i], P, depth + 1); if (r) return r; }
    return null;
  };
  for (const st of ends) {
    const a = nodeAt(st.p); if (!a || seen.has(st.i + ':' + st.k)) continue;
    const r = walk(st, a, [], [], 0);
    seen.add(st.i + ':' + st.k);
    if (r) { r.used.forEach((i) => { seen.add(i + ':0'); seen.add(i + ':1'); }); paths.push({ from: a, to: r.to, pts: r.pts }); }
  }
  // ٤ب) دمج المسارات عند العلامات: X ← M:A#1  و  M:A#2 → Y  ⇒  X → Y (marker A)
  const isM = (n) => /^M:/.test(n);
  for (const name of [...new Set(marks.map((m) => m.name))]) {
    const occ = marks.filter((m) => m.name === name); if (occ.length !== 2) continue;
    const p1 = paths.filter((p) => p.from === occ[0].id || p.to === occ[0].id), p2 = paths.filter((p) => p.from === occ[1].id || p.to === occ[1].id);
    if (p1.length !== 1 || p2.length !== 1 || p1[0] === p2[0]) continue;
    const other = (p, id) => (p.from === id ? p.to : p.from);
    const x = other(p1[0], occ[0].id), y = other(p2[0], occ[1].id); if (isM(x) || isM(y)) continue;
    paths.splice(paths.indexOf(p1[0]), 1); paths.splice(paths.indexOf(p2[0]), 1);
    paths.push({ from: x, to: y, pts: [...p1[0].pts, ...p2[0].pts], marker: name });
  }
  for (let i = paths.length - 1; i >= 0; i--) if (isM(paths[i].from) || isM(paths[i].to)) paths.splice(i, 1);
  // ٥) نص الكابل لكل مسار: أقرب نص «طول/أزواج"/قطر» من الخط (كل نص لمسار واحد)
  const lab = T.filter((t) => cfg.cableText.test(t.layer) && /^\d+(\.\d+)?\/\d+/.test(String(t.text).trim()))
    .map((t) => { const s = String(t.text).trim(); const r = t.rotation || 0; const w = s.length * (t.textHeight || 0.2) * 0.55 * (t.xScale || 1);
      return { s, p: [t.startPoint.x + Math.cos(r) * w / 2 - Math.sin(r) * (t.textHeight || 0.2) * 0.4, t.startPoint.y + Math.sin(r) * w / 2 + Math.cos(r) * (t.textHeight || 0.2) * 0.4] }; });
  const cand = []; paths.forEach((p, i) => lab.forEach((l, j) => cand.push([polyDist(l.p, p.pts), i, j])));
  cand.sort((a, b) => a[0] - b[0]); const pu = new Set(), lu = new Set(); const segs = [];
  for (const [d, i, j] of cand) { if (pu.has(i) || lu.has(j) || d > cfg.labelR) continue; pu.add(i); lu.add(j);
    const m = lab[j].s.match(/^(\d+(?:\.\d+)?)\/(\d+)"?\*?\/(\d?\.\d+)(?:\((\d+)"?\*?d\))?/i);
    const p = paths[i]; const [from, to] = p.from === 'CAB' || (/^J/.test(p.from) && /^B/.test(p.to)) ? [p.from, p.to] : /^B/.test(p.from) ? [p.to, p.from] : [p.from, p.to];
    segs.push({ from, to, ...(p.marker ? { marker: p.marker } : {}), lengthM: m ? Number(m[1]) : null, pairs: m ? Number(m[2]) : null, gaugeMm: m ? Number(m[3]) : null, ...(m && m[4] ? { dead: Number(m[4]) } : {}), label: lab[j].s, d });
  }
  // ٦) الاتجاه: من ناحية الكابينة لبرّه (distancesFromCabinet بيمشى from → to) — بـBFS من الكابينة على الكابلات اللى اتلقت
  const adj = {}; segs.forEach((s, i) => { (adj[s.from] ||= []).push(i); (adj[s.to] ||= []).push(i); });
  const seenN = new Set(['CAB']), q = ['CAB'], fixed = new Set();
  while (q.length) { const n = q.shift(); for (const i of adj[n] || []) { if (fixed.has(i)) continue; const s = segs[i]; if (s.to === n) { s.to = s.from; s.from = n; } fixed.add(i); if (!seenN.has(s.to)) { seenN.add(s.to); q.push(s.to); } } }
  const reached = new Set(seenN);
  const unl = paths.filter((_, i) => !pu.has(i)).map((p) => p.from + '-' + p.to);
  return { joints, boxes, cab, segs, reached, unlabeledPaths: unl, unusedLabels: lab.filter((_, j) => !lu.has(j)).map((l) => l.s), boxLabels: labels.length, syms: syms.length };
}
const GHANAYEM = { boxLayer: /P_DP_TXT/, jointText: /P-DBUR-TXT/, cableText: /P-DBUR-TXT/, cabText: /P_CAB_TXT/, cableLayer: /^P-DBUR-CBL$/, extraCableLines: /^P-J-TXT$/,   // ساعات الكابل مرسوم على طبقة الأزواج بالغلط (6.7: وصلة 05 ← بكس 10)
 
  isJointDot: (e) => e.layer === 'P_SYM' && e.type === 'LWPOLYLINE' && (e.constantWidth || 0) > 0.05 && (e.constantWidth || 0) < 0.2 && (e.vertices || []).length === 2,
  isBoxSym: (e) => e.layer === 'P_SYM' && ((e.type === 'LWPOLYLINE' && (e.constantWidth || 0) > 0.2) || e.type === 'CIRCLE'),
  jointTextR: 1.0, boxSymR: 3.2, markerR: 0, markerSame: 3.6, jointR: 0.2, boxR: 0.45, cabPad: 0.6, tol: 0.03, labelR: 0.8 };
// دير الجنادلة (R.C.C): كابلات على CA وكمان خطوط على طبقة 0 · الوصلات GONTA + TEXT-JONTA · البكس BOX + TEXT-BOX · النص TEXT-LONG
const DERGNDLA = { boxLayer: /^TEXT-BOX$/, jointText: /^TEXT-JONTA$/, cableText: /^TEXT-LONG$/, cabText: /^TEXT-CABINA$/, cableLayer: /^CA$/, extraCableLines: /^0$/,
  isJointDot: (e) => e.layer === 'GONTA' && e.type === 'LWPOLYLINE',
  isBoxSym: (e) => e.layer === 'BOX' && e.type === 'LWPOLYLINE',
  jointTextR: 1.0, boxSymR: 3.2, jointR: 1.3, boxR: 0.45, cabPad: 0.6, tol: 0.03, labelR: 0.8, markerR: 0, markerSame: 3.6 };
module.exports = { extractNetwork, GHANAYEM, DERGNDLA };
