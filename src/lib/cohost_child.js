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
/* بعد كام محاولة فاشلة ورا بعض نبطّل نحاول.
 *
 * 🐛 الغلط اللي الحد ده اتضاف عشانه: تطبيق بيقع وقت الإقلاع **في كل مرة**
 * (خطأ قيد في القاعدة مثلاً) كان بيفضل يتشغّل ويقع كل ٣٠ ثانية للأبد —
 * بيملا اللوج، وبيفتح اتصالات على القاعدة في كل محاولة، وممكن يفشّل فحص
 * الصحة بتاع النشر كله. وإعادة المحاولة معناها «يمكن تعدّي المرة دي»،
 * وده صحيح لانهيار عابر وغلط تماماً لانهيار حتمي.
 *
 * خمس محاولات كفاية تفرّق بين الاتنين: العابر بيعدّي فيهم، والحتمي لأ. */
const MAX_CONSECUTIVE_RESTARTS = 5;

/**
 * @param {object} o
 * @param {string} o.name      اسم للّوجات (mybible / serviceflow)
 * @param {string} o.dist      مسار ملف التشغيل (dist/index.cjs)
 * @param {string} o.cwd       مجلد التطبيق
 * @param {object} o.env       بيئة العملية الابنة كاملة
 * @returns {{stop: () => void} | null}  null لو ملف التشغيل مش موجود
 */
function launchCoHostedApp({ name, dist, cwd, env, onGaveUp }) {
  if (!fs.existsSync(dist)) {
    console.warn(`[co-host] ${name}: مش لاقي ${dist} — التطبيق مش متبني. اتخطّيته.`);
    return null;
  }

  let restarts = 0;
  let gaveUp = false;
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
      restarts += 1;

      if (restarts > MAX_CONSECUTIVE_RESTARTS) {
        gaveUp = true;
        console.error(`[co-host] ${name}: وقع ${restarts} مرات ورا بعض من غير ما `
          + 'يعيش دقيقة واحدة — بطّلت أحاول. ده انهيار حتمي مش عابر، وإعادة '
          + 'المحاولة بتملا اللوج وبتفتح اتصالات على القاعدة من غير فايدة. '
          + 'شوف الخطأ فوق وأعد النشر بعد ما تصلّحه.');
        if (typeof onGaveUp === 'function') {
          try { onGaveUp(restarts); } catch (_) {}
        }
        return;
      }

      const delay = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, restarts - 1));
      console.error(`[co-host] ${name} exited (code=${code} signal=${signal}) — `
        + `restarting in ${delay}ms (attempt ${restarts}/${MAX_CONSECUTIVE_RESTARTS})`);
      pendingRestart = setTimeout(launch, delay);
    });
    child.on('error', (err) => console.error(`[co-host] ${name} spawn error:`, err));
  };

  const stop = () => {
    shuttingDown = true;
    void gaveUp;
    if (pendingRestart) { clearTimeout(pendingRestart); pendingRestart = null; }
    if (child) { try { child.kill(); } catch (_) {} }
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  launch();
  return { stop };
}

module.exports = {
  launchCoHostedApp, MAX_BACKOFF_MS, HEALTHY_AFTER_MS, MAX_CONSECUTIVE_RESTARTS,
};
