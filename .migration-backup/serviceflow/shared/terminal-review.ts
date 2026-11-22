// مراجعة البكس ترمنال بترمنال من فنى الصيانة — منطق المقارنة والنقل (docs/SF_BOX_TERMINAL_REVIEW_PLAN.md).
// دالة صافية (من غير قاعدة) عشان تتختبر لوحدها. مراجعة الفنى = الأصح، والبيانات الفنية بتتصلّح عليها.
//
// قرارات المالك (٢٠٢٦-١١-١٢):
//  ١) النقل أوتوماتيك: ترمنال «عليه حرارة» مفيش عليه خط فى البيانات ⇒ ياخد خط من ترمنال «لا سلك ولا حرارة»
//     (أو ترمنال مش موجود فى البكس / فاضى)، ولو مفيش ⇒ من ترمنال «سلك بدون حرارة». أكتر من احتمال ⇒ أى واحد.
//  ٤) خط على «سلك بدون حرارة» = مرشّح للنقل بس (لما مايبقاش فيه خطوط على «لا سلك ولا حرارة»).
//  ٥) عدد البيانات = عدد الفنى ⇒ بعد ملء الحرارة، اللى فاضل على «لا سلك ولا حرارة» يروح لـ«سلك بدون حرارة» الفاضية.

export type TerminalState = "hot" | "wire" | "none";
export const TERMINAL_STATE_LABEL: Record<TerminalState, string> = {
  hot: "عليه حرارة",
  wire: "سلك بدون حرارة",
  none: "لا يوجد سلك ولا حرارة",
};

export interface DataLine { phone: string; terminal: string | null }
export interface Move { phone: string; from: string | null; to: number; reason: "hot" | "wire_equal" }

export interface TerminalReviewResult {
  techHot: number;
  dataLines: number;
  countDiff: number;                 // البيانات − الفنى (موجب = البيانات أكتر)
  moves: Move[];
  /** بعد النقل: خطوط لسه على ترمنال «لا سلك ولا حرارة» (أو برّه البكس) — فروق */
  leftoverOnNone: DataLine[];
  /** ترمنالات عليها حرارة ولسه مفيش عليها خط فى البيانات بعد النقل */
  hotWithoutLine: number[];
  /** خطوط على «سلك بدون حرارة» بعد النقل — عطل محتمل لو فنى المنطقة أكّد فرق العدد (قرار ٦) */
  onWire: DataLine[];
}

/** رقم الترمنال من البيانات («٠٧» / «7» / «T7») ⇒ 7، وإلا null */
export function terminalNo(v: string | null | undefined): number | null {
  const d = String(v ?? "").replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/\D/g, "");
  if (!d) return null;
  const n = parseInt(d, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function reviewTerminals(capacity: number, states: Record<number, TerminalState>, lines: DataLine[]): TerminalReviewResult {
  const stateOf = (t: number | null): TerminalState => (t != null && t >= 1 && t <= capacity && states[t]) || "none";
  const at = new Map<number, DataLine[]>();     // الترمنال ⇒ خطوطه (بعد النقل)
  const outside: DataLine[] = [];                // ترمنال فاضى/برّه سعة البكس
  for (const l of lines) {
    const t = terminalNo(l.terminal);
    if (t == null || t > capacity) { outside.push(l); continue; }
    at.set(t, [...(at.get(t) || []), l]);
  }
  const terminals = Array.from({ length: capacity }, (_, i) => i + 1);
  const techHot = terminals.filter((t) => stateOf(t) === "hot").length;
  const moves: Move[] = [];
  const take = (from: DataLine[], to: number, reason: Move["reason"]) => {
    const l = from.shift()!;
    moves.push({ phone: l.phone, from: l.terminal, to, reason });
    at.set(to, [...(at.get(to) || []), { phone: l.phone, terminal: String(to) }]);
  };
  // المصادر بالأولوية: برّه البكس ثم «لا سلك ولا حرارة» ثم «سلك بدون حرارة»
  const pool = (state: TerminalState) => terminals.filter((t) => stateOf(t) === state)
    .flatMap((t) => { const ls = at.get(t) || []; at.set(t, []); return ls; });
  const noneLines = [...outside, ...pool("none")];
  const wireLines = pool("wire");
  // ١) الحرارة الفاضية
  for (const t of terminals) {
    if (stateOf(t) !== "hot" || (at.get(t) || []).length) continue;
    if (noneLines.length) take(noneLines, t, "hot");
    else if (wireLines.length) take(wireLines, t, "hot");
  }
  // ٥) العدد متساوى ⇒ الفاضل على «لا سلك ولا حرارة» يروح لـ«سلك بدون حرارة» الفاضية
  const dataLines = lines.length;
  if (dataLines === techHot) {
    const wireHasLine = (t: number) => (at.get(t) || []).length > 0 || wireLines.some((l) => terminalNo(l.terminal) === t);
    for (const t of terminals) {
      if (!noneLines.length) break;
      if (stateOf(t) === "wire" && !wireHasLine(t)) take(noneLines, t, "wire_equal");
    }
  }
  // الخطوط اللى فضلت على «سلك بدون حرارة» ترجع مكانها
  for (const l of wireLines) { const t = terminalNo(l.terminal)!; at.set(t, [...(at.get(t) || []), l]); }
  return {
    techHot,
    dataLines,
    countDiff: dataLines - techHot,
    moves,
    leftoverOnNone: noneLines,
    hotWithoutLine: terminals.filter((t) => stateOf(t) === "hot" && !(at.get(t) || []).length),
    onWire: terminals.filter((t) => stateOf(t) === "wire").flatMap((t) => at.get(t) || []),
  };
}
