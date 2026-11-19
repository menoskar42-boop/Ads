// صناديق البكسيات من نص الخريطة: [رقم البلوك فوق | فرعات الخرج تحت] + رقم البكس على اليمين
function extractBoxes(db, layerRe) {
  const T = db.entities.filter((e) => e.type === 'TEXT' && layerRe.test(e.layer)).map((e) => ({ s: String(e.text).trim(), x: e.startPoint.x, y: e.startPoint.y, h: e.textHeight || 0 }));
  const ranges = T.filter((t) => /^\d{1,3}-\d{1,3}$/.test(t.s));
  const nums = T.filter((t) => /^\d{1,3}'?$/.test(t.s));
  const used = new Set(); const out = [];
  const H = ranges.length ? ranges.map((r) => r.h).sort((a, b) => a - b)[Math.floor(ranges.length / 2)] : 0.2;
  for (const r of ranges) {
    const near = nums.filter((n) => !used.has(n) && Math.abs(n.y - r.y) < H * 4 && n.x > r.x - H * 3 && n.x < r.x + H * 12);
    // البلوك: فوق الفرعات (y أعلى) وقريب فى x · البكس: يمين الفرعات
    const block = near.filter((n) => n.y > r.y + H * 0.5 && Math.abs(n.x - r.x) < H * 4).sort((a, b) => Math.hypot(a.x - r.x, a.y - r.y) - Math.hypot(b.x - r.x, b.y - r.y))[0];
    const box = near.filter((n) => n !== block && n.x > r.x + H * 2.5).sort((a, b) => Math.hypot(a.x - r.x, a.y - r.y) - Math.hypot(b.x - r.x, b.y - r.y))[0];
    if (!block || !box) continue;
    used.add(block); used.add(box);
    out.push({ box: box.s.replace(/^0+(?=\d)/, ''), block: block.s, pairs: r.s, x: box.x, y: box.y });
  }
  return out;
}
module.exports = { extractBoxes };
