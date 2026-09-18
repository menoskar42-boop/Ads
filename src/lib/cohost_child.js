// تشغيل تطبيق مستضاف كعملية ابنة، وإبقاؤه شغّال.
//
// الجزء ده كان مكتوب بالكامل جوّه server.js لـmybible. ومع إضافة تطبيق
// تاني (Service Flow) كان الاختيار بين نسخ ستين سطر من منطق إعادة
// التشغيل، أو استخراجه مرة واحدة. النسخ هو اللي بيخلّي تطبيق ياخد
// إصلاح والتاني لأ من غير ما حد ياخد باله.
//
// السلوك زي ما كان بالظبط:
//   · العملية الابنة بتاخد بيئتها الخاصة (قاعدتها وسرّها وبورتها) عشان
//     ما تتلخبطش مع أوسكار ديفز.
//   · لو وقعت — انهيار، نفاد ذاكرة، عطسة في الـVM — بترجع تلقائياً
//     بتأخير متزايد (ثانية → ٣٠ ثانية كحد أقصى) بدل ما تسيب 502
//     للمستخدمين. وعملية عاشت أكتر من دقيقة بصحة بتصفّر العدّاد، فالانهيار
//     العابر مايراكمش تأخير.
//   · وعند إيقاف أوسكار ديفز بشكل نظيف، الابنة بتتقفل معاه من غير إعادة
//     تشغيل.
'use strict';
const fs = require('fs');
const { spawn } = require('child_process');

const MAX_BACKOFF_MS = 30000;
const HEALTHY_AFTER_MS = 60000;

/**
 * @param {object} o
 * @param {string} o.name      اسم للّوجات (mybible / serviceflow)
 * @param {string} o.dist      مسار ملف التشغيل (dist/index.cjs)
 * @param {string} o.cwd       مجلد التطبيق
 * @param {object} o.env       بيئة العملية الابنة كاملة
 * @returns {{stop: () => void} | null}  null لو ملف التشغيل مش موجود
 */
function launchCoHostedApp({ name, dist, cwd, env }) {
  if (!fs.existsSync(dist)) {
    console.warn(`[co-host] ${name}: مش لاقي ${dist} — التطبيق مش متبني. اتخطّيته.`);
    return null;
  }

  let restarts = 0;
  let shuttingDown = false;
  let child = null;
  let pendingRestart = null;

  const launch = () => {
    /* لازم يتشاف هنا كمان مش في `exit` بس.
     *
     * الغلط: `stop()` كانت بتحط `shuttingDown` وتقتل الابنة الحالية —
     * لكن لو كان فيه إعادة تشغيل **مجدولة** بالفعل (العملية وقعت
     * وبنستنى التأخير)، الـ`setTimeout` بيولع بعدها وبيشغّل عملية
     * جديدة بعد ما أوسكار ديفز خلاص قرّر يقفل. النتيجة عملية يتيمة
     * بتقوم أثناء الإغلاق. */
    if (shuttingDown) return;
    pendingRestart = null;
    const startedAt = Date.now();
    child = spawn(process.execPath, [dist], { cwd, stdio: 'inherit', env });
    child.on('exit', (code, signal) => {
      if (shuttingDown) return;
      if (Date.now() - startedAt > HEALTHY_AFTER_MS) restarts = 0;
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, restarts));
      restarts += 1;
      console.error(`[co-host] ${name} exited (code=${code} signal=${signal}) — `
        + `restarting in ${delay}ms (attempt ${restarts})`);
      pendingRestart = setTimeout(launch, delay);
    });
    child.on('error', (err) => console.error(`[co-host] ${name} spawn error:`, err));
  };

  const stop = () => {
    shuttingDown = true;
    if (pendingRestart) { clearTimeout(pendingRestart); pendingRestart = null; }
    if (child) { try { child.kill(); } catch (_) {} }
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  launch();
  return { stop };
}

module.exports = { launchCoHostedApp, MAX_BACKOFF_MS, HEALTHY_AFTER_MS };
