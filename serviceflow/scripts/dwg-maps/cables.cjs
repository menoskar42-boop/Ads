// تفريغ الكابلات من رسمة الأوتوكاد (الغنايم — Siemens): وصلة/بكس/كابينة ← تتبّع خطوط طبقة الكابلات ← نص «طول/أزواج"/قطر».
const { extractBoxes } = require('./boxes.cjs');
const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function segDist(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; const L = dx * dx + dy * dy; let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
const polyDist = (p, pts) => { let m = Infinity; for (let i = 1; i < pts.length; i++) m = Math.min(m, segDist(p, pts[i - 1], pts[i])); return m; };
const center = (e) => { if (e.type === 'LINE') return [(e.startPoint.x + e.endPoint.x) / 2, (e.startPoint.y + e.endPoint.y) / 2]; const v = e.vertices; return [(v[0].x + v[v.length - 1].x) / 2, (v[0].y + v[v.length - 1].y) / 2]; };

// توزيع أمثل (min-cost max-matching): أكبر عدد أزواج، وبأقل مجموع تكلفة — edges = [a, b, cost]
function bestMatch(nA, nB, edges) {
  const N = nA + nB + 2, S = N - 2, Tt = N - 1;
  const g = Array.from({ length: N }, () => []); const addE = (u, v, c) => { g[u].push({ v, cap: 1, c, r: g[v].length }); g[v].push({ v: u, cap: 0, c: -c, r: g[u].length - 1 }); };
  for (const i of new Set(edges.map((e) => e[0]))) addE(S, i, 0); for (const j of new Set(edges.map((e) => e[1]))) addE(nA + j, Tt, 0); for (const [i, j, c] of edges) addE(i, nA + j, c);
  for (;;) { const dist = new Array(N).fill(Infinity), inQ = new Array(N).fill(false), pv = new Array(N), pe = new Array(N); dist[S] = 0; const q = [S];
    while (q.length) { const u = q.shift(); inQ[u] = false; g[u].forEach((e, k) => { if (e.cap > 0 && dist[u] + e.c < dist[e.v] - 1e-9) { dist[e.v] = dist[u] + e.c; pv[e.v] = u; pe[e.v] = k; if (!inQ[e.v]) { inQ[e.v] = true; q.push(e.v); } } }); }
    if (dist[Tt] === Infinity) break;
    for (let v = Tt; v !== S; v = pv[v]) { const e = g[pv[v]][pe[v]]; e.cap -= 1; g[v][e.r].cap += 1; } }
  const out = []; for (let i = 0; i < nA; i++) for (const e of g[i]) if (e.v >= nA && e.v < nA + nB && e.cap === 0) out.push([i, e.v - nA]); return out;
}
function extractNetwork(db, cfg0) {
  const ents = db.entities;
  // كل المسافات مظبوطة على خرايط الغنايم (نص رقم البكس ٠٫٣٥) ⇒ بتتكبّر/تصغر حسب حجم النص فى الملف ده
  const hs = ents.filter((e) => e.type === 'TEXT' && cfg0.boxLayer.test(e.layer) && /^\d{1,3}$/.test(String(e.text).trim())).map((e) => e.textHeight || 0).filter(Boolean).sort((a, b) => a - b);
  const k = hs.length ? hs[Math.floor(hs.length * 0.75)] / 0.35 : 1;
  const cfg = { ...cfg0 }; for (const n of ['gapR', 'jointCore', 'jointTextR', 'boxSymR', 'jointR', 'boxR', 'cabPad', 'tol', 'labelR', 'markerR', 'markerSame']) cfg[n] = (cfg0[n] || 0) * k;
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
  // رقم الوصلة ⇒ أقرب رمز وصلة فاضى (توزيع عام بالأقرب، عشان رقمين مايخدوش نفس النقطة)، وإلا أقرب نقطة التقاء خطوط
  // رقم غرفة التفتيش («CH» وتحتها/فوقها رقم) مش رقم وصلة
  const chs = T.filter((t) => cfg.jointText.test(t.layer) && /^CH$/i.test(String(t.text).trim())).map((t) => [t.startPoint.x, t.startPoint.y, t.textHeight || 0.2]);
  const isCH = (t) => chs.some(([x, y, h]) => D([x, y], [t.startPoint.x, t.startPoint.y]) < h * 2.2);
  const jtexts = T.filter((t) => cfg.jointText.test(t.layer) && /^\d{1,2}['"]?$/.test(String(t.text).trim()) && !isCH(t));
  const jc = []; jtexts.forEach((t, i) => dots.forEach((q, j) => { const d = D([t.startPoint.x, t.startPoint.y], q); if (d < cfg.jointTextR) jc.push([d, i, j]); }));
  jc.sort((x, y) => x[0] - y[0]); const tUsed = new Set(), dUsed = new Set();
  const addJ = (t, p) => { const num = String(Number(String(t.text).trim().replace(/['"]/g, ''))); const id = 'J' + num.padStart(2, '0') + (/['"]/.test(String(t.text)) ? "'" : '');
    if (!joints.some((j) => j.id === id) && !joints.some((j) => D(j.p, p) < 0.05 * k)) joints.push({ id, num, p }); };
  for (const [, i, j] of jc) { if (tUsed.has(i) || dUsed.has(j)) continue; tUsed.add(i); dUsed.add(j); addJ(jtexts[i], dots[j]); }
  jtexts.forEach((t, i) => { if (tUsed.has(i)) return; const p = [t.startPoint.x, t.startPoint.y];
    const h = hubPts.map((q) => [q, D(p, q)]).sort((x, y) => x[1] - y[1])[0]; if (h && h[1] < cfg.jointTextR * 1.3) addJ(t, h[0]); });
  const labels = extractBoxes(db, cfg.boxLayer);
  const syms = []; for (const q of ents.filter((e) => cfg.isBoxSym(e)).map((e) => (e.type === 'CIRCLE' ? [e.center.x, e.center.y] : center(e)))) if (!syms.some((x) => D(x, q) < 0.05 * k)) syms.push(q);   // الرمز المرسوم مرتين = رمز واحد
  const usedSym = new Set();
  // كل بكس ⇒ أقرب رمز بكس (قلب/دايرة) فاضى
  const pairs = []; labels.forEach((b, i) => syms.forEach((s, j) => pairs.push([D([b.x, b.y], s), i, j])));
  pairs.sort((a, b) => a[0] - b[0]); const usedLab = new Set();
  const bpairs = cfg.labelMatching ? bestMatch(labels.length, syms.length, pairs.filter((x) => x[0] <= cfg.boxSymR).map(([d, i, j]) => [i, j, d])).map(([i, j]) => [0, i, j]) : pairs;
  for (const [d, i, j] of bpairs) { if (usedLab.has(i) || usedSym.has(j) || d > cfg.boxSymR) continue; usedLab.add(i); usedSym.add(j); boxes.push({ id: 'B' + labels[i].box, p: syms[j], box: labels[i] }); }
  // الكابينة: مستطيل نصوص رسمة الكابينة
  const ct = T.filter((t) => cfg.cabText.test(t.layer) && String(t.text || '').trim()).map((t) => [t.startPoint.x, t.startPoint.y]);
  const cab = ct.length ? { x0: Math.min(...ct.map((p) => p[0])) - cfg.cabPad, x1: Math.max(...ct.map((p) => p[0])) + cfg.cabPad, y0: Math.min(...ct.map((p) => p[1])) - cfg.cabPad * 2.5, y1: Math.max(...ct.map((p) => p[1])) + cfg.cabPad } : null;
  // ٢أ) غرف التفتيش: مستطيل صغير جنب «CH» — الوصلة اللى جوّه الغرفة بيتوصل بيها أى كابل معدّى فى الغرفة (قرار المالك: الوصلة جوّه الغرفة)
  const holes = []; if (cfg.manholes) {
    const rects = []; const isH = (e) => Math.abs(e.startPoint.y - e.endPoint.y) < 0.01, isV = (e) => Math.abs(e.startPoint.x - e.endPoint.x) < 0.01;
    for (const e of ents.filter((e) => e.type === 'LWPOLYLINE' && (e.vertices || []).length >= 4)) { const xs = e.vertices.map((v) => v.x), ys = e.vertices.map((v) => v.y); rects.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), e: [e] }); }
    const LL = ents.filter((e) => e.type === 'LINE'), VV = LL.filter(isV);
    for (const h of LL.filter(isH)) { const xa = Math.min(h.startPoint.x, h.endPoint.x), xb = Math.max(h.startPoint.x, h.endPoint.x), y = h.startPoint.y; if (xb - xa > 5 * k) continue;
      const v1 = VV.find((v) => Math.abs(v.startPoint.x - xa) < 0.01 * k && Math.abs(Math.min(v.startPoint.y, v.endPoint.y) - y) < 0.01 * k && Math.abs(v.startPoint.y - v.endPoint.y) < 5 * k);
      if (v1) rects.push({ x0: xa, x1: xb, y0: y, y1: Math.max(v1.startPoint.y, v1.endPoint.y), e: [h, v1] }); }
    for (const t of T.filter((t) => cfg.jointText.test(t.layer) && /^CH$/i.test(String(t.text).trim()))) { const p = [t.startPoint.x, t.startPoint.y];
      const r = rects.filter((r) => r.x1 - r.x0 < 5 * k && r.y1 - r.y0 < 5 * k && r.x1 - r.x0 > 0.5 * k).map((r) => [D(p, [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]), r]).sort((a, b) => a[0] - b[0])[0];
      if (!r || r[0] > 3.5 * k) continue; const j = joints.find((j) => j.p[0] >= r[1].x0 && j.p[0] <= r[1].x1 && j.p[1] >= r[1].y0 && j.p[1] <= r[1].y1);
      if (j) holes.push({ ...r[1], j }); } }
  const inHole = (p) => holes.find((h) => p[0] >= h.x0 - 0.01 && p[0] <= h.x1 + 0.01 && p[1] >= h.y0 - 0.01 && p[1] <= h.y1 + 0.01);
  const onHoleEdge = (pts) => holes.some((h) => pts.every((q) => (Math.abs(q[0] - h.x0) < 0.02 || Math.abs(q[0] - h.x1) < 0.02 || Math.abs(q[1] - h.y0) < 0.02 || Math.abs(q[1] - h.y1) < 0.02) && inHole(q)));
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
    // نقطة الوصلة ركن فى نص الخط (الفروع مرسومة خط واحد معدّى على الوصلة) ⇒ نقطّع عندها
    for (let i = 1; i < pts.length - 1; i++) if (joints.some((j) => D(pts[i], j.p) < (cfg.jointCore || cfg.jointR))) return [...splitAt(pts.slice(0, i + 1)), ...splitAt(pts.slice(i))];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      for (const h of holes) { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; if (!L) continue;
        const t = ((h.j.p[0] - a[0]) * dx + (h.j.p[1] - a[1]) * dy) / L; if (t <= 0.02 || t >= 0.98) continue;
        const q = [a[0] + t * dx, a[1] + t * dy]; if (!inHole(q) || D(q, h.j.p) < 0.01) continue;
        return [...splitAt([...pts.slice(0, i), q]), ...splitAt([q, ...pts.slice(i)])]; }
      for (const j of joints) {
        const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; if (!L) continue;
        const t = ((j.p[0] - a[0]) * dx + (j.p[1] - a[1]) * dy) / L; if (t <= 0.02 || t >= 0.98) continue;
        const q = [a[0] + t * dx, a[1] + t * dy]; if (D(q, j.p) > (cfg.jointCore || cfg.jointR)) continue;
        return [...splitAt([...pts.slice(0, i), q]), ...splitAt([q, ...pts.slice(i)])];
      }
    }
    return [pts];
  };
  const raw = pieces.splice(0).filter((p) => !onHoleEdge(p)); for (const p of raw) pieces.push(...splitAt(p));
  // ٢ب٢) خطين على استقامة واحدة راكبين على بعض (طرف واحد فى نص التانى) ⇒ نقطّع التانى عند الطرف ده عشان يتوصلوا
  { const cuts = pieces.map(() => []);
    const ep = []; pieces.forEach((pts, i) => { ep.push([i, pts[0], pts[1]]); ep.push([i, pts[pts.length - 1], pts[pts.length - 2]]); });
    for (const [i0, p, q] of ep) { const ux = p[0] - q[0], uy = p[1] - q[1], ul = Math.hypot(ux, uy); if (!ul) continue;
      pieces.forEach((pts, i) => { if (i === i0) return;
        for (let s = 1; s < pts.length; s++) { const a = pts[s - 1], b = pts[s]; const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; if (!L) continue;
          if (Math.min(a[0], b[0]) - cfg.tol > p[0] || Math.max(a[0], b[0]) + cfg.tol < p[0] || Math.min(a[1], b[1]) - cfg.tol > p[1] || Math.max(a[1], b[1]) + cfg.tol < p[1]) continue;
          const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L; if (t <= 0.02 || t >= 0.98) continue;
          const pr = [a[0] + t * dx, a[1] + t * dy]; if (D(pr, p) > cfg.tol) continue;
          if (Math.abs(ux * dy - uy * dx) / (ul * Math.sqrt(L)) > 0.09) continue;   // لازم يبقوا على استقامة واحدة (أقل من ٥°)
          cuts[i].push([s, t, pr]); } }); }
    const out = []; const same = (u, v) => (D(u[0], v[0]) < cfg.tol && D(u.at(-1), v.at(-1)) < cfg.tol) || (D(u[0], v.at(-1)) < cfg.tol && D(u.at(-1), v[0]) < cfg.tol);
    // الحتة الناتجة من القطع لو هى نفس خط مرسوم لوحده (نفس الطرفين) ⇒ مانكرّرهاش
    const push = (cur) => { if (cur.length === 2 && pieces.some((q, j) => q.length === 2 && !cuts[j].length && same(q, cur))) return; out.push(cur); };
    pieces.forEach((pts, i) => { if (!cuts[i].length) { out.push(pts); return; }
      const c = cuts[i].sort((x, y) => x[0] - y[0] || x[1] - y[1]); let cur = [pts[0]]; let s0 = 1;
      for (const [sg, , pr] of c) { while (s0 < sg) cur.push(pts[s0++]); cur.push(pr); push(cur); cur = [pr]; }
      while (s0 < pts.length) cur.push(pts[s0++]); push(cur); });
    pieces.splice(0, pieces.length, ...out.filter((pts) => pts.length >= 2)); }
  // ٢ج) علامات الوصل (A–A · B–B): نفس الحرف مكتوب مرتين = نفس الكابل متكمّل ⇒ كل ظهور عقدة مؤقتة، وبعدين بنوصّلهم
  const marks = []; const mt = cfg.markerR ? T.filter((t) => (cfg.markerText || cfg.cableText).test(t.layer) && /^[A-Z]$/.test(String(t.text).trim())) : [];
  // كل علامة = شَرطة عليها الحرف من الطرفين ⇒ الحرف مع أقرب توأمه (فى حدود markerSame) = علامة واحدة، والكابل واقف على الشَرطة
  const letters = mt.map((t) => ({ name: String(t.text).trim(), p: [t.startPoint.x, t.startPoint.y], h: t.textHeight || 0.2, used: false }));
  const lpairs = []; letters.forEach((x, i) => letters.forEach((y, j) => { if (j > i && x.name === y.name) lpairs.push([D(x.p, y.p), i, j]); }));
  lpairs.sort((u, v) => u[0] - v[0]);
  for (const [d, i, j] of lpairs) { if (letters[i].used || letters[j].used || d > cfg.markerSame) continue; letters[i].used = letters[j].used = true;
    const name = letters[i].name; const n = marks.filter((m) => m.name === name).length;
    // الحرف مكتوب فوق/جنب طرف الشَرطة ⇒ الشَرطة نفسها بين النقطتين بإزاحة نص ارتفاع الحرف
    const h = letters[i].h * 0.5; marks.push({ name, a: [letters[i].p[0] + h, letters[i].p[1] + h], b: [letters[j].p[0] + h, letters[j].p[1] + h], id: `M:${name}#${n + 1}` }); }
  for (const x of letters) if (!x.used) { const n = marks.filter((m) => m.name === x.name).length; marks.push({ name: x.name, a: x.p, b: x.p, id: `M:${x.name}#${n + 1}` }); }
  const markAt = (p) => { let best = null; for (const m of marks) { const d = segDist(p, m.a, m.b); if (d < cfg.markerR && (!best || d < best.d)) best = { id: m.id, d }; } return best && best.id; };
  // ٣) نقطة نهاية ⇒ عقدة (وصلة · بكس · كابينة) أو نقطة عادية
  const nodeAt = (p) => {
    let best = null;
    for (const j of joints) { const d = D(p, j.p); if (d < cfg.jointR && (!best || d < best.d)) best = { id: j.id, d }; }
    for (const b of boxes) { const d = D(p, b.p); if (d < cfg.boxR && (!best || d < best.d)) best = { id: b.id, d }; }
    if (!best) { const h = inHole(p); if (h) best = { id: h.j.id, d: 0 }; }
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
    const prev = piece[piece.length - 2] || piece[0], here = far.p; const dir = Math.atan2(here[1] - prev[1], here[0] - prev[0]);
    const sc = nx.map((o) => { const q = pieces[o.i]; const nxt = o.k === 0 ? q[1] : q[q.length - 2]; let ang = Math.abs(Math.atan2(nxt[1] - here[1], nxt[0] - here[0]) - dir); if (ang > Math.PI) ang = 2 * Math.PI - ang; return [ang, o]; })
      .sort((x, y) => x[0] - y[0]);
    // ركن خط مكمّل قريب من وصلة (مش على مركزها) ⇒ الكابل معدّى جنبها مش داخل فيها
    const offJoint = cfg.jointCore && n && /^J/.test(n) && nx.length && !holes.some((h) => h.j.id === n && inHole(here)) && D(here, joints.find((j) => j.id === n).p) > cfg.jointCore;
    if (n && n !== a && !(/^B/.test(n) && nx.length) && !offJoint) return { to: n, pts: P, used: [...visited, cur.i] };
    if (n === a && P.length > 2 && !offJoint) return null;
    if (!nx.length && cfg.gapR && !n) {
      // قفزة عند التقاطع: الرسام بيسيب فراغ صغير مكان ما الكابل بيعدّى على كابل تانى ⇒ نكمّل فى نفس الاتجاه لو فيه خط بعد الفراغ
      let best = null;
      for (const o of ends) { if (o.i === cur.i || visited.includes(o.i)) continue; const d = D(o.p, here); if (d > cfg.gapR || d < 1e-6) continue;
        const ang = Math.abs(Math.atan2(o.p[1] - here[1], o.p[0] - here[0]) - dir); const a1 = ang > Math.PI ? 2 * Math.PI - ang : ang; if (a1 > 0.08) continue;
        const q = pieces[o.i]; const nxt = o.k === 0 ? q[1] : q[q.length - 2]; let a2 = Math.abs(Math.atan2(nxt[1] - o.p[1], nxt[0] - o.p[0]) - dir); if (a2 > Math.PI) a2 = 2 * Math.PI - a2; if (a2 > 0.08) continue;
        if (!best || d < best.d) best = { o, d }; }
      if (best) return walk(best.o, a, [...visited, cur.i], P, depth + 1);
    }
    if (!nx.length) return null;
    const tries = nx.length === 1 ? sc : sc.filter((x) => x[0] <= Math.PI / 2 + 0.01);
    for (const [, o] of tries) { const r = walk(o, a, [...visited, cur.i], P, depth + 1); if (r) return r; }
    return null;
  };
  // نبدأ بالأطراف الأقرب لعقدتها (الطرف اللى على الوصلة نفسها قبل حتة قريبة منها)، وكل حتة خط تبع كابل واحد بس
  const nodeD = (p) => { const n = nodeAt(p); if (!n) return Infinity; const j = joints.find((x) => x.id === n) || boxes.find((x) => x.id === n); return j ? D(p, j.p) : 0; };
  const usedPiece = new Set();
  for (const st of cfg.onePiecePerCable ? ends.map((e) => [nodeD(e.p), e]).sort((x, y) => x[0] - y[0]).map((x) => x[1]) : ends) {
    const a = nodeAt(st.p);
    if (a && cfg.jointCore && /^J/.test(a) && linked(st).length && !holes.some((h) => h.j.id === a && inHole(st.p)) && D(st.p, joints.find((j) => j.id === a).p) > cfg.jointCore) continue;
    if (!a || seen.has(st.i + ':' + st.k) || (cfg.onePiecePerCable && usedPiece.has(st.i))) continue;
    const r = walk(st, a, [], [], 0);
    seen.add(st.i + ':' + st.k);
    if (r && !(cfg.onePiecePerCable && r.used.some((i) => usedPiece.has(i)))) { r.used.forEach((i) => { seen.add(i + ':0'); seen.add(i + ':1'); usedPiece.add(i); }); paths.push({ from: a, to: r.to, pts: r.pts }); }
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
      const h4 = (t.textHeight || 0.2) * 0.4; const q = (f) => [t.startPoint.x + Math.cos(r) * w * f - Math.sin(r) * h4, t.startPoint.y + Math.sin(r) * w * f + Math.cos(r) * h4];
      return { s, p: q(0.5), line: [0, 0.25, 0.5, 0.75, 1].map(q) }; });
  // المسافة من أقرب نقطة فى النص للخط (مش من نصّه بس) — النصوص الطويلة نصّها بيبقى بعيد عن الخط
  const labDist = (l, pts) => (cfg.labelByExtent ? Math.min(...l.line.map((q) => polyDist(q, pts))) : polyDist(l.p, pts));
  const cand = []; paths.forEach((p, i) => lab.forEach((l, j) => cand.push([labDist(l, p.pts), i, j])));
  const pu = new Set(), lu = new Set(); const segs = []; let order;
  if (cfg.labelMatching) {
    // توزيع أمثل: أكبر عدد كابلات ياخد نص، وبأقل مجموع مسافات (نص جنب كابلين بيروح للى مالوش غيره)
    // + الكابل اللى آخره بكس مايخدش نص أزواجه أكتر من ٢٠ إلا لو مفيش غيره، واللى معدّى على علامة وصل ياخد بعد العادى
    const pairsOf = (s) => Number((s.match(/^\d+(?:\.\d+)?\/(\d+)/) || [])[1] || 0);
    const E = cand.filter(([d]) => d <= cfg.labelR).map(([d, i, j]) => [i, j, d + (paths[i].marker ? cfg.labelR : 0)
      + ((/^B/.test(paths[i].from) || /^B/.test(paths[i].to)) && pairsOf(lab[j].s) > 20 ? cfg.labelR * 3 : 0)]);
    order = bestMatch(paths.length, lab.length, E).map(([i, j]) => [cand.find((x) => x[1] === i && x[2] === j)[0], i, j]);
  } else {
    // الكابلات العادية تاخد نصها الأول، وبعدين اللى معدّية على علامة وصل (مسارها طويل وممكن «يخطف» نص كابل جنبه)
    cand.sort((a, b) => (paths[a[1]].marker ? 1 : 0) - (paths[b[1]].marker ? 1 : 0) || a[0] - b[0]); order = cand; }
  for (const [d, i, j] of order) { if (pu.has(i) || lu.has(j) || d > cfg.labelR) continue; pu.add(i); lu.add(j);
    const m = lab[j].s.match(/^(\d+(?:\.\d+)?)\/(\d+)"?\*?\/(\d?\.\d+)(?:\((\d+)"?\*?d\))?/i);
    const p = paths[i]; const [from, to] = p.from === 'CAB' || (/^J/.test(p.from) && /^B/.test(p.to)) ? [p.from, p.to] : /^B/.test(p.from) ? [p.to, p.from] : [p.from, p.to];
    segs.push({ from, to, ...(p.marker ? { marker: p.marker } : {}), lengthM: m ? Number(m[1]) : null, pairs: m ? Number(m[2]) : null, gaugeMm: m ? Number(m[3]) : null, ...(m && m[4] ? { dead: Number(m[4]) } : {}), label: lab[j].s, d });
  }
  // ٥ب) خط متوصّل بين عقدتين ومفيش جنبه نص (الرسام ماكتبش الطول) ⇒ يتسجّل وصلة من غير طول عشان الشبكة تفضل متوصّلة،
  //     والطول يتكتب بإيد مرة واحدة من شاشة الخرائط. إلا لو العقدتين متوصّلين بكابل مكتوب، أو البكس واخد كابله
  if (cfg.keepUnlabeled) { const has = (a, b) => segs.some((g) => (g.from === a && g.to === b) || (g.from === b && g.to === a));
    paths.forEach((p, i) => { if (pu.has(i) || p.from === p.to || has(p.from, p.to)) return;
      if ([p.from, p.to].some((n) => /^B/.test(n) && segs.some((g) => g.from === n || g.to === n))) return;
      const [from, to] = p.from === 'CAB' || (/^J/.test(p.from) && /^B/.test(p.to)) ? [p.from, p.to] : /^B/.test(p.from) ? [p.to, p.from] : [p.from, p.to];
      segs.push({ from, to, ...(p.marker ? { marker: p.marker } : {}), lengthM: null, pairs: null, gaugeMm: null, nolabel: true, label: '', d: null }); }); }
  // ٦) الاتجاه: من ناحية الكابينة لبرّه (distancesFromCabinet بيمشى from → to) — بـBFS من الكابينة على الكابلات اللى اتلقت
  const adj = {}; segs.forEach((s, i) => { (adj[s.from] ||= []).push(i); (adj[s.to] ||= []).push(i); });
  const seenN = new Set(['CAB']), q = ['CAB'], fixed = new Set();
  while (q.length) { const n = q.shift(); for (const i of adj[n] || []) { if (fixed.has(i)) continue; const s = segs[i]; if (s.to === n) { s.to = s.from; s.from = n; } fixed.add(i); if (!seenN.has(s.to)) { seenN.add(s.to); q.push(s.to); } } }
  const reached = new Set(seenN);
  const unl = paths.filter((_, i) => !pu.has(i)).map((p) => p.from + '-' + p.to);
  return { paths, joints, boxes, cab, segs, reached, unlabeledPaths: unl, unusedLabels: lab.filter((_, j) => !lu.has(j)).map((l) => l.s), boxLabels: labels.length, syms: syms.length };
}
const GHANAYEM = { boxLayer: /P_DP_TXT/, jointText: /P-DBUR-TXT/, cableText: /P-DBUR-TXT/, cabText: /P_CAB_TXT/, cableLayer: /^P-DBUR-CBL$/, extraCableLines: /^P-J-TXT$/,   // ساعات الكابل مرسوم على طبقة الأزواج بالغلط (6.7: وصلة 05 ← بكس 10)
 
  isJointDot: (e) => e.layer === 'P_SYM' && e.type === 'LWPOLYLINE' && (e.constantWidth || 0) > 0.05 && (e.constantWidth || 0) < 0.2 && (e.vertices || []).length === 2,
  isBoxSym: (e) => e.layer === 'P_SYM' && ((e.type === 'LWPOLYLINE' && (e.constantWidth || 0) > 0.2) || e.type === 'CIRCLE'),
  jointTextR: 1.0, boxSymR: 3.2, markerR: 0.4, gapR: 1.0, labelMatching: true, keepUnlabeled: true, markerSame: 3.6, jointR: 0.2, boxR: 0.45, cabPad: 0.6, tol: 0.03, labelR: 0.8 };
