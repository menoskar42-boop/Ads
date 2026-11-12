// خريطة الشبكة الثانوية — الغنايم، كابينة 6.7 (J11, K11, J12, K12). اتفرّغت من صورة المالك ٢٠٢٦-١١-١٢.
// ⚠️ الخانات اللى عليها uncertain محتاجة مراجعة على الورقة. التعديل بعد كده من شاشة «الخرائط» (بيتحفظ فى القاعدة).
import type { CableMapData } from "./types";

export const GHANAYEM_6_7_KEY = "ghanayem-6.7";

export const GHANAYEM_6_7: CableMapData = {
  "meta": {
    "central": "الغنايم",
    "cabinet": "6.7",
    "cabinetCodes": "J11, K11, J12, K12",
    "title": "ASSIUT-Elghanayem — Secondary Cable Diagram",
    "maker": "SIEMENS AUSTRIA (TELECOM)",
    "location": "شارع السنترال — بجوار مسجد الغنايم الكبير (Besaid El-Ghanayem Big Mosque)",
    "area": "غنايم - شرق",
    "scale": "None",
    "notes": "الكابينة فيها بلوكات 1 إلى 6 و I · II · III. الكابلات الخارجة من الكابينة: 33. 0/200*/0.4(30*d) · 148. 0/100*/0.4 · 210. 0/200*/0.4 · 82. 0/30*/0.4 · 55. 0/100*/0.4"
  },
  "segments": [
    {
      "from": "CAB",
      "to": "J14",
      "lengthM": 33,
      "pairs": 200,
      "gaugeMm": 0.4,
      "dead": 30,
      "uncertain": true,
      "notes": "ربط الكابل ده بوصلة 14 مستنتج من الأزواج (14 بتطلّع 170 زوج + 30 dead = 200) — يتراجع"
    },
    {
      "from": "CAB",
      "to": "J1",
      "lengthM": 210,
      "pairs": 200,
      "gaugeMm": 0.4,
      "uncertain": true,
      "notes": "ربط الكابل ده بوصلة 1 مستنتج من الأزواج (بلوك 1 و2 = 200 زوج) — يتراجع"
    },
    {
      "from": "CAB",
      "to": "J10",
      "lengthM": 148,
      "pairs": 100,
      "gaugeMm": 0.4,
      "uncertain": true,
      "notes": "ربط الكابل ده بوصلة 10 مستنتج من الأزواج (بلوك 3 = 100 زوج) — يتراجع"
    },
    {
      "from": "CAB",
      "to": "J24",
      "lengthM": 55,
      "pairs": 100,
      "gaugeMm": 0.4,
      "uncertain": true,
      "notes": "ربط الكابل ده بوصلة 24 مستنتج من الأزواج (بلوك 6 = 100 زوج) — يتراجع"
    },
    {
      "from": "CAB",
      "to": "J23",
      "lengthM": 82,
      "pairs": 30,
      "gaugeMm": 0.4,
      "uncertain": true,
      "notes": "ربط الكابل ده بوصلة 23 مستنتج — يتراجع"
    },
    {
      "from": "J14",
      "to": "J15",
      "lengthM": 83,
      "pairs": 150,
      "gaugeMm": 0.4,
      "cablePairs": "1-150"
    },
    {
      "from": "J14",
      "to": "B40",
      "lengthM": 22,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "151-160"
    },
    {
      "from": "J15",
      "to": "B38",
      "lengthM": 25,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "131-140"
    },
    {
      "from": "J15",
      "to": "B39",
      "lengthM": 21,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "141-150"
    },
    {
      "from": "J15",
      "to": "J16",
      "lengthM": 29,
      "pairs": 150,
      "gaugeMm": 0.4,
      "dead": 20,
      "cablePairs": "1-130"
    },
    {
      "from": "J16",
      "to": "B37",
      "lengthM": 24,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "121-130"
    },
    {
      "from": "J16",
      "to": "J17",
      "lengthM": 47,
      "pairs": 150,
      "gaugeMm": 0.4,
      "dead": 30,
      "cablePairs": "1-120"
    },
    {
      "from": "J17",
      "to": "B36",
      "lengthM": 31,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "111-120"
    },
    {
      "from": "J17",
      "to": "J18",
      "lengthM": 44,
      "pairs": 30,
      "gaugeMm": 0.4,
      "cablePairs": "81-110"
    },
    {
      "from": "J17",
      "to": "J19",
      "lengthM": 40,
      "pairs": 100,
      "gaugeMm": 0.4,
      "dead": 20,
      "cablePairs": "1-80"
    },
    {
      "from": "J18",
      "to": "B33",
      "lengthM": 29,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "81-90"
    },
    {
      "from": "J18",
      "to": "B34",
      "lengthM": 19,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "91-100"
    },
    {
      "from": "J18",
      "to": "B35",
      "lengthM": 6,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "101-110",
      "uncertain": true,
      "notes": "مدى الأزواج عند الوصلة مش واضح"
    },
    {
      "from": "J19",
      "to": "B32",
      "lengthM": 26,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "71-80"
    },
    {
      "from": "J19",
      "to": "J20",
      "lengthM": 21,
      "pairs": 20,
      "gaugeMm": 0.4,
      "cablePairs": "51-70"
    },
    {
      "from": "J19",
      "to": "J21",
      "lengthM": 47,
      "pairs": 50,
      "gaugeMm": 0.4,
      "cablePairs": "1-50"
    },
    {
      "from": "J20",
      "to": "B30",
      "lengthM": 34,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "51-60"
    },
    {
      "from": "J20",
      "to": "B31",
      "lengthM": 6,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "61-70"
    },
    {
      "from": "J21",
      "to": "B28",
      "lengthM": 33,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "31-40"
    },
    {
      "from": "J21",
      "to": "B29",
      "lengthM": 16,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "41-50"
    },
    {
      "from": "J21",
      "to": "J22",
      "lengthM": 25,
      "pairs": 30,
      "gaugeMm": 0.4,
      "cablePairs": "1-30"
    },
    {
      "from": "J22",
      "to": "B27",
      "lengthM": 18,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "11-20"
    },
    {
      "from": "J22",
      "to": "B26",
      "lengthM": 7,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "1-10"
    },
    {
      "from": "J10",
      "to": "B25",
      "lengthM": 100,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "81-90"
    },
    {
      "from": "J10",
      "to": "B24",
      "lengthM": 49,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "71-80"
    },
    {
      "from": "J10",
      "to": "J11",
      "lengthM": 85,
      "pairs": 100,
      "gaugeMm": 0.4,
      "dead": 30,
      "cablePairs": "1-70"
    },
    {
      "from": "J11",
      "to": "B23",
      "lengthM": 10,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "61-70"
    },
    {
      "from": "J11",
      "to": "B22",
      "lengthM": 23,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "51-60"
    },
    {
      "from": "J11",
      "to": "J12",
      "lengthM": 46,
      "pairs": 50,
      "gaugeMm": 0.4,
      "cablePairs": "1-50"
    },
    {
      "from": "J12",
      "to": "B21",
      "lengthM": 38,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "31-40",
      "uncertain": true,
      "notes": "المسار للبكس ده فيه جزء أفقى من غير رقم — الطول ده المكتوب جنب البكس"
    },
    {
      "from": "J12",
      "to": "B20",
      "lengthM": 64,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "21-30"
    },
    {
      "from": "J12",
      "to": "J13",
      "lengthM": 35,
      "pairs": 20,
      "gaugeMm": 0.4,
      "cablePairs": "1-20"
    },
    {
      "from": "J13",
      "to": "B19",
      "lengthM": 6,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "11-20"
    },
    {
      "from": "J13",
      "to": "B18",
      "lengthM": 17,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "1-10"
    },
    {
      "from": "J1",
      "to": "B17",
      "lengthM": 18,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "191-200"
    },
    {
      "from": "J1",
      "to": "J02",
      "lengthM": 27,
      "pairs": 30,
      "gaugeMm": 0.4,
      "cablePairs": "161-190"
    },
    {
      "from": "J1",
      "to": "J3",
      "lengthM": 38,
      "pairs": 200,
      "gaugeMm": 0.4,
      "dead": 40,
      "cablePairs": "1-160"
    },
    {
      "from": "J02",
      "to": "B14",
      "lengthM": 50,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "161-170",
      "uncertain": true,
      "notes": "الرقم على طيّة الورقة"
    },
    {
      "from": "J02",
      "to": "B15",
      "lengthM": 9,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "171-180"
    },
    {
      "from": "J02",
      "to": "B16",
      "lengthM": 10,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "181-190"
    },
    {
      "from": "J3",
      "to": "B12",
      "lengthM": 35,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "141-150"
    },
    {
      "from": "J3",
      "to": "B13",
      "lengthM": 20,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "151-160"
    },
    {
      "from": "J3",
      "to": "J04",
      "lengthM": 37,
      "pairs": 150,
      "gaugeMm": 0.4,
      "dead": 10,
      "cablePairs": "1-140"
    },
    {
      "from": "J04",
      "to": "B11",
      "lengthM": 6,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "131-140"
    },
    {
      "from": "J04",
      "to": "J05",
      "lengthM": 24,
      "pairs": 50,
      "gaugeMm": 0.4,
      "cablePairs": "81-130"
    },
    {
      "from": "J04",
      "to": "J06",
      "lengthM": 28,
      "pairs": 100,
      "gaugeMm": 0.4,
      "dead": 20,
      "cablePairs": "1-80"
    },
    {
      "from": "J05",
      "to": "B10",
      "lengthM": 6,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "111-130",
      "uncertain": true,
      "notes": "البكس فرعاته 11-30 (٢٠ زوج) والكابل مكتوب ١٠ — يتراجع"
    },
    {
      "from": "J05",
      "to": "B09",
      "lengthM": 35,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "101-110",
      "uncertain": true,
      "notes": "مدى الأزواج عند الوصلة مش واضح"
    },
    {
      "from": "J05",
      "to": "B08",
      "lengthM": 63,
      "pairs": 20,
      "gaugeMm": 0.4,
      "cablePairs": "81-100",
      "marker": "B",
      "uncertain": true,
      "notes": "الكابل بيكمّل عبر العلامة B–B — الطول المكتوب (63) للجزء اللى بعد العلامة بس"
    },
    {
      "from": "J06",
      "to": "B07",
      "lengthM": 31,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "71-80"
    },
    {
      "from": "J06",
      "to": "B06",
      "lengthM": 41,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "61-70"
    },
    {
      "from": "J06",
      "to": "J7",
      "lengthM": 49,
      "pairs": 100,
      "gaugeMm": 0.4,
      "dead": 40,
      "cablePairs": "1-60"
    },
    {
      "from": "J7",
      "to": "B05",
      "lengthM": 13,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "51-60",
      "uncertain": true,
      "notes": "أول رقم فى الطول مش واضح (13؟)"
    },
    {
      "from": "J7",
      "to": "J08",
      "lengthM": 42,
      "pairs": 20,
      "gaugeMm": 0.4,
      "cablePairs": "31-50"
    },
    {
      "from": "J7",
      "to": "J09",
      "lengthM": 28,
      "pairs": 30,
      "gaugeMm": 0.4,
      "cablePairs": "1-30"
    },
    {
      "from": "J08",
      "to": "B04",
      "lengthM": 6,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "41-50"
    },
    {
      "from": "J08",
      "to": "B03",
      "lengthM": 15,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "31-40"
    },
    {
      "from": "J09",
      "to": "B01",
      "lengthM": 12,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "1-10"
    },
    {
      "from": "J09",
      "to": "B02",
      "lengthM": 6,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "11-20"
    },
    {
      "from": "J24",
      "to": "B47",
      "lengthM": 31,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "91-100"
    },
    {
      "from": "J24",
      "to": "B46",
      "lengthM": 59,
      "pairs": 20,
      "gaugeMm": 0.4,
      "cablePairs": "71-90"
    },
    {
      "from": "J24",
      "to": "B45",
      "lengthM": 77,
      "pairs": 20,
      "gaugeMm": 0.4,
      "cablePairs": "51-70"
    },
    {
      "from": "J24",
      "to": "J25",
      "lengthM": 88,
      "pairs": 50,
      "gaugeMm": 0.4,
      "cablePairs": "1-50",
      "marker": "A",
      "notes": "الكابل بيكمّل عبر العلامة A–A"
    },
    {
      "from": "J25",
      "to": "B44",
      "lengthM": 38,
      "pairs": 20,
      "gaugeMm": 0.4,
      "cablePairs": "21-40"
    },
    {
      "from": "J25",
      "to": "B43",
      "lengthM": 50,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "11-20"
    },
    {
      "from": "J25",
      "to": "B42",
      "lengthM": 61,
      "pairs": 10,
      "gaugeMm": 0.4,
      "cablePairs": "1-10"
    },
    {
      "from": "J23",
      "to": "B41",
      "lengthM": 10,
      "pairs": 10,
      "gaugeMm": 0.4,
      "uncertain": true
    }
  ],
  "boxes": [
    {
      "box": "01",
      "block": "1",
      "pairs": "1-10",
      "joint": "J09",
      "nameAr": "على علام",
      "nameEn": "Ali Allam",
      "symbol": "dot"
    },
    {
      "box": "02",
      "block": "1",
      "pairs": "11-20",
      "joint": "J09",
      "nameAr": "احمد كمال",
      "nameEn": "Ahmad Kamal",
      "symbol": "dot"
    },
    {
      "box": "03",
      "block": "1",
      "pairs": "31-40",
      "joint": "J08",
      "nameAr": "كمال محمود",
      "nameEn": "Kamal Mahmoud",
      "symbol": "dot"
    },
    {
      "box": "04",
      "block": "1",
      "pairs": "41-50",
      "joint": "J08",
      "nameAr": "عبد ربه سعيد",
      "nameEn": "Abd Rabh Saeid",
      "symbol": "dot"
    },
    {
      "box": "05",
      "block": "1",
      "pairs": "51-60",
      "joint": "J7",
      "nameAr": "جابر عبد السميع",
      "nameEn": "Gaper Abd El-Samie",
      "symbol": "dot"
    },
    {
      "box": "06",
      "block": "1",
      "pairs": "61-70",
      "joint": "J06",
      "nameAr": "عيسى زيدان",
      "nameEn": "Eisia Zedan",
      "symbol": "dot"
    },
    {
      "box": "07",
      "block": "1",
      "pairs": "71-80",
      "joint": "J06",
      "nameAr": "شكرى عبد الرحمن",
      "nameEn": "Shokery Abd El-Rahman",
      "symbol": "dot"
    },
    {
      "box": "08",
      "block": "1",
      "pairs": "81-100",
      "joint": "J05",
      "nameAr": "سيد حسانين",
      "nameEn": "Said Hassanen",
      "symbol": "ring"
    },
    {
      "box": "09",
      "block": "2",
      "pairs": "1-10",
      "joint": "J05",
      "nameAr": "عبد الرحمن عبد العال",
      "nameEn": "Abd El-Rahman Abd El-Aiel",
      "symbol": "dot"
    },
    {
      "box": "10",
      "block": "2",
      "pairs": "11-30",
      "joint": "J05",
      "nameAr": "عبد الغفار محمد",
      "nameEn": "Abd El-Ghafar Mohamed",
      "symbol": "ring"
    },
    {
      "box": "11",
      "block": "2",
      "pairs": "31-40",
      "joint": "J04",
      "nameAr": "فتحى فرغلى",
      "nameEn": "Fatehy Fargaly",
      "symbol": "dot"
    },
    {
      "box": "12",
      "block": "2",
      "pairs": "41-50",
      "joint": "J3",
      "nameAr": "محمود محمد",
      "nameEn": "Mahmoud Mohamed",
      "symbol": "dot"
    },
    {
      "box": "13",
      "block": "2",
      "pairs": "51-60",
      "joint": "J3",
      "nameAr": "جابر عبد السميع",
      "nameEn": "Gaper Abd El-Samie",
      "symbol": "dot"
    },
    {
      "box": "14",
      "block": "2",
      "pairs": "61-70",
      "joint": "J02",
      "nameAr": "عفيفى حسين",
      "nameEn": "Afify Hassen",
      "symbol": "dot"
    },
    {
      "box": "15",
      "block": "2",
      "pairs": "71-80",
      "joint": "J02",
      "nameAr": "زغلول فرغلى",
      "nameEn": "Zaklol Fargaly",
      "symbol": "dot"
    },
    {
      "box": "16",
      "block": "2",
      "pairs": "81-90",
      "joint": "J02",
      "nameAr": "عبد العظيم محمد",
      "nameEn": "Abd El-Azeim Mohamed",
      "symbol": "dot"
    },
    {
      "box": "17",
      "block": "2",
      "pairs": "91-100",
      "joint": "J1",
      "nameAr": "صدقى حسين",
      "nameEn": "Sadike Hassin",
      "symbol": "dot"
    },
    {
      "box": "18",
      "block": "3",
      "pairs": "1-10",
      "joint": "J13",
      "nameAr": "جابر خلف",
      "nameEn": "Gaper Kalaf",
      "symbol": "dot"
    },
    {
      "box": "19",
      "block": "3",
      "pairs": "11-20",
      "joint": "J13",
      "nameAr": "محمد محمود",
      "nameEn": "Mohamed Mahmoud",
      "symbol": "dot"
    },
    {
      "box": "20",
      "block": "3",
      "pairs": "21-30",
      "joint": "J12",
      "nameAr": "رفعت عبد المنعم",
      "nameEn": "Rafat Abd El-Minam",
      "symbol": "dot"
    },
    {
      "box": "21",
      "block": "3",
      "pairs": "31-40",
      "joint": "J12",
      "nameAr": "عبد الراضى محمد",
      "nameEn": "Abd El-Rady Mohamed",
      "symbol": "dot"
    },
    {
      "box": "22",
      "block": "3",
      "pairs": "51-60",
      "joint": "J11",
      "nameAr": "محمود سلطان",
      "nameEn": "Mahmoud Soltan",
      "symbol": "dot"
    },
    {
      "box": "23",
      "block": "3",
      "pairs": "61-70",
      "joint": "J11",
      "nameAr": "محمد عامر",
      "nameEn": "Mohamed Amer",
      "symbol": "dot"
    },
    {
      "box": "24",
      "block": "3",
      "pairs": "71-80",
      "joint": "J10",
      "nameAr": "صلاح محمد",
      "nameEn": "Salah Mohamed",
      "symbol": "dot"
    },
    {
      "box": "25",
      "block": "3",
      "pairs": "81-90",
      "joint": "J10",
      "nameAr": "جمال محمد على",
      "nameEn": "Gamal Mohamed Ali",
      "symbol": "dot"
    },
    {
      "box": "26",
      "block": "4",
      "pairs": "1-10",
      "joint": "J22",
      "nameAr": "احمد كمال",
      "nameEn": "Ahmad Kamal",
      "symbol": "dot"
    },
    {
      "box": "27",
      "block": "4",
      "pairs": "11-20",
      "joint": "J22",
      "nameAr": "محمد المأذون",
      "nameEn": "Mohamed El-Maazon",
      "symbol": "dot"
    },
    {
      "box": "28",
      "block": "4",
      "pairs": "31-40",
      "joint": "J21",
      "nameAr": "محمود عبد اللاه",
      "nameEn": "Mohamed Abd El-laah",
      "symbol": "dot"
    },
    {
      "box": "29",
      "block": "4",
      "pairs": "41-50",
      "joint": "J21",
      "nameAr": "كامل حلمى",
      "nameEn": "Kamel Helmy",
      "symbol": "dot"
    },
    {
      "box": "30",
      "block": "4",
      "pairs": "51-60",
      "joint": "J20",
      "nameAr": "خالد حسن",
      "nameEn": "Kaled Hassan",
      "symbol": "dot"
    },
    {
      "box": "31",
      "block": "4",
      "pairs": "61-70",
      "joint": "J20",
      "nameAr": "احمد حمودة",
      "nameEn": "Ahmad Hamouda",
      "symbol": "dot"
    },
    {
      "box": "32",
      "block": "4",
      "pairs": "71-80",
      "joint": "J19",
      "nameAr": "عبد الملك محمد",
      "nameEn": "Abd El-Malek Mohamed",
      "symbol": "dot"
    },
    {
      "box": "33",
      "block": "4",
      "pairs": "81-90",
      "joint": "J18",
      "nameAr": "عبد الوهاب محمد",
      "nameEn": "Abd El-Wahab Mohamed",
      "symbol": "dot"
    },
    {
      "box": "34",
      "block": "4",
      "pairs": "91-100",
      "joint": "J18",
      "nameAr": "محمد احمد ناصر",
      "nameEn": "Mohamed Ahmad Naser",
      "symbol": "dot"
    },
    {
      "box": "35",
      "block": "5",
      "pairs": "1-10",
      "joint": "J18",
      "nameAr": "احمد الخطيب",
      "nameEn": "Ahmad Elkatib",
      "symbol": "dot"
    },
    {
      "box": "36",
      "block": "5",
      "pairs": "11-20",
      "joint": "J17",
      "nameAr": "كمال ابراهيم",
      "nameEn": "Kamal Ebrahim",
      "symbol": "dot"
    },
    {
      "box": "37",
      "block": "5",
      "pairs": "21-30",
      "joint": "J16",
      "nameAr": "محمد ثابت",
      "nameEn": "Mohamed Sapet",
      "symbol": "dot"
    },
    {
      "box": "38",
      "block": "5",
      "pairs": "31-40",
      "joint": "J15",
      "nameAr": "حسين كمال",
      "nameEn": "Hassen Kamal",
      "symbol": "dot"
    },
    {
      "box": "39",
      "block": "5",
      "pairs": "41-50",
      "joint": "J15",
      "nameAr": "محمد حسانين",
      "nameEn": "Mohamed Hassanen",
      "symbol": "dot"
    },
    {
      "box": "40",
      "block": "5",
      "pairs": "51-60",
      "joint": "J14",
      "nameAr": "خميس احمد",
      "nameEn": "Kames Ahmad",
      "symbol": "dot"
    },
    {
      "box": "41",
      "block": "5",
      "pairs": "81-90",
      "joint": "J23",
      "nameAr": "فوزى محمد",
      "nameEn": "Fawzy Mohamed",
      "symbol": "ring"
    },
    {
      "box": "42",
      "block": "6",
      "pairs": "1-10",
      "joint": "J25",
      "nameAr": "كمال ابراهيم",
      "nameEn": "Kamal Ebrahim",
      "symbol": "dot"
    },
    {
      "box": "43",
      "block": "6",
      "pairs": "11-20",
      "joint": "J25",
      "nameAr": "عبد القادر حميد",
      "nameEn": "Abd El-Kader Hamed",
      "symbol": "dot"
    },
    {
      "box": "44",
      "block": "6",
      "pairs": "21-40",
      "joint": "J25",
      "nameAr": "احمد ثابت",
      "nameEn": "Ahmad Sapet",
      "symbol": "ring"
    },
    {
      "box": "45",
      "block": "6",
      "pairs": "51-70",
      "joint": "J24",
      "nameAr": "سيد عبد الباسط",
      "nameEn": "Said Abd El-Baset",
      "symbol": "ring"
    },
    {
      "box": "46",
      "block": "6",
      "pairs": "71-90",
      "joint": "J24",
      "nameAr": "محمود موسى",
      "nameEn": "Mahmoud Mousa",
      "symbol": "ring",
      "notes": "رقم البكس مكتوب بخط الإيد فوق الرقم المطبوع"
    },
    {
      "box": "47",
      "block": "6",
      "pairs": "91-100",
      "joint": "J24",
      "nameAr": "محمد كامل",
      "nameEn": "Mohamed Kamel",
      "symbol": "dot",
      "notes": "رقم البكس مكتوب بخط الإيد فوق الرقم المطبوع"
    }
  ],
  "spares": [
    {
      "joint": "J22",
      "count": 10,
      "block": "4",
      "pairs": "21-30"
    },
    {
      "joint": "J14",
      "count": 10,
      "block": "5",
      "pairs": "61-70",
      "cablePairs": "161-170"
    },
    {
      "joint": "J10",
      "count": 10,
      "block": "3",
      "pairs": "91-100"
    },
    {
      "joint": "J12",
      "count": 10,
      "block": "3",
      "pairs": "41-50"
    },
    {
      "joint": "J09",
      "count": 10,
      "block": "1",
      "pairs": "21-30"
    },
    {
      "joint": "J25",
      "count": 10,
      "block": "6",
      "pairs": "41-50"
    },
    {
      "joint": "J23",
      "count": 10,
      "block": "5",
      "pairs": "91-100"
    }
  ],
  "markers": [
    {
      "name": "A",
      "from": "J24",
      "to": "J25",
      "notes": "خط أفقى عليه A مرتين: الكابل اللى نازل من وصلة 24 بيكمّل من العلامة التانية لوصلة 25"
    },
    {
      "name": "B",
      "from": "J05",
      "to": "B08",
      "notes": "الكابل من وصلة 05 بيكمّل من العلامة التانية لبكس 08"
    }
  ],
  "notes": [
    "التفريغ من صورة واحدة بالموبايل (٢٠٢٦-١١-١٢). أى خانة عليها «يتراجع» محتاجة مقارنة بالورقة.",
    "مدى الأزواج المكتوب على الكابلات عند الوصلات بترقيم الكابل نفسه: الأرقام 1-100 فى كابل البلوكين = البلوك الأول، و101-200 = التانى.",
    "خانة التوقيعات (Signatures for acceptance: Telecom execution/planning · SIEMENS · Additional) فيها إمضاء بخط الإيد."
  ]
};
