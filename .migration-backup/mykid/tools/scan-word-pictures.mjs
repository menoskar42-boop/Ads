// «صورة واحدة لكل كلمة» (خطة ١٣): بيطلّع الكلمات اللى ليها أكتر من صورة فى ملفات البيانات — node mykid/tools/scan-word-pictures.mjs
import fs from "node:fs";
const dir = new URL("../js/data/", import.meta.url).pathname;
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
const TASH = /[ً-ٰٟ]/g;
const norm = (w) => String(w).replace(TASH, "").trim().toLowerCase();
const map = new Map(); // word -> Map(visual -> Set(files))
const add = (word, vis, file) => {
  if (!word || !vis || vis === "❓") return;
  const k = norm(word);
  if (!k || k.length > 24) return;
  if (!map.has(k)) map.set(k, new Map());
  const m = map.get(k);
  if (!m.has(vis)) m.set(vis, new Set());
  m.get(vis).add(file);
};
const seen = new WeakSet();
function walk(o, file, depth = 0) {
  if (!o || typeof o !== "object" || seen.has(o) || depth > 8) return;
  seen.add(o);
  if (!Array.isArray(o)) {
    const vis = o.img || o.image || o.e || o.emoji;
    if (typeof vis === "string") for (const f of ["w", "word", "en", "ar", "name"]) if (typeof o[f] === "string") add(o[f], vis, file);
  }
  for (const v of Object.values(o)) walk(v, file, depth + 1);
}
for (const f of files) {
  let m; try { m = await import(dir + f); } catch (e) { console.error("skip", f, e.message); continue; }
  for (const v of Object.values(m)) walk(v, f);
  // خرايط كلمة ← إيموجى (EB_WORDS وغيرها)
  for (const [name, v] of Object.entries(m)) if (v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "string") && Object.keys(v).length > 5) for (const [w, e] of Object.entries(v)) if (/\p{Extended_Pictographic}/u.test(e)) add(w, e, f + ":" + name);
}
// صور الكتاب (book/en/<w>.webp)
const { BOOK_IMG_EN } = await import(dir + "bookPics.js");
for (const w of BOOK_IMG_EN) add(w, `book/en/${w}.webp`, "bookPics.js");
const multi = [...map].filter(([, m]) => m.size > 1).sort((a, b) => a[0].localeCompare(b[0], "ar"));
console.log(JSON.stringify(multi.map(([w, m]) => [w, [...m].map(([v, fs]) => [v, [...fs]])])));