// دير الجنادلة (R.C.C): كابلات على CA وكمان خطوط على طبقة 0 · الوصلات GONTA + TEXT-JONTA · البكس BOX + TEXT-BOX · النص TEXT-LONG
const DERGNDLA = { boxLayer: /^TEXT-BOX$/, jointText: /^TEXT-JONTA$/, cableText: /^TEXT-LONG$/, cabText: /^TEXT-CABINA$/, cableLayer: /^CA$/, extraCableLines: /^0$/,
  isJointDot: (e) => e.layer === 'GONTA' && e.type === 'LWPOLYLINE',
  isBoxSym: (e) => e.layer === 'BOX' && (e.type === 'LWPOLYLINE' || (e.type === 'LINE' && Math.hypot(e.endPoint.x - e.startPoint.x, e.endPoint.y - e.startPoint.y) < 6)),   // ساعات رمز البكس شَرطة LINE
  jointTextR: 1.7, boxSymR: 4.2, jointR: 1.3, boxR: 0.45, cabPad: 0.6, tol: 0.08, labelR: 0.8, markerR: 1.15, markerSame: 16, markerText: /^TEXT-JONTA$/,
  onePiecePerCable: true, labelByExtent: true, labelMatching: true, jointCore: 0.4, manholes: true, keepUnlabeled: true, gapR: 0.6 };   // الوصلة هنا دايرة كبيرة (jointR واسع) ⇒ ممكن حتة جنبها تتحسب بداية كابل تانى
module.exports = { extractNetwork, GHANAYEM, DERGNDLA };
