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

// ── المرحلة ٢ (المالك ٢٠٢٦-١١-١٦): كل كابل عليه إيه، ومكان العطل من القياس ─────────────────────────

export interface PathStop { node: string; dist: number }

/** المسار من الكابينة لمكان (الكابينة ← وصلات ← البكس) بالمسافة التراكمية. null لو مفيش مسار كامل. */
export function pathToNode(data: Pick<CableMapData, "segments">, node: string): PathStop[] | null {
  const parent: Record<string, MapSegment> = {};
  for (const s of data.segments) if (!parent[s.to]) parent[s.to] = s;
  const chain: MapSegment[] = [];
  let cur = node;
  const seen = new Set<string>();
  while (cur !== "CAB") {
    const s = parent[cur];
    if (!s || seen.has(cur) || s.lengthM == null) return null;
    seen.add(cur);
    chain.unshift(s);
    cur = s.from;
  }
  const out: PathStop[] = [{ node: "CAB", dist: 0 }];
  for (const s of chain) out.push({ node: s.to, dist: out[out.length - 1].dist + (s.lengthM as number) });
  return out;
}

export interface CableRoute {
  /** أول قطعة طالعة من الكابينة */
  first: MapSegment;
  /** الوصلات على الكابل بالترتيب (بمسافتها من الكابينة) */
  joints: PathStop[];
  /** البكسيات على الكابل (بمسافتها والوصلة اللى طالع منها) */
  boxes: (PathStop & { joint: string; block?: string; pairs?: string; nameAr?: string })[];
  /** أبعد مسافة على الكابل */
  lengthM: number;
}

/** «كل كابل إيه البكسيات اللى عليه وإيه الوصلات اللى عليه» — كابل = كل قطعة طالعة من الكابينة وكل اللى بعدها. */
export function cableRoutes(data: Pick<CableMapData, "segments" | "boxes">): CableRoute[] {
  const kids: Record<string, MapSegment[]> = {};
  for (const s of data.segments) (kids[s.from] ||= []).push(s);
  const boxInfo = new Map(data.boxes.map((b) => ["B" + b.box, b]));
  return (kids.CAB || []).map((first) => {
    const joints: PathStop[] = [];
    const boxes: CableRoute["boxes"] = [];
    let longest = 0;
    const walk = (s: MapSegment, d: number, seen: Set<string>) => {
      const here = d + (s.lengthM ?? 0);
      longest = Math.max(longest, here);
      if (seen.has(s.to)) return;
      seen.add(s.to);
      if (/^J/.test(s.to)) joints.push({ node: s.to, dist: here });
      if (/^B/.test(s.to)) {
        const b = boxInfo.get(s.to);
        boxes.push({ node: s.to, dist: here, joint: s.from, block: b?.block, pairs: b?.pairs, nameAr: b?.nameAr });
      }
      for (const k of kids[s.to] || []) walk(k, here, seen);
    };
    walk(first, 0, new Set());
    joints.sort((a, b) => a.dist - b.dist);
    boxes.sort((a, b) => a.dist - b.dist);
    return { first, joints, boxes, lengthM: longest };
  });
}

export interface FaultLocation {
  box: string;
  boxDistM: number;            // مسافة البكس من الكابينة على الخريطة
  measuredM: number;
  direction: "box" | "cabinet";
  /** مكان العطل من الكابينة على مسار البكس */
  fromCabinetM: number | null;
  /** القياس من البكس والكابينة أقرب للعطل ⇒ القياس من الكابينة أسهل */
  cabinetCloser: boolean;
  /** بين مكانين على المسار */
  between: { a: string; b: string; fromA: number; fromB: number } | null;
  /** المسافة أكبر من طول المسار */
  beyond: boolean;
  path: PathStop[];
}

/**
 * مكان العطل من قياس على بكس (المالك ٢٠٢٦-١١-١٦): مثلاً بكس 23 على بُعد 243 م من الكابينة، والقياس 200 م **من البكس**
 * ⇒ العطل على بُعد 43 م من الكابينة (والكابينة أقرب، فيتقاس منها)، وبين وصلة كذا وكذا بمسافة من كل واحدة.
 * القياس **من الكابينة** ⇒ المسافة نفسها من الكابينة على مسار البكس.
 */
export function locateFault(data: Pick<CableMapData, "segments">, box: string, measuredM: number,
  direction: "box" | "cabinet"): FaultLocation | null {
  const node = /^B/.test(box) ? box : "B" + String(box).trim();
  const path = pathToNode(data, node);
  if (!path || !(measuredM >= 0)) return null;
  const boxDistM = path[path.length - 1].dist;
  const raw = direction === "box" ? boxDistM - measuredM : measuredM;
  const beyond = raw < 0 || raw > boxDistM;
  const p = Math.max(0, Math.min(boxDistM, raw));
  let between: FaultLocation["between"] = null;
  if (!beyond) {
    for (let i = 1; i < path.length; i++) {
      if (p <= path[i].dist) {
        const a = path[i - 1], b = path[i];
        between = { a: a.node, b: b.node, fromA: Math.round((p - a.dist) * 10) / 10, fromB: Math.round((b.dist - p) * 10) / 10 };
        break;
      }
    }
  }
  return {
    box: node, boxDistM, measuredM, direction,
    fromCabinetM: beyond ? null : Math.round(p * 10) / 10,
    cabinetCloser: direction === "box" && !beyond && p < measuredM,
    between, beyond, path,
  };
}

/** رقم الكابينة بشكل موحّد للمطابقة: «6.7» = «7-6» = «6/7» (الأرقام من غير ترتيب) */
export const cabinetKey = (c: string | null | undefined): string =>
  String(c ?? "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).split(/\D+/).filter(Boolean)
    .map((x) => String(Number(x))).sort().join("-");

/** نص النتيجة بالعربى (نفس صياغة المالك) — للشاشة والتكت */
export function describeFault(f: FaultLocation): string[] {
  const m = (x: number) => `${Math.round(x * 10) / 10} م`;
  const out: string[] = [];
  out.push(`${nodeLabel(f.box)} على بُعد ${m(f.boxDistM)} من الكابينة على الخريطة، والقياس ${m(f.measuredM)} ${f.direction === "box" ? "من البكس" : "من الكابينة"}.`);
  if (f.beyond) {
    out.push(f.direction === "box"
      ? `القياس أطول من المسافة بين البكس والكابينة (${m(f.boxDistM)}) — العطل غالباً جوّه الكابينة أو القياس/الخريطة محتاجين مراجعة.`
      : `القياس أطول من مسار البكس (${m(f.boxDistM)}) — العطل غالباً بعد البكس (السلك للعميل) أو القياس/الخريطة محتاجين مراجعة.`);
    return out;
  }
  if (f.cabinetCloser) out.push(`يمكن القياس من الكابينة لأنها أقرب — المسافة التقديرية للعطل من الكابينة ${m(f.fromCabinetM as number)} تقريباً.`);
  else out.push(`المسافة التقديرية للعطل من الكابينة ${m(f.fromCabinetM as number)} تقريباً.`);
  if (f.between) {
    out.push(`العطل متوقع بين ${nodeLabel(f.between.a)} و${nodeLabel(f.between.b)}: حوالى ${m(f.between.fromA)} من ${nodeLabel(f.between.a)} و${m(f.between.fromB)} من ${nodeLabel(f.between.b)}.`);
  }
  return out;
}
