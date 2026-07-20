import webpush from "web-push";
import cron from "node-cron";
import pg from "pg";
import { storage } from "./storage";

const pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const NOTIF_DATE_KEY = "last_daily_notif_date";

// Returns today's date in Cairo timezone as "YYYY-MM-DD"
function getCairoDateString(): string {
  const now = new Date();
  // Intl.DateTimeFormat gives Cairo calendar date correctly
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(now);
  // en-CA locale returns "YYYY-MM-DD" directly
  return parts;
}

// ── helper: send one push notification ───────────────────────────────────────
async function sendOne(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: string,
): Promise<'ok' | 'expired' | 'error'> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    );
    return 'ok';
  } catch (err: unknown) {
    const code = (err as { statusCode?: number })?.statusCode;
    const body = (err as { body?: string })?.body;
    if (code === 410 || code === 404) return 'expired';
    console.error('[push] SEND FAILED — code:', code, '— body:', body, '— endpoint:', sub.endpoint.slice(-40));
    return 'error';
  }
}

export function setupVapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL || "mailto:contact@oscardevs.com";

  if (!publicKey || !privateKey) {
    console.warn("[push] VAPID keys not set — push notifications disabled");
    return;
  }

  const safePublicKey = publicKey.trim().replace(/\s+/g, "").replace(/=+$/, "");
  const safePrivateKey = privateKey.trim().replace(/\s+/g, "").replace(/=+$/, "");

  try {
    webpush.setVapidDetails(email, safePublicKey, safePrivateKey);
    console.log("[push] VAPID initialized");
  } catch (err) {
    console.warn("[push] VAPID initialization failed — push notifications disabled:", err);
  }
}

// In-process mutex: prevents two concurrent calls from both proceeding
let sendingInProgress = false;

export async function sendDailyVerseNotification() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    console.warn("[push] VAPID_PUBLIC_KEY not set — skipping daily notification");
    return;
  }

  // ── Mutex: block concurrent calls (race between main cron + backup cron) ──
  if (sendingInProgress) {
    console.log("[push] Already sending — skipping duplicate trigger");
    return;
  }
  sendingInProgress = true;

  try {
    const today = getCairoDateString();

    // ── DB guard: skip if already sent today (survives server restarts) ────
    const lastSentDate = await storage.getAppSetting(NOTIF_DATE_KEY);
    if (lastSentDate === today) {
      console.log(`[push] Daily notification already sent for ${today} — skipping`);
      return;
    }

    // ── Mark as sent in DB BEFORE sending (prevents duplicate on partial failure) ──
    await storage.setAppSetting(NOTIF_DATE_KEY, today);

    const month = new Date().getMonth() + 1;
    const day   = new Date().getDate();

    const calVerse = await storage.getCalendarDailyVerse(month, day);
    if (!calVerse) {
      console.warn(`[push] No calendar verse for ${month}/${day} — notification skipped`);
      return;
    }
    const refParts = calVerse.verseReference.match(/^(.+?)\s*(\d+):(\d+)$/);
    const bookName = refParts ? refParts[1].trim() : calVerse.verseReference;
    const chapter  = refParts ? parseInt(refParts[2]) : 1;
    const verseNum = refParts ? parseInt(refParts[3]) : 1;
    const dbVerse  = await storage.getVerseByReference(bookName, chapter, verseNum);
    const verseText = dbVerse?.text ?? calVerse.verseText;
    const verseRef  = `${bookName} ‎${chapter}:‎${verseNum}`;

    const subscriptions = await storage.getAllPushSubscriptions();
    if (subscriptions.length === 0) {
      console.log("[push] No active subscriptions");
      return;
    }

    const payload = JSON.stringify({
      title: "آية اليوم 📖",
      body: verseText.length > 120
        ? verseText.slice(0, 117) + `…\n— ${verseRef}`
        : `${verseText}\n— ${verseRef}`,
      url: "/",
    });

    let sent = 0, expired = 0, errors = 0;
    await Promise.all(subscriptions.map(async sub => {
      const result = await sendOne(sub, payload);
      if (result === 'ok')           { sent++; }
      else if (result === 'expired') { expired++; await storage.deletePushSubscription(sub.endpoint); }
      else                           { errors++; }
    }));

    console.log(`[push] Daily verse sent=${sent} expired_removed=${expired} errors=${errors} total=${subscriptions.length} date=${today}`);
  } catch (err) {
    console.error("[push] Error sending daily verse notification:", err);
  } finally {
    sendingInProgress = false;
  }
}

