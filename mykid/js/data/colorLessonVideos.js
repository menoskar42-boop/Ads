// فيديوهات الألوان المناسبة للأنشطة الموجودة بالفعل في Safari Kids.
const DIRECT_VIDEOS = {
  explore: {
    videoId: "gn81A7aJVic",
    title: "لعبة ممتعة لحفظ الألوان — مس إلهام",
  },
  coloring: {
    videoId: "f7IErJrxwPA",
    title: "تعليم الألوان بالصلصال — مس إلهام",
  },
};

export function getColorLessonVideo(activity) {
  return DIRECT_VIDEOS[activity] || null;
}
