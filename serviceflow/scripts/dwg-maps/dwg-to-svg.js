// DWG json (libredwg-web) → SVG, with blocks (INSERT), SOLID, HATCH (solid), POLYLINE2D. Arabic shx (arab/majed) = Arabic keyboard layout.
const { decodeAr } = require('./arabic-shx.js');
const ACI = { 1:'#d00000',2:'#a08a00',3:'#008a00',4:'#008a8a',5:'#0030d0',6:'#a000a0',7:'#000',8:'#555',9:'#888',10:'#d00000',30:'#c05000',40:'#c07000',140:'#0070a0',150:'#0040a0',250:'#333',251:'#444',252:'#666',253:'#888' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mul = (A, B) => [A[0]*B[0]+A[2]*B[1], A[1]*B[0]+A[3]*B[1], A[0]*B[2]+A[2]*B[3], A[1]*B[2]+A[3]*B[3], A[0]*B[4]+A[2]*B[5]+A[4], A[1]*B[4]+A[3]*B[5]+A[5]];
const ap = (M, x, y) => [M[0]*x + M[2]*y + M[4], M[1]*x + M[3]*y + M[5]];
const I = [1,0,0,1,0,0];
function toSvg(db, opts = {}) {
  const fonts = {}; (db.tables?.STYLE?.entries || []).forEach((s) => (fonts[s.name] = String(s.font || '').toLowerCase()));
  const layers = {}; (db.tables?.LAYER?.entries || []).forEach((l) => (layers[l.name] = l));
  const blocks = {}; (db.tables?.BLOCK_RECORD?.entries || []).forEach((b) => (blocks[b.name] = b));
  const prim = []; // {k:'p', pts, closed, fill, c, w} | {k:'t', ...}
  const colorOf = (e, inh) => {
    const L = layers[e.layer]; if (L && (L.off || L.frozen || L.colorIndex < 0)) return null;
    let c = e.colorIndex; if (c === 0) c = inh ?? 7; if (c === 256 || c == null) c = L ? L.colorIndex : 7;
    return ACI[Math.abs(c)] || '#000';
  };
  const arcPts = (cx, cy, r, a0, a1) => { if (a1 < a0) a1 += 2*Math.PI; const n = Math.max(8, Math.ceil((a1-a0)/(Math.PI/24))); const p=[]; for (let i=0;i<=n;i++){const a=a0+(a1-a0)*i/n;p.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]);} return p; };
  const walk = (ents, M, depth, inhColor) => {
    if (depth > 6) return;
    for (const e of ents || []) {
      if (e.isVisible === false) continue;
      const c = colorOf(e, inhColor); if (!c) continue;
      const T = (pts) => pts.map(([x, y]) => ap(M, x, y));
      if (e.type === 'LINE') prim.push({ k:'p', pts: T([[e.startPoint.x,e.startPoint.y],[e.endPoint.x,e.endPoint.y]]), c });
      else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE2D') {
        const v = e.vertices || []; if (v.length < 2) continue; const closed = (e.flag & 1) === 1; const pts = [];
        for (let i = 0; i < v.length; i++) { const a = v[i], b = v[(i+1) % v.length]; pts.push([a.x,a.y]);
          if (a.bulge && (i < v.length-1 || closed)) { const th = 4*Math.atan(a.bulge), ch = Math.hypot(b.x-a.x,b.y-a.y); if (ch>0){ const r = ch/(2*Math.sin(Math.abs(th)/2)); const mx=(a.x+b.x)/2,my=(a.y+b.y)/2; const d=r*Math.cos(Math.abs(th)/2); const nx=-(b.y-a.y)/ch, ny=(b.x-a.x)/ch; const s=a.bulge>0?1:-1; const cx=mx+s*nx*d, cy=my+s*ny*d; let a0=Math.atan2(a.y-cy,a.x-cx), a1=Math.atan2(b.y-cy,b.x-cx); const seg=arcPts(cx,cy,r, s>0?a0:a1, s>0?a1:a0); if(s<0) seg.reverse(); pts.push(...seg.slice(1,-1)); } } }
        prim.push({ k:'p', pts: T(pts), closed, c, w: e.constantWidth ? e.constantWidth * Math.hypot(M[0],M[1]) : 0 });
      } else if (e.type === 'CIRCLE') prim.push({ k:'p', pts: T(arcPts(e.center.x,e.center.y,e.radius,0,2*Math.PI)), closed:true, c });
      else if (e.type === 'ARC') prim.push({ k:'p', pts: T(arcPts(e.center.x,e.center.y,e.radius,e.startAngle,e.endAngle)), c });
      else if (e.type === 'SOLID') { const q=[e.corner1,e.corner2,e.corner4||e.corner3,e.corner3].filter(Boolean).map(p=>[p.x,p.y]); prim.push({ k:'p', pts:T(q), closed:true, fill:true, c }); }
      else if (e.type === 'HATCH') { if (!e.solidFill) continue; for (const bp of e.boundaryPaths || []) { const v = bp.vertices || []; if (v.length > 2) prim.push({ k:'p', pts:T(v.map(p=>[p.x,p.y])), closed:true, fill:true, c }); } }
      else if (e.type === 'TEXT' || e.type === 'MTEXT' || e.type === 'ATTRIB') {
        const font = fonts[e.styleName] || ''; const ar = /arab|majed|ara/.test(font);
        let s = String(e.text ?? '').replace(/\\P/g,' ').replace(/\\[A-Za-z][^;]*;/g,'').replace(/[{}]/g,'');
        s = ar ? decodeAr(s) : s.replace(/%%[cC]/g,'Ø').replace(/%%[dD]/g,'°').replace(/%%[pP]/g,'±').replace(/%%[uUoO]/g,'');
        if (!s.trim()) continue;
        const useEnd = (e.halign || e.valign) && e.endPoint && (e.endPoint.x || e.endPoint.y);
        const P0 = useEnd ? e.endPoint : (e.startPoint || e.insertionPoint); if (!P0) continue;
        const [x, y] = ap(M, P0.x, P0.y); const sc = Math.hypot(M[0], M[1]);
        const rot = (e.rotation || 0) + Math.atan2(M[1], M[0]);
        prim.push({ k:'t', x, y, s, h: (e.textHeight || 0.2) * sc, xs: e.xScale || 1, rot, ar, c, anchor: e.halign===1||e.halign===4?'middle':e.halign===2?'end':'start', vb: e.valign===2||e.halign===4?'middle':e.valign===3?'hanging':'auto' });
      } else if (e.type === 'INSERT') {
        const b = blocks[e.name]; if (!b || !b.entities || !b.entities.length) continue;
        const r = e.rotation || 0, base = b.basePoint || { x:0, y:0 };
        const L = mul(mul([1,0,0,1,e.insertionPoint.x,e.insertionPoint.y],[Math.cos(r),Math.sin(r),-Math.sin(r),Math.cos(r),0,0]), mul([e.xScale||1,0,0,e.yScale||1,0,0],[1,0,0,1,-base.x,-base.y]));
        walk(b.entities, mul(M, L), depth+1, e.colorIndex === 256 ? undefined : e.colorIndex);
        for (const a of e.attribs || []) walk([a], M, depth+1);
      }
    }
  };
  walk(db.entities, I, 0);
  // extents: robust (ignore far stray objects)
  const xs = [], ys = [];
  for (const p of prim) { if (p.k==='p') p.pts.forEach(([x,y])=>{xs.push(x);ys.push(y);}); else { xs.push(p.x); ys.push(p.y); } }
  xs.sort((a,b)=>a-b); ys.sort((a,b)=>a-b);
  const q = (arr, f) => arr[Math.min(arr.length-1, Math.max(0, Math.floor(f*(arr.length-1))))];
  let x0=q(xs,0.002), x1=q(xs,0.998), y0=q(ys,0.002), y1=q(ys,0.998);
  const mx=(x1-x0)*0.04, my=(y1-y0)*0.04; x0-=mx; x1+=mx; y0-=my; y1+=my;
  let minX=Math.max(xs[0],x0), maxX=Math.min(xs[xs.length-1],x1), minY=Math.max(ys[0],y0), maxY=Math.min(ys[ys.length-1],y1);
  const E0 = db.header?.EXTMIN, E1 = db.header?.EXTMAX;
  if (E0 && E1 && E1.x > E0.x && E1.y > E0.y && Math.abs(E0.x) < 1e15) { const p = Math.max(E1.x-E0.x, E1.y-E0.y) * 0.01; minX = E0.x-p; maxX = E1.x+p; minY = E0.y-p; maxY = E1.y+p; }
  const W = maxX-minX, H = maxY-minY;
  const th = prim.filter(p=>p.k==='t').map(p=>p.h).sort((a,b)=>a-b);
  const medH = th.length ? th[Math.floor(th.length*0.3)] : W/400;
  let px = (opts.textPx || 13) / medH; const maxSide = opts.maxSide || 9000; px = Math.min(px, maxSide / Math.max(W, H)); px = Math.max(px, (opts.minSide||2400) / Math.max(W,H));
  const sw = 1.1 / px;
  const lines = [], fills = [], texts = [];
  for (const p of prim) {
    if (p.k === 'p') { const d = 'M' + p.pts.map(([x,y]) => `${+x.toFixed(4)} ${+(-y).toFixed(4)}`).join('L') + (p.closed ? 'Z' : '');
      if (p.fill) fills.push(`<path d="${d}" fill="${p.c}"/>`); else lines.push(`<path d="${d}" stroke="${p.c}"${p.w > sw ? ` stroke-width="${p.w}"` : ''}/>`); }
    else texts.push(`<text transform="translate(${p.x} ${-p.y}) rotate(${-p.rot*180/Math.PI}) scale(${p.xs} 1)" font-size="${p.h*(p.ar?1.25:1.15)}" fill="${p.c}" text-anchor="${p.anchor}" dominant-baseline="${p.vb}"${p.ar?' direction="rtl" unicode-bidi="plaintext"':''}>${esc(p.s)}</text>`);
  }
  const w = Math.round(W*px), h = Math.round(H*px);
  return { w, h, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${minX} ${-maxY} ${W} ${H}"><rect x="${minX}" y="${-maxY}" width="${W}" height="${H}" fill="#fff"/><g>${fills.join('')}</g><g fill="none" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${lines.join('')}</g><g font-family="DejaVu Sans, sans-serif">${texts.join('')}</g></svg>` };
}
module.exports = { toSvg };
