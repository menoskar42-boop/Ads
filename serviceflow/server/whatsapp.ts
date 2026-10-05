// ============================================================================
// server/whatsapp.ts — رسايل متابعة الأعطال على WhatsApp Cloud API (قرار المالك ٢٠٢٦-١٠-٠٥)
//
// الإرسال من السيرفر بالقوالب الأربعة المعتمدة (shared/sms-message.ts → followupTemplate)
// على الأرضى 088 2650500. الأسرار فى Replit: WHATSAPP_ACCESS_TOKEN · WHATSAPP_PHONE_NUMBER_ID ·
// WHATSAPP_WABA_ID. التوكن مايتكتبش فى أى رد ولا لوج.
// تسجيل الرقم على الـAPI بـPIN (٦ أرقام) بيتعمل مرة واحدة من شاشة السوبر أدمن — الـPIN
// بيروح لـMeta على طول ومابيتخزّنش ولا بيتسجّل.
// ============================================================================

const GRAPH = () => (process.env.WHATSAPP_GRAPH_BASE || "https://graph.facebook.com").replace(/\/+$/, "")
  + "/" + (process.env.WHATSAPP_GRAPH_VERSION || "v23.0");
const cfg = () => ({
  token: String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim(),
  phoneId: String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim(),
  wabaId: String(process.env.WHATSAPP_WABA_ID || "").trim(),
});
export const whatsappConfigured = () => { const c = cfg(); return !!(c.token && c.phoneId); };

// أخطاء Meta المعروفة → كلام مفهوم (الرسالة الأصلية بتفضل جنبها للتشخيص)
const ERR_AR: Record<number, string> = {
  190: "التوكن مش صالح أو اتلغى — اعمل توكن جديد من serviceflow-bot وحطّه فى Replit.",
  131030: "رقم العميل مش فى قايمة أرقام التجربة (لسه على رقم الاختبار).",
  131026: "الرسالة ماوصلتش — غالباً رقم العميل مالوش واتساب.",
  131047: "مينفعش رسالة حرة — لازم قالب معتمد.",
  132000: "عدد القيم مش مطابق للقالب.",
  132001: "القالب مش موجود أو لسه ماتوافقش عليه من Meta (قيد المراجعة).",
  133010: "رقم الواتساب لسه مش متسجّل على الـAPI — سجّله بالـPIN من شاشة «واتساب».",
  133005: "الـPIN غلط.",
  133006: "الرقم محتاج يتأكد تانى (verification) قبل التسجيل.",
  131056: "رسايل كتير لنفس العميل فى وقت قصير — استنى شوية.",
  130429: "وصلنا حد الإرسال المسموح — استنى شوية.",
};
export class WhatsAppError extends Error {
  constructor(message: string, public code: number | null, public metaMessage: string) { super(message); }
}

async function graph(method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
  const c = cfg();
  if (!c.token) throw new WhatsAppError("واتساب مش متظبط — WHATSAPP_ACCESS_TOKEN ناقص فى Replit.", null, "");
  const res = await fetch(`${GRAPH()}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${c.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || j?.error) {
    const e = j?.error || {};
    const code = Number(e.code) || null;
    const sub = Number(e.error_subcode) || null;
    const meta = String(e.error_user_msg || e.message || `HTTP ${res.status}`);
    const ar = (code && ERR_AR[code]) || (sub && ERR_AR[sub]) || "Meta رفضت الطلب.";
    throw new WhatsAppError(`${ar} (${code ?? res.status}: ${meta})`, code, meta);
  }
  return j;
}

/** يبعت قالب متابعة. to = 2010xxxxxxxx. بيرجّع رقم الرسالة عند Meta. */
export async function sendTemplate(to: string, name: string, params: string[]): Promise<string> {
  const c = cfg();
  if (!c.phoneId) throw new WhatsAppError("واتساب مش متظبط — WHATSAPP_PHONE_NUMBER_ID ناقص فى Replit.", null, "");
  const j = await graph("POST", `${c.phoneId}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: "ar" },
      components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
    },
  });
  return String(j?.messages?.[0]?.id || "");
}

/** تسجيل الرقم على الـCloud API بـPIN التحقق بخطوتين (٦ أرقام). الـPIN مابيتخزّنش. */
export async function registerNumber(pin: string): Promise<void> {
  const c = cfg();
  if (!/^\d{6}$/.test(pin)) throw new WhatsAppError("الـPIN لازم ٦ أرقام.", null, "");
  await graph("POST", `${c.phoneId}/register`, { messaging_product: "whatsapp", pin });
}

/** حالة الرقم واسم العرض والقوالب — لشاشة السوبر أدمن. */
export async function whatsappStatus() {
  const c = cfg();
  const out: any = { configured: whatsappConfigured(), hasWaba: !!c.wabaId, phone: null, templates: [], errors: [] };
  if (!out.configured) return out;
  try {
    out.phone = await graph("GET",
      `${c.phoneId}?fields=display_phone_number,verified_name,name_status,code_verification_status,status,quality_rating,platform_type`);
  } catch (e: any) { out.errors.push(e.message); }
  if (c.wabaId) {
    try {
      const t = await graph("GET", `${c.wabaId}/message_templates?fields=name,status,category,language,rejected_reason&limit=100`);
      out.templates = (t?.data || []).filter((x: any) => String(x.name || "").startsWith("ghanayem_followup"));
    } catch (e: any) { out.errors.push(e.message); }
  }
  return out;
}
