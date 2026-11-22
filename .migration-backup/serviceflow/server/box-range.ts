// فلتر «من بكس — إلى بكس» (المالك ٢٠٢٦-١٠-٢٥): «إلى» فاضية ⇒ البكس ده بس (زى الفلتر القديم).
// البكسيات أرقام ⇒ بتتقارن كأرقام (٢ قبل ١٠، و«02» = ٢)؛ ولو فيها حروف بتتقارن كنص. والمقلوب بيتعدل.
export function boxRangeCond(params: any[], col: string, from: unknown, to: unknown): string | null {
  let f = String(from ?? "").trim(), t = String(to ?? "").trim();
  if (!f && !t) return null;
  if (!f || !t || f === t) { params.push(f || t); return `btrim(${col}) = $${params.length}`; }
  const num = /^\d+$/.test(f) && /^\d+$/.test(t);
  if (num ? Number(f) > Number(t) : f > t) [f, t] = [t, f];
  params.push(f, t);
  const a = `$${params.length - 1}`, b = `$${params.length}`;
  return num
    ? `(btrim(${col}) ~ '^[0-9]+$' AND btrim(${col})::numeric BETWEEN ${a}::numeric AND ${b}::numeric)`
    : `btrim(${col}) BETWEEN ${a} AND ${b}`;
}
