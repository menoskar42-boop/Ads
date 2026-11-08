// فيديوهات الحروف العربية المطابقة للحرف الحالي من قناة أبجد هوز.
const DIRECT_VIDEOS = {
  "أ": { videoId: "wi0BH6LiyRo", title: "حرف الألف للأطفال | ألف أ أرنب" },
  "ب": { videoId: "nKM1yo-7Abc", title: "حرف الباء للأطفال | باء بطة" },
  "ت": { videoId: "SbCoTT0bO5Q", title: "حرف التاء للأطفال | تاء تمساح" },
  "ث": { videoId: "DcvV-McdEG4", title: "حرف الثاء للأطفال | ثاء ثعبان" },
  "ج": { videoId: "_fKC8sYdWD4", title: "حرف الجيم للأطفال | جيم جمل" },
  "ح": { videoId: "zW2myzQO0TY", title: "حرف الحاء للأطفال | حاء حصان" },
  "خ": { videoId: "UQbJq8UIWfE", title: "حرف الخاء للأطفال | خاء خروف" },
  "د": { videoId: "b9-ve3ZWjEQ", title: "حرف الدال للأطفال | دال ديك" },
  "ذ": { videoId: "pYEacceQed0", title: "حرف الذال للأطفال | ذال ذئب" },
  "ر": { videoId: "4kRZInbEcq8", title: "حرف الراء للأطفال | راء راكون" },
  "ز": { videoId: "4CRgJzkB8TI", title: "حرف الزاي للأطفال | زاي زرافة" },
  "س": { videoId: "wiChkzkBzUM", title: "حرف السين للأطفال | سين سرير" },
  "ش": { videoId: "IzALBAQvHt4", title: "حرف الشين للأطفال | شين شبل" },
  "ص": { videoId: "KRqhl-9FiUQ", title: "حرف الصاد للأطفال | صاد صقر" },
  "ض": { videoId: "FS-Ea_Uq6RE", title: "تعليم نطق حرف الضاد للأطفال" },
  "ط": { videoId: "bjsVDvmVVUA", title: "لعبة ترتيب الخضار للأطفال | تعليم حرف الطاء" },
  "ظ": { videoId: "98_YXH1RjLo", title: "تعليم حرف الظاء للأطفال" },
  "ع": { videoId: "4K6HJF-2wg8", title: "تعليم حرف العين للأطفال | عين عنب" },
  "غ": { videoId: "N6pKoax5oPQ", title: "تعليم حرف الغين للأطفال | غين غابة" },
  "ف": { videoId: "acb0O7-tDyo", title: "تعليم حرف الفاء للأطفال | فاء فراشة" },
  "ق": { videoId: "Zun1i013opM", title: "تعليم حرف القاف للأطفال | قاف قرد" },
  "ك": { videoId: "jM4kcmNdtUI", title: "حرف الكاف للأطفال | كاف كلب" },
  "ل": { videoId: "ss8uW1UFpHw", title: "تعليم حرف اللام للأطفال" },
  "م": { videoId: "3tBOIkN3ZSo", title: "حرف الميم للأطفال | ميم موز" },
  "ن": { videoId: "jO6xvndk8EE", title: "حرف النون للأطفال | نون نحلة" },
  "ه": { videoId: "DNvXZBK00tg", title: "حرف الهاء للأطفال | هاء هدية" },
  "و": { videoId: "1ag78ymrmSA", title: "حرف الواو للأطفال | واو ولد" },
  "ي": { videoId: "ouYxNGf8frU", title: "حرف الياء للأطفال | ياء يوم" },
};

export function getArabicLetterLessonVideo(letter) {
  return DIRECT_VIDEOS[String(letter || "").trim()] || null;
}
