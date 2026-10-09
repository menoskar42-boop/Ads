// روابط دروس الحروف الإنجليزية المطابقة للحرف الحالي في معلّم الحروف.
const DIRECT_VIDEOS = {
  A: {
    videoId: "3_icknhN4_k",
    title: "حواديت الفونكس: صوت حرف A — مس إلهام",
  },
  B: {
    videoId: "zDp6dgfSz64",
    title: "كتابة حرف B للأطفال — مس إلهام",
  },
  C: {
    videoId: "gTZ4pvyDvQo",
    title: "كتابة حرف C للأطفال — مس إلهام",
  },
  D: {
    videoId: "PLYt_9mLZNo",
    title: "كتابة حرف D للأطفال — مس إلهام",
  },
  E: {
    videoId: "81Zhgz2xCQc",
    title: "كتابة حرف E للأطفال — مس إلهام",
  },
  F: {
    videoId: "g47ND6zgNko",
    title: "كتابة حرف F للأطفال — مس إلهام",
  },
  G: {
    videoId: "HWlE4ZUJCnE",
    title: "كتابة حرف G للأطفال — مس إلهام",
  },
  H: {
    videoId: "g6MlfKU2Y0I",
    title: "كتابة حرف H للأطفال — مس إلهام",
  },
  I: {
    videoId: "Me9ZgFfg_jI",
    title: "كتابة حرف I للأطفال — مس إلهام",
  },
  J: {
    videoId: "o3gr1O5MOBg",
    title: "كتابة حرف J للأطفال — مس إلهام",
  },
  // فيديو K يتضمن قصة غير موصوفة، وفيديو L يتضمن حديثًا؛ لن يُعرضا دون التحقق من خلوهما من محتوى ديني.
  M: {
    videoId: "PD9b7T0je_Q",
    title: "كتابة حرف M للأطفال — مس إلهام",
  },
  N: {
    videoId: "OuV6mk9d9tU",
    title: "كتابة حرف N للأطفال — مس إلهام",
  },
  O: {
    videoId: "7OUgqgHxoB0",
    title: "كتابة حرف O للأطفال — مس إلهام",
  },
  P: {
    videoId: "4u2h9ak6_zE",
    title: "كتابة حرف P للأطفال — مس إلهام",
  },
  Q: {
    videoId: "ofCsEBjU7jw",
    title: "كتابة حرف Q للأطفال — مس إلهام",
  },
  R: {
    videoId: "5lbee4V0TTA",
    title: "كتابة حرف R للأطفال — مس إلهام",
  },
  S: {
    videoId: "ZyKoT5HsdDI",
    title: "كتابة حرف S للأطفال — مس إلهام",
  },
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
  X: {
    videoId: "wNeM7xZXqYM",
    title: "كتابة حرف X للأطفال — مس إلهام",
  },
  Y: {
    videoId: "rAwJrvmcY2o",
    title: "كتابة حرف Y للأطفال — مس إلهام",
  },
  Z: {
    videoId: "u8VmrIe2PWc",
    title: "كتابة حرف Z للأطفال — مس إلهام",
  },
};

export function getEnglishLetterLessonVideo(letter) {
  const key = String(letter || "").trim().toUpperCase();
  return DIRECT_VIDEOS[key] || null;
}
