// روابط فيديوهات الأرقام المرتبطة مباشرة بدرس الرقم في معلّم الأرقام.
const DIRECT_VIDEOS = {
  1: {
    youtubeId: "A_Ovz5hLbeU",
    title: "كتابة Number One للأطفال — مس إلهام",
  },
  2: {
    youtubeId: "qO96SvRAG5w",
    title: "كتابة Number (2) للأطفال — مس إلهام",
  },
};

export function getNumberLessonVideo(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 10) return null;

  const direct = DIRECT_VIDEOS[number];
  if (direct) return { kind: "embed", ...direct };

  return {
    kind: "channel-search",
    url: `https://www.youtube.com/@Miss_Elham/search?query=number%20${number}`,
  };
}
