/**
 * «قياس السيرفر» (السوبر أدمن) — المالك ٢٠٢٦-١٠-٢٠: عدّاد صحيان القاعدة أثبت إن القاعدة صاحية طول
 * ما طابور التنفيذ شغّال (٦٫٣ ساعة من ٦٫٥)، فالفاتورة مش هتنزل غير لو القاعدة اتنقلت لمكان مافيهوش
 * حساب بالساعة. أول بديل: Postgres جوّه نفس الـReserved VM + نسخة على R2. قبله لازم نعرف:
 * الذاكرة كام والمستخدم منها كام، والقرص المؤقّت فيه مساحة قد إيه، وPostgres موجود فى بيئة النشر ولا لأ.
 *
 * قراية بس: مابيكلّمش القاعدة (عشان مايصحّيهاش)، ومابيشغّلش غير `--version` لبرامج Postgres.
 */
import os from "os";
import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";

const MB = 1024 * 1024;
const mb = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.round(n / MB));

async function readText(p: string): Promise<string | null> {
  try { return (await fs.readFile(p, "utf8")).trim(); } catch { return null; }
}

/** حد الذاكرة الفعلى للحاوية (cgroup v2 ثم v1) — os.totalmem بيرجّع ذاكرة الجهاز كله */
async function cgroupMemory() {
  const v2max = await readText("/sys/fs/cgroup/memory.max");
  const v2cur = await readText("/sys/fs/cgroup/memory.current");
  if (v2max != null || v2cur != null) {
    return { version: 2, limitMb: v2max && v2max !== "max" ? mb(Number(v2max)) : null, usedMb: v2cur ? mb(Number(v2cur)) : null };
  }
  const v1max = await readText("/sys/fs/cgroup/memory/memory.limit_in_bytes");
  const v1cur = await readText("/sys/fs/cgroup/memory/memory.usage_in_bytes");
  if (v1max != null || v1cur != null) {
    const lim = Number(v1max);
    return { version: 1, limitMb: lim > 0 && lim < 2 ** 60 ? mb(lim) : null, usedMb: v1cur ? mb(Number(v1cur)) : null };
  }
  return null;
}

async function diskFree(p: string) {
  try {
    const s: any = await (fs as any).statfs(p);
    return { path: p, freeMb: mb(Number(s.bavail) * Number(s.bsize)), totalMb: mb(Number(s.blocks) * Number(s.bsize)) };
  } catch (e: any) { return { path: p, error: String(e?.code || e?.message || e) }; }
}

/** أول ملف تنفيذى بالاسم ده فى PATH (من غير ما نشغّله) */
async function which(bin: string): Promise<string | null> {
  for (const dir of String(process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, bin);
    try { await fs.access(p, 1 /* X_OK */); return p; } catch {}
  }
  return null;
}

function version(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(bin, ["--version"], { timeout: 5000 }, (err, out) => resolve(err ? null : String(out).trim()));
  });
}

export async function hostInfo() {
  const pg: Record<string, { path: string | null; version: string | null }> = {};
  for (const b of ["postgres", "initdb", "pg_ctl", "pg_dump", "pg_basebackup"]) {
    const p = await which(b);
    pg[b] = { path: p, version: p ? await version(p) : null };
  }
  const mem = process.memoryUsage();
  return {
    at: new Date().toISOString(),
    cpus: os.cpus().length,
    loadavg: os.loadavg().map((x) => Math.round(x * 100) / 100),
    uptimeMin: Math.round(os.uptime() / 60),
    machine: { totalMb: mb(os.totalmem()), freeMb: mb(os.freemem()) },
    container: await cgroupMemory(),
    // العملية دى بس (Service Flow) — أوسكار ديفز وmybible عمليات تانية على نفس الجهاز
    thisProcess: { rssMb: mb(mem.rss), heapUsedMb: mb(mem.heapUsed) },
    disks: await Promise.all([os.tmpdir(), process.cwd(), os.homedir()].map(diskFree)),
    postgres: pg,
  };
}
