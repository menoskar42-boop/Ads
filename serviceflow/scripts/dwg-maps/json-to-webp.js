// json (libredwg-web) → SVG → PNG (Chromium) → WebP. usage: node towebp.js <json> <out.webp> [quality]
const { chromium } = require('playwright'); const fs = require('fs'); const { toSvg } = require('./dwg-to-svg.js');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage();
  const args = process.argv.slice(2);
  for (let i = 0; i + 1 < args.length; i += 2) {
    const db = JSON.parse(fs.readFileSync(args[i], 'utf8'));
    const { svg, w, h } = toSvg(db, {});
    const W = Math.min(w, 16000), H = Math.min(h, 16000);
    await pg.setViewportSize({ width: W, height: H });
    await pg.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    const png = await pg.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
    await pg.setContent('<img id=i src="data:image/png;base64,' + png.toString('base64') + '">');
    await pg.waitForFunction(() => document.getElementById('i').complete);
    const d = await pg.evaluate(() => { const i = document.getElementById('i'); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0); return c.toDataURL('image/webp', 0.6); });
    const buf = Buffer.from(d.split(',')[1], 'base64'); fs.writeFileSync(args[i + 1], buf);
    console.log(args[i + 1].split('/').pop(), W + 'x' + H, buf.length);
  }
  await b.close();
})();
