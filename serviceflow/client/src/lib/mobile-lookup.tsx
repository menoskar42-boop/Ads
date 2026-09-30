import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MessageSquareText, Phone } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ROLES } from "@shared/schema";
import { normalizeEgMobile, smsHref } from "@shared/sms-message";

export const phoneLookupKey = (raw: string | null | undefined): string => {
  const digits = String(raw ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return digits.startsWith("88") && digits.length > 7 ? digits.slice(2) : digits;
};

export const dialMobile = (raw: string | null | undefined): string => {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("0") ? digits : `0${digits}`;
};

export async function fetchMobileLookup(phones: Array<string | null | undefined>): Promise<Record<string, string>> {
  const uniquePhones = Array.from(new Set(phones.map(phoneLookupKey).filter(Boolean))).sort();
  if (!uniquePhones.length) return {};

  const response = await fetch("/api/phone-lines/mobile-lookup", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phones: uniquePhones }),
  });
  if (!response.ok) throw new Error("فشل تحميل أرقام الموبايل");
  const payload = await response.json() as { data?: Array<{ phone: string; mobile: string | null }> };
  return Object.fromEntries(
    (payload.data ?? [])
      .filter((row) => row.mobile)
      .map((row) => [phoneLookupKey(row.phone), String(row.mobile)]),
  ) as Record<string, string>;
}

export function useMobileLookup(phones: Array<string | null | undefined>): Record<string, string> {
  const phoneKey = useMemo(
    () => Array.from(new Set(phones.map(phoneLookupKey).filter(Boolean))).sort().join("|"),
    [phones],
  );
  const { data } = useQuery({
    queryKey: ["/api/phone-lines/mobile-lookup", phoneKey],
    enabled: Boolean(phoneKey),
    queryFn: () => fetchMobileLookup(phoneKey.split("|")),
  });
  return data ?? {};
}

// زرار «SMS» (قرار المالك ٢٠٢٦-٠٩-٣٠): للسوبر أدمن **على الموبايل بس** (md:hidden زى زرار
// الاتصال). بيجيب رسالة المتابعة من السيرفر (آخر بلاغ + فنى الخط ومحموله) ويفتح تطبيق
// الرسايل بالرقم والرسالة جاهزين — الإرسال نفسه بإيد السوبر أدمن، مفيش إرسال أوتوماتيك.
export function SmsButton({ mobile: rawMobile, phone: rawPhone }: { mobile: string | null | undefined; phone: string | null | undefined }) {
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const mobile = normalizeEgMobile(rawMobile);
  const phone = String(rawPhone ?? "").replace(/\D/g, "");
  if (user?.role !== ROLES.SUPER_ADMIN || !mobile || !phone) return null;
  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/sms/followup?phone=${encodeURIComponent(phone)}`, { credentials: "include" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.message) throw new Error(d?.message || "تعذّر تجهيز الرسالة");
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      window.location.href = smsHref(mobile!, d.message, ios);
    } catch (e: any) {
      alert(e?.message || "تعذّر تجهيز الرسالة");
    } finally { setBusy(false); }
  };
  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className="md:hidden inline-flex items-center justify-center rounded-full p-1 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
      title={`رسالة SMS للعميل: ${mobile}`}
      aria-label={`رسالة SMS للعميل: ${mobile}`}
      data-testid={`button-sms-${phone}`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquareText className="h-3.5 w-3.5" />}
    </button>
  );
}

// phone = رقم التليفون الأرضى بتاع الصف — من غيره زرار الـSMS مايظهرش (الرسالة عن الخط).
export function MobileValue({ mobile, phone }: { mobile: string | null | undefined; phone?: string | null }) {
  const dial = dialMobile(mobile);
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" dir="ltr">
      <span className="font-mono">{mobile || "-"}</span>
      {dial && (
        <a
          href={`tel:${dial}`}
          className="md:hidden inline-flex items-center justify-center rounded-full p-1 text-emerald-600 hover:bg-emerald-50"
          title={`اتصال بالعميل: ${dial}`}
          aria-label={`اتصال بالعميل: ${dial}`}
        >
          <Phone className="h-3.5 w-3.5" />
        </a>
      )}
      <SmsButton mobile={mobile} phone={phone} />
    </span>
  );
}
