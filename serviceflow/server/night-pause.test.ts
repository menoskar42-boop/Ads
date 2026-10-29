// الإيقاف بالليل (المالك ٢٠٢٦-١٠-١٣): «التحديث التلقائى يقف بالليل من ١٢ بالليل لـ٧ الصبح حتى لو
// الزر مفتوح، وزرار فى الإعدادات يلغيها أو يفتحها … وزر يوقف جهاز التنفيذ فى نفس الفترة».
// السبب: القاعدة بتنام بعد ٥ دقايق من غير استعلامات، والجهاز اللى بيفضل مفتوح بالليل كان بيصحّيها.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cairoHour, isNightCairo, readNightPause, NIGHT_PAUSE_DEFAULT, nightAwareInterval, nightWindowStart } from "../client/src/lib/night-pause";

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
  assert.deepEqual(NIGHT_PAUSE_DEFAULT, { refresh: true, executor: true, start: "00:00", end: "07:00" });
  assert.deepEqual(readNightPause(), NIGHT_PAUSE_DEFAULT); // من غير localStorage
  assert.equal(nightAwareInterval(60000, true), false);
  assert.equal(nightAwareInterval(60000, false), 60000);
});

test("السيرفر: الإعدادين فى app_settings (بادئة exec_lanes_ = سوبر أدمن بس) وبيتقروا ويتحفظوا", () => {
  const r = src("server/routes.ts");
  assert.match(r, /exec_lanes_night_pause_refresh/);
  assert.match(r, /exec_lanes_night_pause_executor/);
  assert.match(r, /const out: NightPauseSetting = \{ refresh: true, executor: true, start: "00:00", end: "07:00" \};/, "مفتوحين ومن ١٢ لـ٧ لو مفيش إعداد");
  assert.match(r, /exec_lanes_night_start/);
  assert.match(r, /exec_lanes_night_end/);
  assert.match(r, /!NIGHT_TIME_RE\.test\(v\)/, "الوقت لازم HH:MM");
  assert.match(r, /nightPause: await readNightPause\(\)/, "GET بيرجّعهم");
  assert.match(r, /typeof v !== "boolean"/, "PUT بيقبل true/false بس");
});

test("شاشة الإعدادات فيها الزرارين", () => {
  const s = src("client/src/components/ExecLanesSettingsButton.tsx");
  assert.match(s, /التحديث التلقائى يقف فى الفترة دى/);
  assert.match(s, /جهاز التنفيذ يقف فى الفترة دى/);
  assert.match(s, /nightPause: night/);
});

test("التحديث التلقائى: واقف بالليل حتى لو الزرار مفتوح — ومابيسألش السيرفر", () => {
  const s = src("client/src/components/DailyAutoRefresh.tsx");
  assert.match(s, /if \(dailyRefreshPausedNow\(\)\) return;/);
  assert.equal((s.match(/enabled: isSuper && active && !dailyPaused/g) || []).length, 2);
});

