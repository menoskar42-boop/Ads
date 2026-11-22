// اختيار المقصّرين فى «رد التكرار» — أكتر من واحد (المالك ٢٠٢٦-١٠-٠٧): كل اسم بيتضاف من
// الدروب ليست ويظهر كشارة جنبها × للحذف. مستخدم فى نافذة الرد وفى تعليق السوبر أدمن.
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

export interface FaultOptions { techs: string[]; maintenance: string[]; splice: string[] }
export const AT_FAULT_KIND_AR: Record<string, string> = { tech: "فنى", maintenance: "فنى صيانة", splice: "لحام" };

/** المقصّرين المحفوظين فى الرد — at_faults، أو الاسم القديم لرد اتسجّل قبل التعدد. */
export const savedAtFaults = (rv: any): { name: string; kind: string }[] =>
  Array.isArray(rv?.at_faults) ? rv.at_faults
    : rv?.has_fault && rv?.at_fault_name ? [{ name: rv.at_fault_name, kind: rv.at_fault_kind || "" }] : [];

/** للعرض والتصدير: «اسم (فنى)، اسم (لحام)». */
export const atFaultsText = (rv: any): string =>
  savedAtFaults(rv).map((x) => `${x.name}${AT_FAULT_KIND_AR[x.kind] ? ` (${AT_FAULT_KIND_AR[x.kind]})` : ""}`).join("، ");

export function useAtFaultOptions(enabled: boolean) {
  return useQuery<FaultOptions>({
    queryKey: ["/api/repeat-reviews/at-fault-options"],
    queryFn: async () => (await fetch("/api/repeat-reviews/at-fault-options", { credentials: "include" })).json(),
    enabled,
  });
}

export function AtFaultPicker({ value, onChange, disabled, testId = "select-repeat-at-fault" }: {
  value: string[]; onChange: (names: string[]) => void; disabled?: boolean; testId?: string;
}) {
  const opts = useAtFaultOptions(!disabled);
  const left = (list?: string[]) => (list ?? []).filter((n) => !value.includes(n));
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((n) => (
            <span key={n} className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 text-red-800 text-xs px-2 py-1">
              {n}
              {!disabled && (
                <button type="button" onClick={() => onChange(value.filter((x) => x !== n))} title={`شيل ${n}`}
                  className="hover:text-red-950" aria-label={`شيل ${n}`}><X className="w-3.5 h-3.5" /></button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
        <select value="" onChange={(e) => { if (e.target.value) onChange([...value, e.target.value]); }}
          className="border rounded-md px-2 py-1.5 text-sm w-full" dir="rtl" data-testid={testId}>
          <option value="">{value.length ? "أضف مقصّر تانى" : "اختار اسم المقصّر"}</option>
          <optgroup label="الفنيين">{left(opts.data?.techs).map((n) => <option key={"t" + n} value={n}>{n}</option>)}</optgroup>
          <optgroup label="فنيين الصيانة">{left(opts.data?.maintenance).map((n) => <option key={"m" + n} value={n}>{n}</option>)}</optgroup>
          <optgroup label="اللحامين (برنامج الكوابل)">{left(opts.data?.splice).map((n) => <option key={"s" + n} value={n}>{n}</option>)}</optgroup>
        </select>
      )}
    </div>
  );
}
