// مقاطع تعليمية مرتبطة بأنشطة Safari Kids الموجودة بالفعل.
const ACTIVITY_VIDEOS = {
  colors: {
    explore: [
      {
        videoId: "gn81A7aJVic",
        title: "لعبة ممتعة لحفظ الألوان — مس إلهام",
      },
      {
        videoId: "YoOxfoJhQm4",
        title: "أبجد هوز · تعليم الألوان بالعامية المصرية",
      },
    ],
    coloring: {
      videoId: "f7IErJrxwPA",
      title: "تعليم الألوان بالصلصال — مس إلهام",
    },
  },
  animals: {
    explore: [
      {
        videoId: "bJ3EWyZQyl0",
        title: "أبجد هوز · أسماء وأصوات حيوانات المزرعة",
      },
      {
        videoId: "Lud5hiIvcfw",
        title: "أبجد هوز · الحيوانات البرية",
      },
    ],
  },
  fish: {
    explore: [
      {
        videoId: "1t2m7Keo6JU",
        title: "أبجد هوز · الحيوانات البحرية",
      },
      {
        videoId: "wb1DPUKCZcI",
        title: "أبجد هوز · كبير وصغير في عالم البحر",
      },
    ],
  },
  shapes: {
    explore: [
      {
        videoId: "ldTkRB6Xbp4",
        title: "أبجد هوز · تعليم الأشكال للأطفال",
      },
    ],
  },
  fruits: {
    explore: [
      {
        videoId: "NK25HK_0I48",
        title: "أبجد هوز · نطق أسماء الفاكهة والألوان",
      },
      {
        videoId: "G7QpNappaz4",
        title: "أبجد هوز · نطق أسماء الخضار والألوان",
      },
    ],
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
  return getActivityLessonVideos(datasetKey, activityKey)[0] || null;
}

export function getActivityLessonVideos(datasetKey, activityKey) {
  const videos = ACTIVITY_VIDEOS[datasetKey]?.[activityKey];
  if (!videos) return [];
  return Array.isArray(videos) ? videos : [videos];
}
