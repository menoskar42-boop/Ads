// سكربتات Tampermonkey بتتحدّث لوحدها (المالك ٢٠٢٦-١١-١٠: «عاوز الاسكريبتات بتاعه سيرفس فلو تتحدث كده زى الموقع ده… من الاعدادات»).
//
// السيرفر بيقدّم كل سكربت من ملفه فى serviceflow/ (نفس النسخة اللى فى المشروع)، وبيحط فى أوله @updateURL و@downloadURL
// بلينك فيه مفتاح سرّى. لما تسطّب السكربت من «رفع الملفات ← السكربتات» مرة واحدة، Tampermonkey بعد كده بيشيّك لوحده
// (كل يوم، أو «Check for updates») ولو @version زاد بيحدّث من غير نسخ ولزق.
// المفتاح فى اللينك عشان Tampermonkey مابيبعتش كوكى الدخول، ولو اتسرّب بيتغيّر من نفس الشاشة.
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

/** سكربتات اتدمجت فى غيرها: بتظهر «قديم، احذفه» ومابتتسطّبش. */
export const DEPRECATED: Record<string, string> = {
  "fcc-subscriber-info.user.js": "اتدمج فى TE FCC + WFM + OSS + SubInfo (All-in-One). احذفه من Tampermonkey.",
};

/** وظيفة كل سكربت فى سطر (للشاشة). */
export const PURPOSE: Record<string, string> = {
  "sf-bridge.user.js": "الجسر: قياس «بدون Real» من الطابور",
  "dzs-expresse-v10.user.js": "DZS: القياس وشيت 138",
  "dzs-profile-optimization.user.js": "AXON: رفع السرعة وإيقاف PO",
  "te-fcc-wfm-oss-subinfo.user.js": "FCC + WFM + OSS: التقارير اليومية واسم/عنوان العميل",
  "provisioning-portal.user.js": "Provisioning: تحديث البورتات وغيّر البورت",
  "provisioning-portal-ports.user.js": "Provisioning: تحديث ملف البورتات",
  "wfm-accept-task.user.js": "WFM: موافقة تغيير البورت",
  "wfm-dispatcher-reassign.user.js": "WFM Dispatcher: إلغاء المهمة",
  "wfm-voice-installation-raw.user.js": "WFM Reporting: تقرير تركيبات الصوت",
  "customer360-account-grabber.user.js": "Customer360: الأكونت",
  "we-oas-bi-login.user.js": "OAS BI: دخول تلقائى + تقرير 430D",
  "we-oas-131-cabinet.user.js": "OAS BI: تقرير 131 أرقام الكابينة",
  "oas-430d-details.user.js": "OAS 430D: التفاصيل",
};

export const FILE_RE = /^[a-z0-9][a-z0-9-]*\.user\.js$/;

export interface ScriptHeader { name: string; version: string; namespace: string }

/** @name و@version و@namespace من بلوك الـUserScript. */
export function readHeader(src: string): ScriptHeader | null {
  const block = /\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/.exec(src);
  if (!block) return null;
  const tag = (k: string) => (new RegExp(`^\\s*//\\s*@${k}\\s+(.+?)\\s*$`, "m").exec(block[1]) || [])[1] || "";
  return { name: tag("name"), version: tag("version"), namespace: tag("namespace") };
}

/** نفس السكربت بالظبط، بس @updateURL و@downloadURL بلينكات السيرفر (وأى قيم قديمة بتتشال). */
export function withUpdateUrls(src: string, urlUser: string, urlMeta: string): string {
  const m = /(\/\/\s*==UserScript==)([\s\S]*?)(\/\/\s*==\/UserScript==)/.exec(src);
  if (!m) return src;
  const body = m[2].replace(/^\s*\/\/\s*@(updateURL|downloadURL)\b.*\r?\n?/gm, "");
  const lines = body.split(/\n/);
  // بعد سطر @version (وإلا قبل الآخر)
  const at = lines.findIndex((l) => /^\s*\/\/\s*@version\b/.test(l));
  const add = [`// @updateURL    ${urlMeta}`, `// @downloadURL  ${urlUser}`];
  if (at >= 0) lines.splice(at + 1, 0, ...add); else lines.splice(lines.length - 1, 0, ...add);
  return src.slice(0, m.index) + m[1] + lines.join("\n") + m[3] + src.slice(m.index + m[0].length);
}

/** ملف .meta.js: البلوك بس (Tampermonkey بيقارن @version منه من غير ما ينزّل السكربت كله). */
export function metaOnly(src: string): string {
  const m = /\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/.exec(src);
  return m ? m[0] + "\n" : "";
}

export function scriptsDir(): string { return process.cwd(); }

/** السكربتات اللى فى المشروع (من غير نسخ الرجوع). */
export function listScripts(dir = scriptsDir()): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => FILE_RE.test(f)).sort();
}

export function readScript(file: string, dir = scriptsDir()): string | null {
  if (!FILE_RE.test(file)) return null;
  const p = join(dir, file);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

export function linksFor(base: string, key: string, file: string) {
  const root = `${base.replace(/\/+$/, "")}/userscripts/${key}/`;
  return { user: root + file, meta: root + file.replace(/\.user\.js$/, ".meta.js") };
}
