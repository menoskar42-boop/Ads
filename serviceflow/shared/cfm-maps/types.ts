// خرايط الشبكة الثانوية فى برنامج الكوابل (المالك ٢٠٢٦-١١-١٢، docs/CABLES_SECONDARY_MAP_PLAN.md).
// الخريطة كهربى مش مساحى: كابلات بأطوالها وسعاتها وقطر السلك، ووصلات (لحام) مترقّمة، وبكسيات طالعة منها.
// «كل حاجة موجودة فى الخريطة تتسجّل» — وأى رقم مش متأكدين منه من الصورة عليه uncertain عشان يتراجع.
//
// الأماكن (nodes) بتتكتب: "CAB" = الكابينة · "J10" = وصلة 10 · "B28" = بكس 28.

export interface MapMeta {
  central: string;          // السنترال
  cabinet: string;          // رقم الكابينة (6.7)
  cabinetCodes?: string;    // J11, K11, J12, K12
  title?: string;           // عنوان الخريطة
  maker?: string;           // اللى رسمها (SIEMENS AUSTRIA)
  location?: string;        // مكان الكابينة
  area?: string;            // المنطقة المكتوبة على البكسيات («غنايم - شرق»)
  scale?: string;
  notes?: string;
}

// قطعة كابل بين مكانين. «85. 0/100 * / 0.4 (30 * d)» على الخريطة = الطول 85 م · السعة 100 زوج · القطر 0.4 مم · 30 زوج dead.
export interface MapSegment {
  from: string;
  to: string;
  lengthM: number | null;
  pairs: number | null;
  gaugeMm: number | null;
  dead?: number | null;
  /** مدى الأزواج المكتوب على الكابل عند الوصلة (بترقيم الكابل، مش البلوك) */
  cablePairs?: string;
  /** علامة الوصل (A–A · B–B): الكابل متكمّل من علامة للتانية */
  marker?: string;
  uncertain?: boolean;
  notes?: string;
}

export interface MapBox {
  box: string;             // رقم البكس «28»
  block: string;           // رقم البلوك فى الكابينة (الرقم الصغير فوق المربع)
  pairs: string;           // فرعات الخرج «31-40»
  joint: string;           // طالع من أنهى وصلة «J21»
  nameAr?: string;
  nameEn?: string;
  /** "dot" = النقطة المصمتة · "ring" = الدايرة اللى فيها نقطة */
  symbol?: "dot" | "ring";
  uncertain?: boolean;
  notes?: string;
}

/** «10*SP» = اسبير ١٠ أزواج فى الوصلة (مش بكس) */
export interface MapSpare {
  joint: string;
  count: number;
  block: string;
  pairs: string;
  cablePairs?: string;
  uncertain?: boolean;
  notes?: string;
}

export interface MapMarker {
  name: string;   // A · B
  from: string;   // الوصلة اللى قبل العلامة
  to: string;     // اللى بعدها
  notes?: string;
}

export interface CableMapData {
  meta: MapMeta;
  segments: MapSegment[];
  boxes: MapBox[];
  spares: MapSpare[];
  markers: MapMarker[];
  /** أى حاجة مكتوبة فى الخريطة مالهاش خانة */
  notes?: string[];
}

export const nodeLabel = (n: string): string =>
  n === "CAB" ? "الكابينة" : /^J/.test(n) ? `وصلة ${n.slice(1)}` : /^B/.test(n) ? `بكس ${n.slice(1)}` : n;

/**
 * المسافة من الكابينة لكل مكان (مجموع أطوال المسار) — للبكس: لحد البكس نفسه.
 * مكان مالوش مسار كامل (طول ناقص) ⇒ مش موجود فى النتيجة.
 */
export function distancesFromCabinet(data: Pick<CableMapData, "segments">): Record<string, number> {
  const kids: Record<string, MapSegment[]> = {};
  for (const s of data.segments) (kids[s.from] ||= []).push(s);
  const out: Record<string, number> = { CAB: 0 };
  const stack = ["CAB"];
  const seen = new Set<string>();
  while (stack.length) {
    const n = stack.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const s of kids[n] || []) {
      if (s.lengthM == null || out[n] == null) continue;
      out[s.to] = out[n] + s.lengthM;
      stack.push(s.to);
    }
  }
  return out;
}
