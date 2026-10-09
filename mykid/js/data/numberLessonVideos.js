// روابط فيديوهات الأرقام المرتبطة مباشرة بدرس الرقم في معلّم الأرقام.
const DIRECT_VIDEOS = {
  0: {
    videoId: "DQNbBA9UKyY",
    title: "كتابة Number Zero للأطفال — مس إلهام",
  },
  1: {
    videoId: "A_Ovz5hLbeU",
    title: "كتابة Number One للأطفال — مس إلهام",
  },
  2: {
    videoId: "qO96SvRAG5w",
    title: "كتابة Number (2) للأطفال — مس إلهام",
  },
  3: {
    videoId: "Vf5BV38-9ak",
    title: "أسهل وأبسط طريقة كتابة Number (3) للأطفال — مس إلهام",
  },
  4: {
    videoId: "Bl4RESdgoio",
    title: "أسهل وأبسط طريقة لكتابة Number (4) للأطفال — مس إلهام",
  },
  5: {
    videoId: "O-H6QBnNeLA",
    title: "طريقة ممتازة لكتابة Number (5) للأطفال — مس إلهام",
  },
};

export function getNumberLessonVideo(value) {
  const number = Number(value);
  if (!Number.isInteger(number)) return null;
  return DIRECT_VIDEOS[number] || null;
}
