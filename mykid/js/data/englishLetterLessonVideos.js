// روابط دروس الحروف الإنجليزية المطابقة للحرف الحالي في معلّم الحروف.
const DIRECT_VIDEOS = {
  T: {
    videoId: "BCTE_aDfOb0",
    title: "كتابة الحرف T للأطفال — مس إلهام",
  },
  U: {
    videoId: "VBNX2KGnEGc",
    title: "كتابة الحرف U للأطفال — مس إلهام",
  },
  V: {
    videoId: "SmPXiHbXhwU",
    title: "كتابة الحرف V للأطفال — مس إلهام",
  },
  W: {
    videoId: "7XdgmLZEPwY",
    title: "كتابة الحرف W للأطفال — مس إلهام",
  },
};

export function getEnglishLetterLessonVideo(letter) {
  const key = String(letter || "").trim().toUpperCase();
  return DIRECT_VIDEOS[key] || null;
}
