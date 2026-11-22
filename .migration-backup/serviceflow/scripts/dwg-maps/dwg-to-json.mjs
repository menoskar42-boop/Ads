import { Dwg_File_Type, LibreDwg } from '@mlightcad/libredwg-web';
import fs from 'fs'; import path from 'path';
const lib = await LibreDwg.create('./node_modules/@mlightcad/libredwg-web/wasm/');
const dir = process.argv[2], out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
const tot = {};
for (const f of fs.readdirSync(dir).filter(f => /\.dwg$/i.test(f)).sort()) {
  try {
    const dwg = lib.dwg_read_data(new Uint8Array(fs.readFileSync(path.join(dir, f))).buffer, Dwg_File_Type.DWG);
    const db = lib.convert(dwg);
    // ٢٠٢٦-١١-١٩: libredwg-web بيسيب نوع الخط ولون الطبقة فاضيين (lineType: "" · colorIndex 256) — والخط المتقطّع
    // فى الكابلات ليه معنى (اتلقى بمقارنة صورة 6.7 الورق بالملف) ⇒ بنقراهم من الملف نفسه.
    const lay = {};
    for (let i = 0, n = lib.dwg_get_num_objects(dwg); i < n; i++) {
      const o = lib.dwg_get_object(dwg, i); if (lib.dwg_object_get_fixedtype(o) !== 51) continue;
      const tio = lib.dwg_object_to_object_tio(o);
      const name = lib.dwg_dynapi_entity_value(tio, 'name').data; const color = lib.dwg_dynapi_entity_value(tio, 'color').data;
      let lt = ''; try { lt = lib.dwg_dynapi_entity_value(lib.dwg_object_to_object_tio(lib.dwg_ref_get_object(lib.dwg_dynapi_entity_value(tio, 'ltype').data)), 'name').data; } catch (e) {}
      lay[name] = { lt, color: color && typeof color.index === 'number' ? color.index : null };
    }
    for (const L of db.tables?.LAYER?.entries || []) { const x = lay[L.name]; if (!x) continue; if (x.lt) L.lineType = x.lt; if (x.color != null) L.colorIndex = x.color; }
    lib.dwg_free(dwg);
    const types = {}; for (const e of db.entities) { types[e.type] = (types[e.type] || 0) + 1; tot[e.type] = (tot[e.type] || 0) + 1; }
    fs.writeFileSync(path.join(out, f.replace(/\.dwg$/i, '.json').toLowerCase()), JSON.stringify(db, (k, v) => typeof v === 'bigint' ? Number(v) : v));
    console.log(f, db.entities.length, JSON.stringify(types));
  } catch (e) { console.log(f, 'ERR', e.message); }
}
console.log(JSON.stringify(tot));
