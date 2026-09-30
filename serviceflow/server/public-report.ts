// صفحة «الإبلاغ عن عطل» العامة للعملاء (قرار المالك ٢٠٢٦-٠٩-٣٠).
//
// العميل بيكتب رقم التليفون الأرضى + رقم محمول للتواصل، فيتسجّل «عطل خارج الشاشة»
// (manual_faults) زى زرار «الخط به عطل» بالظبط — ويظهر فى «الأعطال الحالية خارج الشاشة».
//
// 🔒 دى الصفحة الوحيدة فى الموقع اللى بتشتغل من غير تسجيل دخول، وعشان كده:
//   · صفحة HTML مستقلة (مش جوّه تطبيق React) — مابتحمّلش أى كود ولا رابط لباقى الموقع.
//   · مابترجّعش أى بيانات عن الخط: لا اسم ولا عنوان ولا كابينة — «اتسجّل / مسجّل قبل
//     كده / الرقم مش عندنا» بس.
//   · حدود ضد الإغراق: ٣ بلاغات لكل IP فى الساعة، ٣ لكل محمول فى اليوم، و٤٠ للكل فى
//     الساعة — ومصيدة للبوتات (خانة مخفية).
//   · noindex + CSP مقفولة (مفيش أى ملف من برّه، والإرسال لنفس الموقع بس).
import type { Express, Request, Response } from "express";
import type { Pool } from "pg";
import { CENTRAL_SMS_CONTACT, normalizeEgMobile } from "@shared/sms-message";

export const PUBLIC_REPORT_SOURCE = "بلاغ عميل (الرابط العام)";
export const PROBLEM_TYPES = ["لا توجد حرارة", "الإنترنت مقطوع", "الإنترنت بطيء أو بيفصل", "أخرى"] as const;
export const REPORT_LIMITS = { perIpHour: 3, perMobileDay: 3, globalHour: 40 } as const;

// الرقم الأرضى → الرقم القصير (٧ أرقام) + الكامل (88 + القصير). بيقبل 088… / 88… / القصير.
export function normalizeLandline(raw: unknown): { short: string; full: string } | null {
  let d = String(raw ?? "").replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/\D/g, "");
  d = d.replace(/^0+/, "");
  if (d.startsWith("88") && d.length === 9) d = d.slice(2);
  return /^\d{7}$/.test(d) ? { short: d, full: "88" + d } : null;
}

// أول IP فى x-forwarded-for (العميل) — تقريبى، والحد العام بيغطّى أى تلاعب فيه.
function clientIp(req: Request): string {
  const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return (xff || req.socket.remoteAddress || "").slice(0, 64);
}

export type ReportResult =
  | { status: 201; ok: true; message: string }
  | { status: 200; ok: true; duplicate: true; message: string }
  | { status: 400 | 404 | 429; ok: false; message: string };

