// فيديوهات ميس ريم للحروف العربية التي لها درس مطابق.
const DIRECT_VIDEOS = {
  "أ": { videoId: "W-S495O34NY", title: "شرح حرف الالف أ نور البيان - اسس طفلك صح" },
  "ت": { videoId: "RhPkqMYWD_w", title: "حرف التاء بشرح مبسط لاطفال" },
  "ج": { videoId: "qsg97XxLnQU", title: "اقوي شرح لحرف الجيم (  ج ) لاطفال" },
};

export function getArabicLetterReemVideo(letter) {
  return DIRECT_VIDEOS[String(letter || "").trim()] || null;
}
