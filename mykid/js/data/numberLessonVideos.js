// روابط فيديوهات الأرقام المرتبطة مباشرة بدرس الرقم في معلّم الأرقام.
const DIRECT_VIDEOS = {
  1: {
    videoId: "A_Ovz5hLbeU",
    title: "كتابة Number One للأطفال — مس إلهام",
  },
  2: {
    videoId: "qO96SvRAG5w",
    title: "كتابة Number (2) للأطفال — مس إلهام",
  },
};

export function getNumberLessonVideo(value) {
  const number = Number(value);
  if (!Number.isInteger(number)) return null;
  return DIRECT_VIDEOS[number] || null;
}