export async function submitPublicReport(
  pool: Pool,
  body: any,
  ip: string,
): Promise<ReportResult> {
  // مصيدة البوتات: خانة مخفية عن البنى آدم — لو اتملت نرد «تمام» ومنسجّلش حاجة
  if (String(body?.website ?? "").trim()) return { status: 201, ok: true, message: "تم استلام البلاغ." };
  const line = normalizeLandline(body?.phone);
  if (!line) return { status: 400, ok: false, message: "رقم التليفون الأرضى غير صحيح. اكتبه ٧ أرقام (أو بكود المحافظة 088)." };
  const mobile = normalizeEgMobile(body?.mobile);
  if (!mobile) return { status: 400, ok: false, message: "رقم المحمول غير صحيح. اكتبه ١١ رقم يبدأ بـ01." };
  const problem = String(body?.problem ?? "").trim();
  if (!(PROBLEM_TYPES as readonly string[]).includes(problem)) return { status: 400, ok: false, message: "اختر نوع المشكلة." };
  const details = String(body?.details ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  const note = details ? `${problem} — ${details}` : problem;

  const busy = `تم إرسال بلاغات كتير فى وقت قصير. حاول بعد شوية، أو اتصل بالسنترال على ${CENTRAL_SMS_CONTACT}.`;
  const { rows: [lim] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE reporter_ip = $1 AND flagged_at > now() - interval '1 hour')::int AS ip,
            COUNT(*) FILTER (WHERE reporter_mobile = $2 AND flagged_at > now() - interval '1 day')::int AS mob,
            COUNT(*) FILTER (WHERE flagged_at > now() - interval '1 hour')::int AS total
       FROM manual_faults WHERE report_source = 'public' AND flagged_at > now() - interval '1 day'`,
    [ip, mobile]);
  if (lim.ip >= REPORT_LIMITS.perIpHour || lim.mob >= REPORT_LIMITS.perMobileDay || lim.total >= REPORT_LIMITS.globalHour)
    return { status: 429, ok: false, message: busy };

  // الخط لازم يكون من خطوط السنترال (بيان التليفونات) — ومفيش أى بيان عنه بيرجع للعميل
  const { rows: [pl] } = await pool.query(
    `SELECT pl.full_phone, pl.central, pl.cabin_number, pl.box_number,
            NULLIF(btrim(pp.msan_code), '') AS msan_code, la.account_no,
            (SELECT tn.tech_name FROM cabinet_technicians ct
               LEFT JOIN technician_names tn ON tn.worker_code = ct.worker_code
              WHERE CASE WHEN NULLIF(btrim(pp.msan_code), '') IS NOT NULL
                         THEN btrim(ct.cabin_code) = btrim(pp.msan_code)
                         ELSE ct.central_name = pl.central AND ct.cabin_number = pl.cabin_number END
              ORDER BY tn.tech_name NULLS LAST LIMIT 1) AS tech_name
       FROM phone_lines pl
       LEFT JOIN phone_ports pp ON pp.phone_number = pl.full_phone
       LEFT JOIN line_accounts la ON la.full_phone = pl.full_phone
      WHERE pl.tel_no = $1 OR pl.full_phone = $2
      LIMIT 1`, [line.short, line.full]);
  if (!pl) return {
    status: 404, ok: false,
    message: `الرقم ده مش مسجّل ضمن خطوط سنترال الغنايم. اتأكد من الرقم، أو اتصل بالسنترال على ${CENTRAL_SMS_CONTACT}.`,
  };

  // عطل مفتوح بالفعل → مانكرّرش (زى زرار «الخط به عطل»)، بس لو مالوش محمول تواصل نحطّه
  const { rows: [open] } = await pool.query(
    `SELECT id FROM manual_faults WHERE status = 'open' AND (phone_short = $1 OR full_phone = $2) LIMIT 1`,
    [line.short, line.full]);
  if (open) {
    await pool.query(
      `UPDATE manual_faults SET reporter_mobile = COALESCE(reporter_mobile, $2) WHERE id = $1`, [open.id, mobile]);
    return {
      status: 200, ok: true, duplicate: true,
      message: `فيه بلاغ مسجّل بالفعل على الخط ده وجارى متابعته. للاستفسار: ${CENTRAL_SMS_CONTACT}.`,
    };
  }

  await pool.query(
    `INSERT INTO manual_faults (full_phone, phone_short, account_no, central, cabin_number, box_number,
                                msan_code, tech_name, status, flagged_by,
                                report_source, reporter_mobile, report_note, reporter_ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9,'public',$10,$11,$12)`,
    [pl.full_phone || line.full, line.short, pl.account_no, pl.central, pl.cabin_number, pl.box_number,
     pl.msan_code, pl.tech_name, PUBLIC_REPORT_SOURCE, mobile, note, ip]);
  return {
    status: 201, ok: true,
    message: `تم تسجيل البلاغ على خط ${line.full}. هيتم التواصل مع حضرتك على ${mobile} فى أقرب وقت.`,
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function renderReportPage(): string {
  const options = PROBLEM_TYPES.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>الإبلاغ عن عطل — سنترال الغنايم</title>
<style>
:root { --bg:#f2f5f8; --card:#ffffff; --ink:#15202b; --muted:#5b6b7b; --line:#d5dee7; --accent:#0b6bcb; --accent-ink:#ffffff;
  --ok:#0f7b45; --ok-bg:#e8f6ee; --err:#b42318; --err-bg:#fdecea; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --bg:#0e141a; --card:#16202a; --ink:#e4ebf2; --muted:#9aabbc; --line:#2a3947;
  --accent:#4ea3f5; --accent-ink:#06121d; --ok:#5fd39a; --ok-bg:#0f2a1d; --err:#ff9b8f; --err-bg:#2e1411; color-scheme: dark; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.8 "Segoe UI", Tahoma, "Noto Sans Arabic", Arial, sans-serif; }
main { max-width:520px; margin:0 auto; padding-inline:16px; padding-block:24px 40px; display:grid; gap:16px; }
h1 { font-size:1.45rem; margin:0; }
.sub { margin:0; color:var(--muted); }
form { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:18px; display:grid; gap:14px; }
label { display:grid; gap:6px; font-weight:600; }
label span { font-weight:400; color:var(--muted); font-size:.9rem; }
input, select, textarea { font:inherit; color:var(--ink); background:var(--bg); border:1px solid var(--line); border-radius:10px; padding:10px 12px; width:100%; }
input[inputmode="numeric"], input[type="tel"] { direction:ltr; text-align:right; }
input:focus, select:focus, textarea:focus, button:focus-visible { outline:3px solid var(--accent); outline-offset:1px; }
.hp { position:absolute; left:-10000px; width:1px; height:1px; overflow:hidden; }
button { font-weight:700; font-size:1.05rem; font-family:inherit; background:var(--accent); color:var(--accent-ink); border:0; border-radius:10px; padding:13px; cursor:pointer; }
button[disabled] { opacity:.6; cursor:wait; }
.msg { border-radius:10px; padding:12px 14px; margin:0; }
.msg.ok { background:var(--ok-bg); color:var(--ok); }
.msg.err { background:var(--err-bg); color:var(--err); }
.call { margin:0; color:var(--muted); }
.call a { color:var(--accent); direction:ltr; unicode-bidi:embed; }
details { color:var(--muted); font-size:.92rem; }
summary { cursor:pointer; font-weight:600; }
</style>
</head>
<body>
<main>
  <h1>الإبلاغ عن عطل فى خط التليفون</h1>
  <p class="sub">سنترال الغنايم — اكتب رقم الخط ورقم محمول نتواصل مع حضرتك عليه.</p>
  <form id="f" novalidate>
    <label>رقم التليفون الأرضى
      <input id="phone" name="phone" type="tel" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="مثال: 2821905" required>
      <span>٧ أرقام، أو بكود المحافظة 088</span>
    </label>
    <label>رقم المحمول للتواصل
      <input id="mobile" name="mobile" type="tel" inputmode="numeric" autocomplete="tel" maxlength="14" placeholder="01xxxxxxxxx" required>
    </label>
    <label>نوع المشكلة
      <select id="problem" name="problem" required><option value="">اختر…</option>${options}</select>
    </label>
    <label>ملاحظات (اختيارى)
      <textarea id="details" name="details" rows="3" maxlength="300" placeholder="مثلاً: العطل من امبارح، أو أنسب وقت نتصل فيه"></textarea>
      <span>لحد ٣٠٠ حرف</span>
    </label>
    <div class="hp" aria-hidden="true"><label>الموقع<input id="website" name="website" tabindex="-1" autocomplete="off"></label></div>
    <button id="send" type="submit">إرسال البلاغ</button>
    <p id="msg" class="msg" role="status" aria-live="polite" hidden></p>
  </form>
  <p class="call">للاستفسار: <a href="tel:${CENTRAL_SMS_CONTACT}">${CENTRAL_SMS_CONTACT}</a> (مكالمة أو واتساب)</p>
  <details id="privacy">
    <summary>الخصوصية</summary>
    <p>البيانات اللى بتكتبها هنا (رقم الخط، رقم المحمول، نوع المشكلة، والملاحظات) بتُستخدم لمتابعة عطل خطك والتواصل مع حضرتك بخصوصه بس، ومش بتتشارك مع أى جهة تانية. بنسجّل كمان عنوان الـIP لمنع إساءة الاستخدام. رسايل المتابعة من السنترال بتكون عن حالة خطك فقط.</p>
  </details>
</main>
<script>
(function () {
  var f = document.getElementById("f"), btn = document.getElementById("send"), msg = document.getElementById("msg");
  function show(text, ok) { msg.textContent = text; msg.className = "msg " + (ok ? "ok" : "err"); msg.hidden = false; }
  f.addEventListener("submit", function (e) {
    e.preventDefault();
    var data = {};
    ["phone", "mobile", "problem", "details", "website"].forEach(function (k) { data[k] = document.getElementById(k).value; });
    btn.disabled = true;
    fetch("api/public/fault-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { r: r, b: b }; }); })
      .then(function (x) {
        show(x.b.message || (x.r.ok ? "تم." : "حصل خطأ، حاول تانى."), !!x.b.ok);
        if (x.b.ok) f.reset();
      })
      .catch(function () { show("مفيش اتصال بالإنترنت. حاول تانى.", false); })
      .then(function () { btn.disabled = false; });
  });
})();
</script>
</body>
</html>`;
}

// الصفحة + الإرسال. بيتسجّلوا من غير requireAuth عن قصد — ودول الاتنين بس
// (الحارس check-public-routes بيمنع أى مسار عام تانى من غير ما يتكتب هناك).
export function registerPublicReport(app: Express, pool: Pool) {
  app.get("/report", (_req: Request, res: Response) => {
    res.set({
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    });
    res.send(renderReportPage());
  });

  app.post("/api/public/fault-report", async (req: Request, res: Response) => {
    try {
      const r = await submitPublicReport(pool, req.body, clientIp(req));
      res.status(r.status).json(r);
    } catch (e: any) {
      console.error("[public-report]", e?.message);
      res.status(500).json({ ok: false, message: `حصل خطأ. اتصل بالسنترال على ${CENTRAL_SMS_CONTACT}.` });
    }
  });
}
