#!/usr/bin/env node
/**
 * A reminder that went nowhere.
 *
 * Two halves of the same gap. The scheduler could only express «every N
 * minutes», so «فكّرني الساعة ٥» had to become a repeating task that keeps
 * firing after the thing it was about has passed — and the user turns
 * reminders off. And when one did fire, the result was written into the
 * schedule's own row. Nobody reads a row. A reminder nobody receives is not a
 * reminder; it is a database update with good intentions.
 *
 * So a schedule is a MOMENT or a RHYTHM — a one-shot deactivates itself when it
 * runs — and every run leaves something the user can actually see: an inbox row
 * that survives a closed app, and a message in the conversation.
 *
 * A time already past is refused rather than fired immediately: «الساعة ٥»
 * typed at six is a typo, and firing at once is the least useful reading of it.
 *
 *   node scripts/check-reminders.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const S = require('../sokro/scheduler');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

/* ── A moment, or a rhythm ─────────────────────────────────────────────── */
{
  const soon = new Date(Date.now() + 3600000).toISOString();
  const once = S.parseWhen({ runAt: soon });
  check('ميعاد محدد بيبقى مرة واحدة', once.kind === 'once' && once.runAt instanceof Date);
  check('و«كل N دقيقة» لسه شغّالة', S.parseWhen({ everyMinutes: 30 }).kind === 'recurring');
  check('والرقم الصغير بيتحدّ', S.parseWhen({ everyMinutes: 1 }).everyMinutes === 5);
  check('والكبير كمان', S.parseWhen({ everyMinutes: 999999 }).everyMinutes === 7 * 24 * 60);
  // The reading nobody wants: fire the moment it is created.
  check('وميعاد عدّى بيترفض مش بيشتغل حالاً', S.parseWhen({ runAt: '2001-01-01T10:00:00Z' }).error === 'past');
  check('ووقت مش مفهوم بيترفض', S.parseWhen({ runAt: 'يوم الخميس' }).error === 'bad_time');
  check('والقديم (رقم لوحده) لسه بيشتغل', S.parseWhen(45).kind === 'recurring');
}

/* ── What happens after it runs ────────────────────────────────────────── */
{
  const after = S.afterRun({ kind: 'once' }, new Date());
  check('المرة الواحدة بتقفل نفسها', after.active === false && after.nextRunAt === null);
  const rec = S.afterRun({ kind: 'recurring', every_minutes: 30 }, new Date('2026-01-01T10:00:00Z'));
  check('والمتكررة بتتحرك بفترتها هي', rec.active === true && rec.nextRunAt.toISOString() === '2026-01-01T10:30:00.000Z');
  check('ومن غير فترة ليها افتراضي معقول', S.afterRun({ kind: 'recurring' }, new Date()).active === true);
}

/* ── The channel ───────────────────────────────────────────────────────── */
{
  const seen = [];
  const db = { query: async (sql, args) => { seen.push({ sql, args }); return { rows: [{ id: 1 }] }; } };
  return_check();
  async function return_check() {
    await S.deliver(db, 7, { title: 'تذكير', body: 'ميعاد الدكتور', meta: { scheduleId: 3 } });
    check('التسليم بيكتب في صندوق الإشعارات', /INSERT INTO sokro_notifications/.test(seen[0].sql));
    check('وباسم صاحبه', seen[0].args[0] === 7);
    check('وبعنوان ونص', seen[0].args[1] === 'تذكير' && seen[0].args[2] === 'ميعاد الدكتور',
      JSON.stringify(seen[0].args));

    /* ── And the scheduler uses it ───────────────────────────────────── */
    const sch = code('sokro/scheduler/index.js');
    check('الجدولة بتسلّم بعد كل تشغيلة', /await deliver\(pool, s\.user_id/.test(sch));
    check('وبتكتب في المحادثة كمان', /memory\.addMessage\(conv\.id, 'assistant'/.test(sch));
    {
      // The bookkeeping UPDATE has to survive a delivery that threw — otherwise a
      // failed notification leaves the schedule due forever, firing every tick.
      const iTry = sch.indexOf('await deliver(pool, s.user_id');
      const iCatch = sch.indexOf('catch', iTry);
      const iAfter = sch.indexOf('const after = afterRun(s,');
      check('وفشل التسليم مايضيّعش حسابات الجدولة',
        iTry > -1 && iCatch > iTry && iAfter > iCatch, `deliver@${iTry} catch@${iCatch} update@${iAfter}`);
    }
    check('والتحديث بياخد قرار `afterRun`', /const after = afterRun\(s, new Date\(\)\)/.test(sch));
    check('ومفيش الحساب القديم اللي بيتجاهل النوع',
      !/next_run_at = now\(\) \+ \(every_minutes \|\| ' minutes'\)::interval, last_result/.test(sch));

    const schema = code('sokro/schema.js');
    check('وفيه جدول للإشعارات', /CREATE TABLE IF NOT EXISTS sokro_notifications/.test(schema));
    check('وفهرس للّي مااتقراش', /sokro_notif_unread_idx/.test(schema));
    check('وعمود نوع الجدولة', /ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'recurring'/.test(schema));

    const router = code('sokro/router.js');
    check('والراوتر بيقبل ميعاد محدد', /\{ runAt: b\.runAt \|\| b\.at, everyMinutes: b\.everyMinutes \}/.test(router));
    check('وبيرد برسالة مفهومة على ميعاد عدّى', /الميعاد ده عدّى خلاص/.test(router));
    check('وفيه راوت للإشعارات', /router\.get\('\/api\/notifications'/.test(router));
    check('وراوت للتعليم كمقروء', /router\.post\('\/api\/notifications\/:id\/read'/.test(router));
    check('والتعليم متقيّد بصاحبه', /WHERE id=\$1 AND user_id=\$2 AND read_at IS NULL/.test(code('sokro/scheduler/index.js')));

    const ui = fs.readFileSync(path.join(ROOT, 'sokro/ui/app.html'), 'utf8');
    check('والتطبيق فيه جرس بيتحدّث', /fetch\('\/api\/notifications\?limit=20'\)/.test(ui) && /setInterval\(refreshNotifs/.test(ui));
    check('والضغط عليه بيعرضها ويعلّمها مقروءة', /\/api\/notifications\/'\+n\.id\+'\/read'/.test(ui));

    console.log(fail
      ? `\n${fail} مشكلة — يعني تذكير ممكن يشتغل ومحدش يعرف.`
      : '\nالتذكير له ميعاد، وبيوصل: صندوق بيفضل، ورسالة في المحادثة.');
    process.exit(fail ? 1 : 0);
  }
}
