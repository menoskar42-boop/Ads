// مقاطع تعليمية مرتبطة بأنشطة Safari Kids الموجودة بالفعل.
const ACTIVITY_VIDEOS = {
  colors: {
    explore: {
      videoId: "gn81A7aJVic",
      title: "لعبة ممتعة لحفظ الألوان — مس إلهام",
    },
    coloring: {
      videoId: "f7IErJrxwPA",
      title: "تعليم الألوان بالصلصال — مس إلهام",
    },
  },
  weekdays: {
    explore: {
      videoId: "DGxv3M2vog0",
      title: "نطق أيام الأسبوع — مس إلهام",
    },
  },
  family: {
    explore: {
      videoId: "flyN1BahTR0",
      title: "معرفة أفراد العائلة بالبطاقات — مس إلهام",
    },
  },
  words: {
    readMatch: {
      videoId: "aTy_6f2NKsc",
      title: "قراءة أول كلمة بدون حفظ — مس إلهام",
    },
  },
};

export function getActivityLessonVideo(datasetKey, activityKey) {
  return ACTIVITY_VIDEOS[datasetKey]?.[activityKey] || null;
}
