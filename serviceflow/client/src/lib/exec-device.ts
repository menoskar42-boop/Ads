// «جهاز التنفيذ المسجّل» (المالك ٢٠٢٦-١١-١٩): بصمة المتصفح — نفسها على أى عنوان لـService Flow (oscardevs.com أو
// serviceflow.oscardevs.com) وحتى لو التخزين اتمسح، لأنها من خصائص الجهاز والمتصفح نفسهم مش من حاجة متخزّنة.
// مش للتتبّع: بتتحسب بس عند السوبر أدمن عشان المتصفح ده يعرف إنه هو جهاز التنفيذ ويشتغل لوحده أول ما يفتح.

const parts = (): string[] => {
  const n: any = typeof navigator !== "undefined" ? navigator : {};
  const s: any = typeof screen !== "undefined" ? screen : {};
  let tz = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch {}
  let gl = "";
  try {
    const c = document.createElement("canvas").getContext("webgl") as WebGLRenderingContext | null;
    const ext = c && c.getExtension("WEBGL_debug_renderer_info");
    if (c && ext) gl = String(c.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "");
  } catch {}
  return [
    n.userAgent || "", n.platform || "", n.language || "", String(n.hardwareConcurrency || ""), String(n.deviceMemory || ""),
    `${s.width || 0}x${s.height || 0}x${s.colorDepth || 0}`, tz, gl,
  ];
};

/** بصمة المتصفح ده (٣٢ حرف hex). */
export async function browserFingerprint(): Promise<string> {
  const text = parts().join("|");
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  } catch {
    // من غير crypto.subtle (http): hash بسيط بطول ثابت
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < text.length; i++) { h1 = Math.imul(h1 ^ text.charCodeAt(i), 16777619); h2 = Math.imul(h2 ^ text.charCodeAt(i), 2246822519); }
    return ((h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0")).repeat(2);
  }
}

export type ExecDevice = { fp: string | null; label: string | null; registeredAt: string | null; registeredBy: string | null; autoStart: boolean };
export const EXEC_DEVICE_URL = "/api/exec-queue/device";
