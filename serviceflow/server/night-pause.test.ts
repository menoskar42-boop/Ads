// الإيقاف بالليل (المالك ٢٠٢٦-١٠-١٣): «التحديث التلقائى يقف بالليل من ١٢ بالليل لـ٧ الصبح حتى لو
// الزر مفتوح، وزرار فى الإعدادات يلغيها أو يفتحها … وزر يوقف جهاز التنفيذ فى نفس الفترة».
// السبب: القاعدة بتنام بعد ٥ دقايق من غير استعلامات، والجهاز اللى بيفضل مفتوح بالليل كان بيصحّيها.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cairoHour, isNightCairo, readNightPause, NIGHT_PAUSE_DEFAULT, nightAwareInterval } from "../client/src/lib/night-pause";

const src = (f: string) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

test("الليل = من ١٢ بالليل لحد ٧ الصبح بتوقيت القاهرة (مش توقيت الجهاز)", () => {
  // يناير: القاهرة UTC+2
  assert.equal(cairoHour(new Date("2026-01-15T21:59:00Z")), 23);
  assert.equal(isNightCairo(new Date("2026-01-15T21:59:00Z")), false); // ١١:٥٩ م
  assert.equal(isNightCairo(new Date("2026-01-15T22:00:00Z")), true);  // ١٢:٠٠ ص
  assert.equal(isNightCairo(new Date("2026-01-16T04:59:00Z")), true);  // ٦:٥٩ ص
  assert.equal(isNightCairo(new Date("2026-01-16T05:00:00Z")), false); // ٧:٠٠ ص
  assert.equal(isNightCairo(new Date("2026-01-16T10:00:00Z")), false); // الضهر
});

test("الاتنين مفتوحين افتراضياً، وبالليل مفيش تحديث دورى", () => {
  assert.deepEqual(NIGHT_PAUSE_DEFAULT, { refresh: true, executor: true });
  assert.deepEqual(readNightPause(), NIGHT_PAUSE_DEFAULT); // من غير localStorage
  assert.equal(nightAwareInterval(60000, true), false);
  assert.equal(nightAwareInterval(60000, false), 60000);
});

test("السيرفر: الإعدادين فى app_settings (بادئة exec_lanes_ = سوبر أدمن بس) وبيتقروا ويتحفظوا", () => {
  const r = src("server/routes.ts");
  assert.match(r, /exec_lanes_night_pause_refresh/);
  assert.match(r, /exec_lanes_night_pause_executor/);
  assert.match(r, /const out = \{ refresh: true, executor: true \};/, "مفتوحين لو مفيش إعداد");
  assert.match(r, /nightPause: await readNightPause\(\)/, "GET بيرجّعهم");
  assert.match(r, /typeof v !== "boolean"/, "PUT بيقبل true/false بس");
});

test("شاشة الإعدادات فيها الزرارين", () => {
  const s = src("client/src/components/ExecLanesSettingsButton.tsx");
  assert.match(s, /التحديث التلقائى يقف بالليل/);
  assert.match(s, /جهاز التنفيذ يقف بالليل/);
  assert.match(s, /nightPause: night/);
});

test("التحديث التلقائى: واقف بالليل حتى لو الزرار مفتوح — ومابيسألش السيرفر", () => {
  const s = src("client/src/components/DailyAutoRefresh.tsx");
  assert.match(s, /if \(dailyRefreshPausedNow\(\)\) return;/);
  assert.equal((s.match(/enabled: isSuper && active && !dailyPaused/g) || []).length, 2);
});

test("جهاز التنفيذ: مابيسحبش بالليل، والنبضة واقفة إلا لو فيه مهمة شغّالة، وبيرجع الساعة ٧ لوحده", () => {
  const s = src("client/src/components/ExecutorButton.tsx");
  assert.match(s, /const pump = \(\) => \{\s*\/\/[^\n]*\n\s*if \(executorPausedNow\(\)\) return;/);
  assert.match(s, /if \(executorPausedNow\(\) && running\.size === 0\) return;/);
  assert.match(s, /refreshPending = \(\) => \{\s*if \(executorPausedNow\(\)\) return;/);
  assert.match(s, /else if \(!paused && nightOff\) \{\s*nightOff = false;\s*heartbeat\(\); refreshPending\(\); pump\(\);/);
  assert.match(s, /جهاز التنفيذ نايم لحد ٧ الصبح/);
});

test("الشاشات اللى بتحدّث نفسها بتقف بالليل", () => {
  for (const f of ["client/src/hooks/use-notifications.ts", "client/src/components/LastUpdatedBadge.tsx",
    "client/src/hooks/use-auth.ts", "client/src/components/FileUploadSection.tsx",
    "client/src/components/OmRejectionsReport.tsx", "client/src/components/PhoneLookupReport.tsx"]) {
    const s = src(f);
    assert.match(s, /nightAwareInterval\(/, f);
    assert.doesNotMatch(s, /refetchInterval: \d[\d_]*(?: \* \d+)*,/, `${f}: فيه تحديث دورى من غير الإيقاف بالليل`);
  }
  for (const f of ["client/src/components/ExecBatchesReport.tsx", "client/src/components/QueueReorderPanel.tsx",
    "client/src/components/ManualRegularizedHighScoreReport.tsx", "client/src/components/CfmTicketsReport.tsx"]) {
    assert.match(src(f), /refreshPausedNow\(\)/, f);
  }
});