test("جهاز التنفيذ: مابيسحبش بالليل، والنبضة واقفة إلا لو فيه مهمة شغّالة، وبيرجع الساعة ٧ لوحده", () => {
  const s = src("client/src/components/ExecutorButton.tsx");
  // جوّه الفترة: بيسحب اللى اتضاف قبل بدايتها بس، ولما يخلّصه بينام
  assert.match(s, /\.\.\.\(executorPausedNow\(\) \? \{ before: nightWindowStart\(\)\.toISOString\(\) \} : \{\}\)/);
  assert.match(s, /if \(n === 0\) return goNightOff\(\);/);
  assert.match(s, /const pump = \(\) => \{\s*\/\/[^\n]*\n\s*if \(nightOff\) return;/);
  assert.match(s, /if \(nightOff && running\.size === 0\) return;/);
  assert.match(s, /refreshPending = \(\) => \{\s*if \(nightOff\) return;/);
  assert.match(s, /if \(!paused && \(nightOff \|\| drainIdleSince\)\) \{[\s\S]{0,200}heartbeat\(\); refreshPending\(\); pump\(\);/);
  assert.match(s, /جهاز التنفيذ نايم لحد \$\{readNightPause\(\)\.end\}/);
  assert.match(s, /بيخلّص الطابور قبل الإيقاف/);
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

test("المدة من الإعدادات: بتعدّى نص الليل، وبداية الفترة صح", () => {
  const p = { start: "22:00", end: "06:00" };
  // يناير: القاهرة UTC+2
  assert.equal(isNightCairo(new Date("2026-01-15T19:59:00Z"), p), false); // ٩:٥٩ م
  assert.equal(isNightCairo(new Date("2026-01-15T20:00:00Z"), p), true);  // ١٠:٠٠ م
  assert.equal(isNightCairo(new Date("2026-01-15T23:30:00Z"), p), true);  // ١:٣٠ ص
  assert.equal(isNightCairo(new Date("2026-01-16T04:00:00Z"), p), false); // ٦:٠٠ ص
  assert.equal(isNightCairo(new Date("2026-01-15T22:00:00Z"), { start: "07:00", end: "07:00" }), false, "بداية = نهاية ⇒ مفيش إيقاف");
  // الساعة ١:٣٠ ص ⇒ الفترة بدأت ١٠:٠٠ م امبارح
  assert.equal(nightWindowStart(new Date("2026-01-15T23:30:20Z"), p).toISOString(), "2026-01-15T20:00:00.000Z");
  // ٠٠:٠٠ ← ٠٧:٠٠ والساعة ٣ الفجر ⇒ بدأت نص الليل
  assert.equal(nightWindowStart(new Date("2026-01-16T01:05:00Z"), { start: "00:00", end: "07:00" }).toISOString(), "2026-01-15T22:00:00.000Z");
});

test("السيرفر: السحب و«المنتظر» بيحترموا بداية الفترة (اللى اتضاف بعدها بيستنى)", () => {
  const r = src("server/routes.ts");
  assert.match(r, /AND \(\$2::timestamptz IS NULL OR h\.created_at <= \$2::timestamptz\)/);
  assert.match(r, /\[skippedSites, before\],/);
  assert.match(r, /AND \(\$1::timestamptz IS NULL OR created_at <= \$1::timestamptz\)\n\s+AND NOT \$\{skipBridge \? bridgeable\("exec_jobs"\) : "FALSE"\}`, \[before\]\);/);
});

test("شاشة الإعدادات فيها وقت البداية والنهاية", () => {
  const s = src("client/src/components/ExecLanesSettingsButton.tsx");
  assert.match(s, /id="night-start" type="time"/);
  assert.match(s, /id="night-end" type="time"/);
  assert.match(s, /!validNight \|\| save\.isPending/);
});

test("بالليل: طلب اتضاف بعد بداية الفترة (مستنى الصبح) مايوقّفش تابات «بدون Real» الزيادة", () => {
  // المالك ٢٠٢٦-١٠-١٤: طلب قياس الساعة ١٢:٤٩ بالليل خلّى «بدون Real» يمشى خط خط لحد الصبح
  const r = src("server/routes.ts");
  const helper = r.slice(r.indexOf("const siteFreeFor ="), r.indexOf('app.get("/api/exec-queue/lanes"'));
  assert.match(helper, /beforeSql = "NULL::timestamptz"/);
  assert.match(helper, /AND \(\$\{beforeSql\} IS NULL OR x\.created_at <= \$\{beforeSql\}\)\s+AND \$\{queueRank\("x"\)\} < \$\{queueRank\(e\)\}/);
  assert.match(r, /siteFreeFor\("e", "e\.site_k", lanes, "\$2::timestamptz"\)/);
  assert.match(r, /\[execIdentity\(req\), candidate\.id, candidate\.site, before\],/);
});
