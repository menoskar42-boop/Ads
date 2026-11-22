// ===== تفريغ مخزون أصوات النطق (TTS cache) =====
// يحذف كل ملفات .mp3 المخزَّنة، لإعادة توليدها بصوت ميزو الجديد (العامية المصرية).
// التشغيل:  node server/clear-tts.js     ثم بعده:  node server/warm-tts.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = process.env.TTS_CACHE_DIR || path.join(__dirname, ".tts-cache");

let n = 0;
try {
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith(".mp3") || f.endsWith(".mp3.tmp")) {
      fs.unlinkSync(path.join(dir, f));
      n++;
    }
  }
} catch (_e) {}

console.log(`🧹 حُذف ${n} ملف صوت من: ${dir}`);
console.log("الآن شغّل:  npm run warm-tts   لإعادة تسجيل كل العبارات بصوت ميزو الجديد.");