// ── Welcome notification (single subscription) ───────────────────────────────
export async function sendWelcomeNotification(endpoint: string): Promise<boolean> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return false;
  try {
    const subscriptions = await storage.getAllPushSubscriptions();
    const sub = subscriptions.find(s => s.endpoint === endpoint);
    if (!sub) return false;
    const payload = JSON.stringify({
      title: "أهلاً وسهلاً بعودتك 🙏",
      body: "نسعد بزيارتك. الكتاب المقدس معك دائماً.",
      url: "/",
    });
    const result = await sendOne(sub, payload);
    if (result === 'expired') await storage.deletePushSubscription(endpoint);
    return result === 'ok';
  } catch {
    return false;
  }
}

// ── Test notification (all subscriptions) ────────────────────────────────────
export async function sendTestNotification(): Promise<{ sent: number; total: number }> {
  const subscriptions = await storage.getAllPushSubscriptions();
  let sent = 0;
  const payload = JSON.stringify({
    title: "اختبار الإشعارات ✅",
    body: "وصل الإشعار بنجاح!",
    url: "/",
  });
  await Promise.all(subscriptions.map(async sub => {
    const r = await sendOne(sub, payload);
    if (r === 'ok') sent++;
    if (r === 'expired') await storage.deletePushSubscription(sub.endpoint);
  }));
  return { sent, total: subscriptions.length };
}

// ── Group chat notification ────────────────────────────────────────────────────
export async function sendGroupChatNotification(
  groupCode: string,
  groupName: string,
  senderName: string,
  messagePreview: string,
  subscriptions: { endpoint: string; p256dh: string; auth: string }[],
): Promise<void> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey || subscriptions.length === 0) return;
  const body = messagePreview.length > 80 ? messagePreview.slice(0, 77) + '…' : messagePreview;
  const payload = JSON.stringify({
    title: `💬 ${groupName}`,
    body: `${senderName}: ${body}`,
    url: `/group/${groupCode}`,
  });
  await Promise.all(subscriptions.map(sub => sendOne(sub, payload)));
}

// ── Daily group reading notification ─────────────────────────────────────────
// Sends each group's auto-reading chapters to its push subscribers once per day
const GROUP_NOTIF_DATE_KEY = "last_group_reading_notif_date";

export async function sendDailyGroupReadingNotification() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return;

  const today = getCairoDateString();
  const lastSent = await storage.getAppSetting(GROUP_NOTIF_DATE_KEY).catch(() => null);
  if (lastSent === today) {
    console.log(`[push] Group reading notification already sent for ${today} — skipping`);
    return;
  }
  await storage.setAppSetting(GROUP_NOTIF_DATE_KEY, today);

  try {
    // Fetch all groups with auto reading enabled
    const groupsRes = await pgPool.query<{
      id: number; name: string; group_code: string; auto_reading_config: unknown;
    }>(
      `SELECT id, name, group_code, auto_reading_config FROM reading_groups WHERE auto_reading_config IS NOT NULL`
    );

    for (const group of groupsRes.rows) {
      const cfg = group.auto_reading_config as {
        enabled?: boolean;
        otChaptersPerDay?: number;
        ntChaptersPerDay?: number;
        baseDate?: string;
        otStartIndex?: number;
        ntStartIndex?: number;
      };
      if (!cfg?.enabled) continue;

      // Compute today's chapters (inline — avoids client-side import)
      const OT_FLAT = buildOtFlat();
      const NT_FLAT = buildNtFlat();
      const elapsed = Math.max(0, daysBetweenDates(cfg.baseDate ?? today, today));
      const otPer = cfg.otChaptersPerDay ?? 1;
      const ntPer = cfg.ntChaptersPerDay ?? 1;
      const otOff = ((cfg.otStartIndex ?? 0) + elapsed * otPer) % OT_FLAT.length;
      const ntOff = ((cfg.ntStartIndex ?? 0) + elapsed * ntPer) % NT_FLAT.length;

      const otChapters = Array.from({ length: otPer }, (_, i) => OT_FLAT[(otOff + i) % OT_FLAT.length]);
      const ntChapters = Array.from({ length: ntPer }, (_, i) => NT_FLAT[(ntOff + i) % NT_FLAT.length]);

      const allChapters = [...otChapters, ...ntChapters];
      if (allChapters.length === 0) continue;

      const firstOt = otChapters[0];
      const firstNt = ntChapters[0];
      const body = [
        otChapters.length > 0 ? `العهد القديم: ${firstOt.book} ${firstOt.chapter}` + (otPer > 1 ? `–${otChapters[otChapters.length-1].chapter}` : '') : null,
        ntChapters.length > 0 ? `العهد الجديد: ${firstNt.book} ${firstNt.chapter}` + (ntPer > 1 ? `–${ntChapters[ntChapters.length-1].chapter}` : '') : null,
      ].filter(Boolean).join('  •  ');

      const payload = JSON.stringify({
        title: `📖 قراءة اليوم — ${group.name}`,
        body,
        url: `/group/${group.group_code}`,
      });

      // Get all subscriptions for this group
      const subsRes = await pgPool.query<{ endpoint: string; p256dh: string; auth: string }>(
        `SELECT endpoint, p256dh, auth FROM group_push_subscriptions WHERE group_id = $1`,
        [group.id]
      );
      if (subsRes.rows.length === 0) continue;

      let sent = 0;
      await Promise.all(subsRes.rows.map(async sub => {
        const r = await sendOne(sub, payload);
        if (r === 'ok') sent++;
        if (r === 'expired') {
          await pgPool.query(
            `DELETE FROM group_push_subscriptions WHERE group_id=$1 AND endpoint=$2`,
            [group.id, sub.endpoint]
          );
        }
      }));
      console.log(`[push] Group reading notif — group=${group.name} sent=${sent}/${subsRes.rows.length}`);
    }
  } catch (err) {
    console.error('[push] sendDailyGroupReadingNotification error:', err);
  }
}

