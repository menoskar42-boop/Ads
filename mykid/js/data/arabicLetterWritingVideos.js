// فيديوهات كتابة الحروف العربية من قناة مدرسة زاد الحروف (تعلم مع سراج).
const DIRECT_VIDEOS = {
  "أ": { videoId: "DKihnmvn-YQ", title: "كتابة حرف الألف - تعلم مع سراج" },
  "ب": { videoId: "NFVJSYyYhl8", title: "كتابة حرف الباء - تعلم مع سراج" },
  "ت": { videoId: "OJQgshvXNh8", title: "كتابة حرف التاء - تعلم مع سراج" },
  "ث": { videoId: "syxBBbxHE0k", title: "كتابة حرف الثاء - تعلم مع سراج" },
  "ج": { videoId: "Q3Qz3RpIk0g", title: "كتابة حرف الجيم - تعلم مع سراج" },
  "ح": { videoId: "htG2Cew-MN0", title: "كتابة حرف الحاء - تعلم مع سراج" },
  "خ": { videoId: "X60zWHPRlCI", title: "كتابة حرف الخاء - تعلم مع سراج" },
  "د": { videoId: "hKNiOzhJ1og", title: "كتابة حرف الدال - تعلم مع سراج" },
  "ذ": { videoId: "nyvX-frwX9A", title: "كتابة حرف الذال - تعلم مع سراج" },
  "ر": { videoId: "apYtS2arnvc", title: "كتابة حرف الراء - تعلم مع سراج" },
  "ز": { videoId: "W9DGGDfg_X0", title: "كتابة حرف الزاي - تعلم مع سراج" },
  "س": { videoId: "UK0ZZBzuMZk", title: "كتابة حرف السين - تعلم مع سراج" },
  "ش": { videoId: "vlfgr7SqSfI", title: "كتابة حرف الشين - تعلم مع سراج" },
  "ص": { videoId: "f5uwhk6COEA", title: "كتابة حرف الصاد - تعلم مع سراج" },
  "ض": { videoId: "QwkicCNfFzM", title: "كتابة حرف الضاد - تعلم مع سراج" },
  "ط": { videoId: "YapcfKJj3pg", title: "كتابة حرف الطاء - تعلم مع سراج" },
  "ظ": { videoId: "CMWYbeBMRMw", title: "كتابة حرف الظاء - تعلم مع سراج" },
  "ع": { videoId: "qq20RdN0XCs", title: "كتابة حرف العين - تعلم مع سراج" },
  "غ": { videoId: "tsM3EYBYRRQ", title: "كتابة حرف الغين - تعلم مع سراج" },
  "ف": { videoId: "qtGfHwZ7TMc", title: "كتابة حرف الفاء - تعلم مع سراج" },
  "ق": { videoId: "ZIqIKGA4fk0", title: "كتابة حرف القاف - تعلم مع سراج" },
  "ك": { videoId: "bkhrAmbUXYw", title: "كتابة حرف الكاف - تعلم مع سراج" },
  "ل": { videoId: "6y7dOBLqS1s", title: "كتابة حرف اللام - تعلم مع سراج" },
  "م": { videoId: "xeF6Zvun84M", title: "كتابة حرف الميم - تعلم مع سراج" },
  "ن": { videoId: "aWMR8QkYCyU", title: "كتابة حرف النون - تعلم مع سراج" },
  "ه": { videoId: "bAYqYO7wxX8", title: "كتابة حرف الهاء - تعلم مع سراج" },
  "و": { videoId: "gUp0ORkrxbs", title: "كتابة حرف الواو - تعلم مع سراج" },
  "ي": { videoId: "uBuOkgOqO3w", title: "كتابة حرف الياء - تعلم مع سراج" },
};

export function getArabicLetterWritingVideo(letter) {
  return DIRECT_VIDEOS[String(letter || "").trim()] || null;
}
