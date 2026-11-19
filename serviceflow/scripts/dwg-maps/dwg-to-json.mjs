import { Dwg_File_Type, LibreDwg } from '@mlightcad/libredwg-web';
import fs from 'fs'; import path from 'path';
const lib = await LibreDwg.create('./node_modules/@mlightcad/libredwg-web/wasm/');
const dir = process.argv[2], out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
const tot = {};
for (const f of fs.readdirSync(dir).filter(f => /\.dwg$/i.test(f)).sort()) {
  try {
    const dwg = lib.dwg_read_data(new Uint8Array(fs.readFileSync(path.join(dir, f))).buffer, Dwg_File_Type.DWG);
    const db = lib.convert(dwg); lib.dwg_free(dwg);
    const types = {}; for (const e of db.entities) { types[e.type] = (types[e.type] || 0) + 1; tot[e.type] = (tot[e.type] || 0) + 1; }
    fs.writeFileSync(path.join(out, f.replace(/\.dwg$/i, '.json').toLowerCase()), JSON.stringify(db, (k, v) => typeof v === 'bigint' ? Number(v) : v));
    console.log(f, db.entities.length, JSON.stringify(types));
  } catch (e) { console.log(f, 'ERR', e.message); }
}
console.log(JSON.stringify(tot));
