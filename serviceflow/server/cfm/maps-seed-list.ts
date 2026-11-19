// قايمة خرايط الأوتوكاد اللى بتتسجّل كصور فى برنامج الكوابل — ملف لوحده (من غير القاعدة) عشان الاختبار يقراه.
/**
 * خرايط من ملفات الأوتوكاد (المالك ٢٠٢٦-١١-١٩: «هتاخد اسكرين شوت لكل خريطة وتحفظها كصورة فى برنامج الكوابل»):
 * كل ملف DWG اتحوّل لصورة WebP (scripts/dwg-maps/) — والخريطة بتتسجّل بصورتها من غير تفريغ لحد ما يتعمل.
 * كل واحدة بتتسجّل مرة واحدة بس (map_key)، فلو اتعدّلت أو اتمسحت من الشاشة مابترجعش.
 */
export interface SeedMap { key: string; central: string; cabinet: string; title: string; images: { file: string; caption: string }[] }
export const DWG_SEED_MAPS: SeedMap[] = [
  ...["1-1", "1-2", "2-1", "2-2", "3-1", "3-2"].map((c) => ({
    key: `dergndla-${c.replace("-", ".")}`, central: "دير الجنادلة", cabinet: c.replace("-", "."),
    title: `ELECTRIC SECONDARY DIAGRAM — دير الجنادلة ${c}`,
    images: [{ file: `dergndla/sec-${c}.webp`, caption: `الشبكة الثانوية — كابينة ${c} (من ملف الأوتوكاد ${c}DRGNDEL.dwg)` }],
  })),
  {
    key: "dergndla-primary", central: "دير الجنادلة", cabinet: "الشبكة الابتدائية", title: "ELECTRIC PRIMARY DIAGRAM — دير الجنادلة",
    images: [1, 2, 3].map((n) => ({ file: `dergndla/primary-${n}.webp`, caption: `الشبكة الابتدائية C NO:${n} (من ملف الأوتوكاد CABLE-${n}.dwg)` })),
  },
];