function daysBetweenDates(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

type FlatCh = { book: string; chapter: number };

function buildOtFlat(): FlatCh[] {
  // الترتيب يطابق client/src/lib/group-auto-reading.ts (السبعينية مع الأسفار القانونية الثانية)
  const books: [string, number][] = [
    ["التكوين",50],["الخروج",40],["اللاويين",27],["العدد",36],["التثنية",34],
    ["يشوع",24],["القضاة",21],["راعوث",4],["صموئيل الأول",31],["صموئيل الثاني",24],
    ["الملوك الأول",22],["الملوك الثاني",25],["أخبار الأيام الأول",29],["أخبار الأيام الثاني",36],
    ["عزرا",10],["نحميا",13],
    ["طوبيا",14],["يهوديت",16],["أستير",10],
    ["المكابيين الأول",16],["المكابيين الثاني",15],["المكابيين الثالث",7],
    ["أيوب",42],["المزامير",150],["المزمور 151",1],["صلاة منسى",1],
    ["الأمثال",31],["الجامعة",12],["نشيد الأنشاد",8],
    ["حكمة سليمان",19],["يشوع بن سيراخ",51],
    ["إشعياء",66],["إرميا",52],["مراثي إرميا",5],["باروخ",6],["حزقيال",48],
    ["دانيال",12],["هوشع",14],["يوئيل",3],["عاموس",9],["عوبديا",1],
    ["يونان",4],["ميخا",7],["ناحوم",3],["حبقوق",3],["صفنيا",3],
    ["حجي",2],["زكريا",14],["ملاخي",4],
  ];
  return books.flatMap(([name, count]) => Array.from({length:count},(_,i)=>({book:name,chapter:i+1})));
}

function buildNtFlat(): FlatCh[] {
  const books: [string, number][] = [
    ["متى",28],["مرقس",16],["لوقا",24],["يوحنا",21],["أعمال الرسل",28],
    ["رومية",16],["كورنثوس الأولى",16],["كورنثوس الثانية",13],["غلاطية",6],
    ["أفسس",6],["فيلبي",4],["كولوسي",4],["تسالونيكي الأولى",5],["تسالونيكي الثانية",3],
    ["تيموثاوس الأولى",6],["تيموثاوس الثانية",4],["تيطس",3],["فليمون",1],
    ["العبرانيين",13],["يعقوب",5],["بطرس الأولى",5],["بطرس الثانية",3],
    ["يوحنا الأولى",5],["يوحنا الثانية",1],["يوحنا الثالثة",1],["يهوذا",1],["رؤيا يوحنا",22],
  ];
  return books.flatMap(([name, count]) => Array.from({length:count},(_,i)=>({book:name,chapter:i+1})));
}

// ── Scheduling ────────────────────────────────────────────────────────────────
export function scheduleDailyNotification() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return;

  // Primary: 6:00 AM Cairo — verse + group reading
  cron.schedule("0 6 * * *", async () => {
    await sendDailyVerseNotification();
    await sendDailyGroupReadingNotification();
  }, { timezone: "Africa/Cairo" });
  console.log("[push] Daily notification scheduled at 6:00 AM Cairo time");

  // Backup: every 30 min within 6:00–7:59 AM Cairo window
  // Handles server sleep/restart at 6 AM — DB guard prevents double-send
  cron.schedule("*/30 * * * *", async () => {
    const now = new Date();
    const cairoHour = parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hour: 'numeric', hour12: false }).format(now)
    );
    if (cairoHour >= 6 && cairoHour < 8) {
      const today = getCairoDateString();
      const lastSent = await storage.getAppSetting(NOTIF_DATE_KEY).catch(() => null);
      if (lastSent !== today) {
        console.log('[push] Backup check: sending missed daily notification for', today);
        await sendDailyVerseNotification();
        await sendDailyGroupReadingNotification();
      }
    }
  });
  console.log("[push] Backup 30-min check scheduled (window: 6:00-7:59 AM Cairo)");
}
