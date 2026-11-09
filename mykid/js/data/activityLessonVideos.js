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
    explore: [
      {
        videoId: "DGxv3M2vog0",
        title: "نطق أيام الأسبوع — مس إلهام",
      },
      {
        videoId: "whG2Cmojejs",
        title: "أبجد هوز · أغنية أيام الأسبوع",
      },
    ],
  },
  months: {
    explore: {
      videoId: "am65jdDs2Pk",
      title: "أبجد هوز · أشهر السنة",
    },
  },
  family: {
    explore: [
      {
        videoId: "flyN1BahTR0",
        title: "معرفة أفراد العائلة بالبطاقات — مس إلهام",
      },
      {
        videoId: "4ALfbwkNb3g",
        title: "أبجد هوز · أفراد العائلة وكلمات أساسية",
      },
    ],
  },
  body: {
    explore: {
      videoId: "MeUWxyS5hF8",
      title: "أبجد هوز · أجزاء الجسم والوجه",
    },
  },
  senses: {
    explore: {
      videoId: "5Axm4E5qZqI",
      title: "أبجد هوز · الحواس الخمس",
    },
  },
  transport: {
    explore: {
      videoId: "jEROtSzDv6I",
      title: "أبجد هوز · وسائل المواصلات",
    },
  },
  birds: {
    explore: {
      videoId: "IhnVsNo84vU",
      title: "قناة أسرتنا · أنشودة الطيور",
    },
  },
  insects: {
    explore: {
      videoId: "T1O-k06fY_c",
      title: "تعلم مع نور · أسماء الحشرات باللغة العربية",
    },
  },
  words: {
    explore: {
      videoId: "LqA91IiEZEE",
      title: "أبجد هوز · الكلمات الأولى باللهجة المصرية",
    },
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
