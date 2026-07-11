export interface Governorate {
  en: string;
  ar: string;
}

export const EGYPT_GOVERNORATES: Governorate[] = [
  { en: 'Asyut',        ar: 'أسيوط'         },
  { en: 'Cairo',        ar: 'القاهرة'        },
  { en: 'Giza',         ar: 'الجيزة'         },
  { en: 'Alexandria',   ar: 'الإسكندرية'     },
  { en: 'Qalyubia',     ar: 'القليوبية'      },
  { en: 'Sharqia',      ar: 'الشرقية'        },
  { en: 'Dakahlia',     ar: 'الدقهلية'       },
  { en: 'Beheira',      ar: 'البحيرة'        },
  { en: 'Gharbia',      ar: 'الغربية'        },
  { en: 'Monufia',      ar: 'المنوفية'       },
  { en: 'Kafr el-Sheikh', ar: 'كفر الشيخ'   },
  { en: 'Damietta',     ar: 'دمياط'          },
  { en: 'Ismailia',     ar: 'الإسماعيلية'   },
  { en: 'Port Said',    ar: 'بورسعيد'        },
  { en: 'Suez',         ar: 'السويس'         },
  { en: 'North Sinai',  ar: 'شمال سيناء'    },
  { en: 'South Sinai',  ar: 'جنوب سيناء'    },
  { en: 'Faiyum',       ar: 'الفيوم'         },
  { en: 'Beni Suef',    ar: 'بني سويف'       },
  { en: 'Minya',        ar: 'المنيا'         },
  { en: 'Sohag',        ar: 'سوهاج'          },
  { en: 'Qena',         ar: 'قنا'            },
  { en: 'Luxor',        ar: 'الأقصر'         },
  { en: 'Aswan',        ar: 'أسوان'          },
  { en: 'Red Sea',      ar: 'البحر الأحمر'  },
  { en: 'New Valley',   ar: 'الوادي الجديد' },
  { en: 'Matruh',       ar: 'مطروح'          },
];

export const DEFAULT_GOVERNORATE_EN = 'Asyut';
export const DEFAULT_GOVERNORATE_AR = 'أسيوط';
