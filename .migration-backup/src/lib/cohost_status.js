// ليه التطبيق المستضاف مش رادّ.
//
// البوّاب لما بيلاقي البورت الداخلي مقفول بيرجّع ٥٠٢ — والرسالة كانت
// «التطبيق المستضاف مؤقتاً غير متاح» لكل الحالات. وده بيخلّي أربع حالات
// مختلفة تماماً تبان واحدة:
//
//   · التطبيق مااتبناش (dist مش موجود بعد نشر فشل بناؤه)
//   · متغيّر إلزامي ناقص فمااتشغّلش أصلاً
//   · بيقوم وبيقع في حلقة
//   · شغّال بس علّق في اللحظة دي
//
// الأولى والتانية **مش مؤقتين** — «حاول تاني بعد لحظات» كذب فيهم.
// وصاحب الموقع هو اللي بيفتح الصفحة، فالصفحة أنسب مكان تقوله السبب.
'use strict';

const statuses = new Map();   // host -> { app, state, reason }

/** يسجّل ليه تطبيق مستضاف مش هيرد على النطاق ده. */
function setCoHostStatus(host, status) {
  if (!host) return;
  statuses.set(String(host).toLowerCase(), status);
}

/** يرجّع الحالة المسجّلة، أو null لو مفيش. */
function getCoHostStatus(host) {
  return statuses.get(String(host || '').toLowerCase()) || null;
}

/** نص عربي للمستخدم + هل الحالة مؤقتة ولا محتاجة تدخّل. */
function describeCoHostStatus(status) {
  if (!status) {
    return { permanent: false, text: 'التطبيق المستضاف مؤقتاً غير متاح — حاول تاني بعد لحظات.' };
  }
  const app = status.app || 'التطبيق المستضاف';
  switch (status.state) {
    case 'not-built':
      return { permanent: true, text: `${app}: مش متبني — ملف التشغيل مش موجود. `
        + 'البناء فشل في آخر نشر. شوف لوج البناء.' };
    case 'missing-config':
      return { permanent: true, text: `${app}: ناقصه إعداد إلزامي (${status.reason || 'غير محدّد'}) `
        + 'فمااتشغّلش. حطّه وأعد النشر.' };
    case 'gave-up':
      if (status.reason === 'config') {
        return { permanent: true, text: `${app}: إعداده غلط فمابيقومش — `
          + 'غالباً رابط قاعدة البيانات. شوف [WRONG DATABASE] في اللوج، صلّحه، '
          + 'وأعد النشر. (مش هنعيد المحاولة: كل محاولة بتاخد اتصالات من القاعدة '
          + 'المشتركة.)' };
      }
      return { permanent: true, text: `${app}: وقع ${status.reason || 'كذا'} مرة ورا بعض `
        + 'وقت الإقلاع، فبطّلنا نحاول. ده انهيار حتمي — شوف اللوج، صلّحه، '
        + 'وأعد النشر.' };
    case 'running':
      return { permanent: false, text: `${app}: شغّال بس مش رادّ دلوقتي — `
        + 'يمكن بيعيد التشغيل. حاول تاني بعد لحظات.' };
    default:
      return { permanent: false, text: `${app}: غير متاح مؤقتاً — حاول تاني بعد لحظات.` };
  }
}

module.exports = { setCoHostStatus, getCoHostStatus, describeCoHostStatus };
