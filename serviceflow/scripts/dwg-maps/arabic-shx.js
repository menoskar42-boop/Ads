// DWG (json from libredwg-web) → SVG. Arabic in arab.shx is typed on the Arabic keyboard layout; uppercase = final form.
const fs = require('fs');
const KB = { q:'ض',w:'ص',e:'ث',r:'ق',t:'ف',y:'غ',u:'ع',i:'ه',o:'خ',p:'ح','[':'ج',']':'د',a:'ش',s:'س',d:'ي',f:'ب',g:'ل',h:'ا',j:'ت',k:'ن',l:'م',';':'ك',"'":'ط',z:'ئ',x:'ء',c:'ؤ',v:'ر',b:'لا',n:'ى',m:'ة',',':'و','.':'ز','/':'ظ',
  H:'ا',L:'م',R:'ق',J:'ت',G:'ل',D:'ى',U:'ع',S:'س',K:'ن',P:'ح',T:'ف',F:'ب',M:'ه',':':'ك','~':'م','>':'ز',Y:'غ',W:'ص',Q:'ض',E:'ث',I:'ه',O:'خ',A:'ش',V:'ر',N:'ى',C:'ؤ',Z:'ئ',X:'ء',B:'لا','{':'ج','}':'د','"':'ط','<':'و','?':'ظ' };
const decodeAr = (s) => s.replace(/H@/g, 'أ').replace(/@/g, 'أ').split('').map((c) => KB[c] ?? c).join('').replace(/\s+/g, ' ').trim();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ACI = { 1:'#d00000',2:'#b8a000',3:'#008a00',4:'#008a8a',5:'#0030d0',6:'#a000a0',7:'#000',8:'#666',9:'#999',10:'#d00000' };
function toSvg(db, opts = {}) {
  const fonts = {}; (db.tables?.STYLE?.entries || []).forEach((s) => (fonts[s.name] = String(s.font || '').toLowerCase()));
  const layerColor = {}; (db.tables?.LAYER?.entries || []).forEach((l) => (layerColor[l.name] = l.colorIndex));
  const col = (e) => { let c = e.colorIndex; if (c === 256 || c == null) c = layerColor[e.layer]; return ACI[Math.abs(c)] || '#000'; };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const ext = (x, y) => { if (!isFinite(x) || !isFinite(y)) return; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); };
  const out = [];
  const texts = [];
  for (const e of db.entities) {
    if (e.isVisible === false) continue;
    const c = col(e);
    if (e.type === 'LINE') { ext(e.startPoint.x, e.startPoint.y); ext(e.endPoint.x, e.endPoint.y);
      out.push(`<line x1="${e.startPoint.x}" y1="${-e.startPoint.y}" x2="${e.endPoint.x}" y2="${-e.endPoint.y}" stroke="${c}"/>`); }
    else if (e.type === 'LWPOLYLINE') {
      const v = e.vertices || []; if (!v.length) continue; v.forEach((p) => ext(p.x, p.y));
      let d = `M${v[0].x} ${-v[0].y}`;
      const n = v.length, closed = (e.flag & 1) === 1;
      for (let i = 1; i < n + (closed ? 1 : 0); i++) {
        const a = v[i - 1], b = v[i % n];
        if (a.bulge) { const ch = Math.hypot(b.x - a.x, b.y - a.y), r = Math.abs(ch * (1 + a.bulge * a.bulge) / (4 * a.bulge));
          d += ` A${r} ${r} 0 ${Math.abs(a.bulge) > 1 ? 1 : 0} ${a.bulge > 0 ? 0 : 1} ${b.x} ${-b.y}`; }
        else d += ` L${b.x} ${-b.y}`;
      }
      if (closed) d += 'Z';
      const w = e.constantWidth || 0;
      out.push(`<path d="${d}" fill="none" stroke="${c}"${w ? ` stroke-width="${w}"` : ''}/>`);
    } else if (e.type === 'CIRCLE') { ext(e.center.x - e.radius, e.center.y - e.radius); ext(e.center.x + e.radius, e.center.y + e.radius);
      out.push(`<circle cx="${e.center.x}" cy="${-e.center.y}" r="${e.radius}" fill="none" stroke="${c}"/>`); }
    else if (e.type === 'ARC') {
      const { x, y } = e.center, r = e.radius; let a0 = e.startAngle, a1 = e.endAngle; if (a1 < a0) a1 += 2 * Math.PI;
      const p0 = [x + r * Math.cos(a0), y + r * Math.sin(a0)], p1 = [x + r * Math.cos(a1), y + r * Math.sin(a1)];
      ext(x - r, y - r); ext(x + r, y + r);
      out.push(`<path d="M${p0[0]} ${-p0[1]} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 0 ${p1[0]} ${-p1[1]}" fill="none" stroke="${c}"/>`);
    } else if (e.type === 'TEXT') {
      const ar = /arab|ara/.test(fonts[e.styleName] || '');
      const s = ar ? decodeAr(e.text) : String(e.text || '').replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%[uUoO]/g, '');
      if (!s.trim()) continue;
      const h = e.textHeight || 0.2, xs = e.xScale || 1, rot = (e.rotation || 0) * 180 / Math.PI;
      const P = (e.halign || e.valign) && e.endPoint && (e.endPoint.x || e.endPoint.y) ? e.endPoint : e.startPoint;
      ext(P.x, P.y); ext(P.x + s.length * h * 0.7 * xs, P.y + h);
      // halign: 0 left, 1 center, 2 right, 4 middle
      const anchor = e.halign === 1 || e.halign === 4 ? 'middle' : e.halign === 2 ? 'end' : 'start';
      const vb = e.valign === 2 || e.halign === 4 ? 'middle' : e.valign === 3 ? 'hanging' : 'auto';
      texts.push(`<text transform="translate(${P.x} ${-P.y}) rotate(${-rot}) scale(${xs} 1)" font-size="${h * (ar ? 1.25 : 1.15)}" fill="${c}" text-anchor="${anchor}" dominant-baseline="${vb}"${ar ? ' direction="rtl" unicode-bidi="plaintext"' : ''}>${esc(s)}</text>`);
    }
  }
  const pad = 1; minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const W = maxX - minX, H = maxY - minY, px = opts.pxPerUnit || 60;
  return { w: Math.round(W * px), h: Math.round(H * px), svg:
`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W * px)}" height="${Math.round(H * px)}" viewBox="${minX} ${-maxY} ${W} ${H}">
<rect x="${minX}" y="${-maxY}" width="${W}" height="${H}" fill="#fff"/>
<g stroke-width="0.03" stroke-linecap="round" vector-effect="none">${out.join('')}</g>
<g font-family="DejaVu Sans, sans-serif">${texts.join('')}</g></svg>` };
}
module.exports = { toSvg, decodeAr };
