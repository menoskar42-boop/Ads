// ===== تتبّع أحداث مخصّصة في Google Analytics (اختياري وآمن) =====
// يرسل أحداثاً مجرّدة (بلا أي بيانات شخصية عن الطفل: لا اسم ولا صوت)
// فقط إن كان وسم GA مفعّلاً (window.gtag موجود). وإلا لا يفعل شيئاً بهدوء.
export function track(event, params = {}) {
  try {
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", event, params);
    }
  } catch (e) {
    /* نتجاهل بهدوء — التتبّع لا يجب أن يكسر التطبيق أبداً */
  }
}
