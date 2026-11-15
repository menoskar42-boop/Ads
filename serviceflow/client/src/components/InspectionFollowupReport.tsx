import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertCircle, ArrowUpLeft, Check, ClipboardCheck, Loader2, Plus, RefreshCw, Wrench } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RepeatedWithinMonthReport } from "@/components/RepeatedWithinMonthReport";
import { ROLES } from "@shared/schema";

type Section = "maintenance" | "om" | "installations";
type MatchValue = "matches" | "does_not_match" | "unknown";
type SourceData = Record<string, unknown>;
type FollowupRow = {
  id: number;
  sourceKey: string;
  technicianName: string | null;
  sourceData: SourceData;
  isManual: boolean;
  isComplete: boolean;
  wireDistanceMatch: MatchValue | null;
  customerWireMatch: MatchValue | null;
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
};
type FollowupResponse = {
  month: string;
  section: Section;
  total: number;
  answered: number;
  completionPercent: number;
  rows: FollowupRow[];
  readOnly: boolean;
};
type ReviewDraft = { wireDistanceMatch: MatchValue; customerWireMatch: MatchValue; reviewNotes: string };

const SECTION_META: Record<Section, { label: string; title: string; description: string }> = {
  maintenance: {
    label: "صيانة البوكسات",
    title: "صناديق الصيانة بانتظار تأكيد الشئون الخارجية",
    description: "مراجعة بيانات الصيانة وربط كل سجل بمعاينته الأصلية.",
  },
  om: {
    label: "متعذرات OM",
    title: "عوائق OM الحالية",
    description: "بيانات العميل وأمر الشغل وردود الفني والشئون الخارجية في سجل واحد.",
  },
  installations: {
    label: "التركيبات الحالية",
    title: "مراجعة التركيبات خلال الشهر",
    description: "قارن مسافة السلك وبيان العميل، ثم سجّل ملاحظات المراجعة.",
  },
};

const VALUE_LABELS: Record<string, string> = {
  exchangeName: "السنترال / جهة الصرف",
  centralName: "السنترال",
  central: "السنترال",
  cabinetNumber: "رقم الكابينة",
  cabinNumber: "رقم الكابينة",
  cabinetNo: "رقم الكابينة",
  boxNumber: "رقم البوكس",
  boxNo: "رقم البوكس",
  technicianName: "الفني",
  techName: "الفني",
  workDate: "تاريخ العمل",
  inspectionDate: "تاريخ المعاينة",
  inspectionId: "رقم المعاينة",
  taskId: "رقم المهمة",
  checklist: "قائمة الفحص",
  serialNumber: "المسلسل",
  customerName: "اسم العميل",
  customerMobile: "محمول العميل",
  mobile: "محمول العميل",
  phoneNumber: "رقم التليفون",
  phone: "رقم التليفون",
  address: "العنوان",
  customerAddress: "عنوان العميل",
  serviceOrderId: "رقم أمر الخدمة",
  workOrderId: "رقم أمر الشغل",
  customerOrderId: "رقم طلب العميل",
  workOrderType: "نوع أمر الشغل",
  orderStatus: "حالة أمر الشغل",
  status: "الحالة",
  stage: "المرحلة",
  priority: "الأولوية",
  description: "الوصف",
  currentActivity: "النشاط الحالي",
  errorName: "سبب التعذر",
  currentTechResponse: "رد الفني الحالي",
  techResponse: "رد الفني",
  externalResponse: "رد الشئون الخارجية",
  externalResponseAt: "تاريخ رد الشئون الخارجية",
  respExternalName: "مسئول الشئون الخارجية",
  respExternalRejectionReason: "سبب رد الشئون الخارجية",
  respTechName: "الفني الذي رد",
  respStatus: "حالة الرد",
  respRejectionReason: "سبب رد الفني",
  fccExchange: "السنترال المسجل",
  msanCode: "كود الكابينة",
  referenceNo: "رقم المرجع",
  creationDate: "تاريخ الإنشاء",
  workOrderDate: "تاريخ أمر الشغل",
  cableQuantity: "كمية السلك",
  wireDistance: "مسافة السلك",
  customerWireDistance: "مسافة السلك حسب العميل",
};

const OM_STATUS_LABELS: Record<string, string> = {
  pending: "بانتظار رد الفني",
  feasible: "الفني أكد إمكانية التنفيذ",
  not_feasible: "الفني أكد سبب التعذر",
  needs_external: "بانتظار رد الشئون الخارجية",
  external_feasible: "الشئون الخارجية أكدت إمكانية التنفيذ",
  external_not_feasible: "الشئون الخارجية أكدت تعذر التنفيذ",
};

const PRIMARY_FIELDS = [
  ["serialNumber", "المسلسل"],
  ["customerName", "اسم العميل"],
  ["customerMobile", "محمول العميل"],
  ["mobile", "محمول العميل"],
  ["phoneNumber", "رقم التليفون"],
  ["address", "العنوان"],
  ["serviceOrderId", "رقم أمر الخدمة"],
  ["workOrderId", "رقم أمر الشغل"],
  ["customerOrderId", "رقم طلب العميل"],
  ["workOrderType", "نوع أمر الشغل"],
  ["exchangeName", "السنترال / جهة الصرف"],
  ["centralName", "السنترال"],
  ["technicianName", "الفني"],
  ["techName", "الفني"],
  ["workDate", "تاريخ العمل"],
] as const;

const CHECKLIST_LABELS: Record<string, string> = {
  connector_fix: "تثبيت الخوصة",
  box_fix: "تثبيت البوكس",
  box_cover: "غطاء البوكس",
  box_numbering: "ترقيم البوكس",
  box_height: "ارتفاع البوكس",
  branch_path: "الفرعات على الترمنال",
  wire_path: "مسار السلك",
  electricity_conflict: "تعارض كهرباء",
  air_conflict: "تعارض هواء",
  overlap: "تخاطي",
  data_review: "مراجعة بيانات البكس",
};

const displayValue = (value: unknown): string => {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === "object") {
        const entry = item as Record<string, unknown>;
        return [
          entry.label,
          entry.name,
          CHECKLIST_LABELS[String(entry.itemKey)] || entry.itemKey,
          entry.value,
          entry.isDone ? "تم الإصلاح" : "لم يتم الإصلاح",
          entry.notes,
        ].filter(Boolean).join(" — ");
      }
      return String(item ?? "");
    }).filter(Boolean).join("، ") || "—";
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${VALUE_LABELS[key] ?? key}: ${displayValue(item)}`)
      .join(" · ");
  }
  return String(value);
};

const fieldValue = (data: SourceData, names: readonly string[]) => {
  for (const name of names) {
    const value = data[name];
    if (value != null && value !== "") return value;
  }
  return null;
};

const valueLabel = (key: string) => VALUE_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2");
const formatDate = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ar-EG");
};
const currentCairoMonth = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
};

function DetailPanel({ row, onClose }: { row: FollowupRow; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 sm:p-6"
      dir="rtl"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      data-testid={`dialog-row-details-${row.id}`}
    >
      <section className="max-h-[88dvh] w-full max-w-4xl overflow-hidden rounded-xl border border-slate-200 bg-[#fffefa] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-[#f2f5f3] px-4 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-teal-800">سجل متابعة · {row.sourceKey}</p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">تفاصيل العميل ومصدر السجل</h3>
            <p className="mt-1 text-xs text-slate-600">الفني: {row.technicianName || "غير محدد"} · {row.isComplete ? "المراجعة مكتملة" : "بانتظار المراجعة"}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onClose} data-testid={`button-close-details-${row.id}`}>إغلاق</Button>
        </header>
        <div className="max-h-[calc(88dvh-92px)] overflow-y-auto p-4 sm:p-6">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(row.sourceData || {}).map(([key, value]) => (
              <div key={key} className="min-w-0 rounded-lg border border-slate-200/90 bg-white px-3 py-2.5" data-testid={`detail-${row.id}-${key}`}>
                <div className="text-[11px] font-medium text-slate-500">{valueLabel(key)}</div>
                <div className="mt-1 break-words text-sm font-medium leading-5 text-slate-800">{displayValue(value)}</div>
              </div>
            ))}
          </div>
          {row.reviewedAt && (
            <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500" data-testid={`review-audit-${row.id}`}>
              آخر مراجعة: {row.reviewedBy || "—"} · {formatDate(row.reviewedAt)}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function ReviewChoice({
  id, label, value, onChange, disabled,
}: {
  id: string; label: string; value: MatchValue; onChange: (value: MatchValue) => void; disabled: boolean;
}) {
  return (
    <label className="flex min-w-[170px] flex-col gap-1 text-[11px] font-semibold text-slate-600">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as MatchValue)}
        className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-800 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100"
        data-testid={`select-${id}`}
      >
        <option value="unknown">غير معروف</option>
        <option value="matches">مطابق</option>
        <option value="does_not_match">غير مطابق</option>
      </select>
    </label>
  );
}

export function InspectionFollowupReport() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Section | "repeated">("repeated");
  const [month, setMonth] = useState(currentCairoMonth);
  const [serialNumber, setSerialNumber] = useState("");
  const [selectedRow, setSelectedRow] = useState<FollowupRow | null>(null);
  const [drafts, setDrafts] = useState<Record<number, ReviewDraft>>({});
  const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN;

  const section = activeTab === "repeated" ? null : activeTab;
  const sectionQueryKey = (target: Section, selectedMonth = month) => ["/api/inspection-followup", target, selectedMonth] as const;
  const followupQuery = useQuery<FollowupResponse>({
    queryKey: section ? sectionQueryKey(section) : ["/api/inspection-followup", "inactive"],
    enabled: !!section,
    queryFn: async () => {
      const params = new URLSearchParams({ section: section!, month });
      const response = await fetch(`/api/inspection-followup?${params}`, { credentials: "include" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "تعذر تحميل تقرير المتابعة");
      }
      return response.json();
    },
  });

  const saveResponse = useMutation({
    mutationFn: async ({ id, draft }: { id: number; draft: ReviewDraft }) => {
      const response = await fetch(`/api/inspection-followup/items/${id}/response`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "تعذر حفظ المراجعة");
      }
      return response.json();
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: sectionQueryKey("installations") });
      setDrafts((current) => {
        const next = { ...current };
        delete next[variables.id];
        return next;
      });
      toast({ title: "تم حفظ مراجعة التركيب" });
    },
    onError: (error: Error) => toast({ title: error.message || "تعذر حفظ المراجعة", variant: "destructive" }),
  });

  const omExternalResponse = useMutation({
    mutationFn: async (body: { serialNumber: string; isFeasible: boolean; rejectionReason?: string }) => {
      const response = await fetch("/api/om-rejections/external-response", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "تعذر تسجيل رد الشئون الخارجية");
      return payload;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sectionQueryKey("om") });
      toast({ title: "تم تسجيل رد الشئون الخارجية" });
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  });

  const requestOmExternal = useMutation({
    mutationFn: async (serialNumber: string) => {
      const response = await fetch("/api/om-rejections/request-external", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serialNumber }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "تعذر تحويل المتعذر للشئون الخارجية");
      return payload;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sectionQueryKey("om") });
      toast({ title: "تم تحويل المتعذر للشئون الخارجية" });
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  });

  const addManual = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/inspection-followup/om-extra", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, serialNumber: serialNumber.trim() }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || "تعذر إضافة المسلسل");
      }
      return response.json();
    },
    onSuccess: async () => {
      setSerialNumber("");
      await queryClient.invalidateQueries({ queryKey: sectionQueryKey("om") });
      toast({ title: "تمت إضافة المسلسل للمتابعة" });
    },
    onError: (error: Error) => toast({ title: error.message || "تعذر إضافة المسلسل", variant: "destructive" }),
  });

  const responseData = followupQuery.data;
  const rows = responseData?.rows ?? [];
  const contentFields = (row: FollowupRow) => {
    const seen = new Set<string>();
    return PRIMARY_FIELDS.flatMap(([key, label]) => {
      if (seen.has(label)) return [];
      const value = fieldValue(row.sourceData || {}, [key]);
      if (value == null) return [];
      seen.add(label);
      return [{ key, label, value }];
    });
  };
  const draftFor = (row: FollowupRow): ReviewDraft => drafts[row.id] ?? {
    wireDistanceMatch: row.wireDistanceMatch ?? "unknown",
    customerWireMatch: row.customerWireMatch ?? "unknown",
    reviewNotes: row.reviewNotes ?? "",
  };

  return (
    <div className="space-y-4 text-slate-800" dir="rtl">
      <div className="relative overflow-hidden rounded-xl border border-[#cbd9d5] bg-[#f3f6f2] px-4 py-4 sm:px-6 sm:py-5">
        <div className="absolute inset-y-0 right-0 w-1.5 bg-teal-800" />
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="pr-2">
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] text-teal-800">
              <ClipboardCheck className="h-4 w-4" /> مراجعة تشغيلية · متابعة شهرية
            </div>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">متابعة تقارير التفتيش</h2>
            <p className="mt-1 text-sm text-slate-600">سجل واضح للمعاينة، العميل، وأمر الشغل — قابل للتدقيق.</p>
          </div>
          <label className="flex w-full flex-col gap-1 text-xs font-semibold text-slate-600 sm:w-48">
            شهر التقرير
            <Input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="h-10 border-slate-300 bg-[#fffefa] font-mono"
              dir="ltr"
              data-testid="input-followup-month"
            />
          </label>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as Section | "repeated")} dir="rtl">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-[#e9efeb] p-1 sm:grid-cols-4">
          <TabsTrigger value="repeated" className="min-h-10 text-xs sm:text-sm" data-testid="tab-repeated">الأعطال المكررة خلال الشهر</TabsTrigger>
          <TabsTrigger value="maintenance" className="min-h-10 text-xs sm:text-sm" data-testid="tab-maintenance">صيانة البوكسات</TabsTrigger>
          <TabsTrigger value="om" className="min-h-10 text-xs sm:text-sm" data-testid="tab-om">عوائق OM الحالية</TabsTrigger>
          <TabsTrigger value="installations" className="min-h-10 text-xs sm:text-sm" data-testid="tab-installations">التركيبات الحالية</TabsTrigger>
        </TabsList>

        <TabsContent value="repeated" className="mt-4">
          <RepeatedWithinMonthReport />
        </TabsContent>

        {(["maintenance", "om", "installations"] as Section[]).map((currentSection) => {
          const meta = SECTION_META[currentSection];
          const isCurrent = section === currentSection;
          const isLoading = isCurrent && followupQuery.isLoading;
          const isError = isCurrent && followupQuery.isError;
          const readOnly = !!responseData?.readOnly;
          const canEdit = currentSection === "installations" && !responseData?.readOnly && user?.role !== ROLES.TECH;
          const canReplyExternal = !readOnly &&
            ([ROLES.EXTERNAL, ROLES.ADMIN, ROLES.SUPER_ADMIN] as string[]).includes(user?.role ?? "");
          return (
            <TabsContent key={currentSection} value={currentSection} className="mt-4 space-y-4">
              <div className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-[#fffefa] p-4 sm:flex-row sm:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-teal-50 text-teal-800"><Wrench className="h-4 w-4" /></span>
                    <h3 className="font-bold text-slate-900">{meta.title}</h3>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{meta.description}</p>
                </div>
                {isCurrent && responseData && (
                  <div className="flex items-center gap-4 rounded-lg bg-[#eef4f0] px-3 py-2" data-testid={`summary-${currentSection}`}>
                    <div className="text-center">
                      <div className="font-mono text-lg font-bold text-slate-900" data-testid={`text-total-${currentSection}`}>{responseData.total.toLocaleString("ar-EG")}</div>
                      <div className="text-[10px] text-slate-500">إجمالي السجلات</div>
                    </div>
                    <div className="h-8 w-px bg-slate-300" />
                    <div className="text-center">
                      <div className="font-mono text-lg font-bold text-teal-800" data-testid={`text-completion-${currentSection}`}>{Number(responseData.completionPercent || 0).toLocaleString("ar-EG")}%</div>
                      <div className="text-[10px] text-slate-500">نسبة الإنجاز · {responseData.answered.toLocaleString("ar-EG")} رد</div>
                    </div>
                  </div>
                )}
              </div>

              {currentSection === "om" && isSuperAdmin && (
                <form
                  className="flex flex-col gap-2 rounded-lg border border-teal-200 bg-[#f1f7f4] p-3 sm:flex-row sm:items-end"
                  onSubmit={(event) => { event.preventDefault(); if (serialNumber.trim()) addManual.mutate(); }}
                  data-testid="form-add-om-serial"
                >
                  <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-slate-600">
                    إضافة مسلسل يدوي لهذا الشهر
                    <Input
                      value={serialNumber}
                      onChange={(event) => setSerialNumber(event.target.value)}
                      placeholder="أدخل رقم المسلسل"
                      dir="ltr"
                      className="bg-white"
                      data-testid="input-om-extra-serial"
                    />
                  </label>
                  <Button type="submit" disabled={!serialNumber.trim() || addManual.isPending} className="gap-2 bg-teal-800 text-white hover:bg-teal-900" data-testid="button-add-om-serial">
                    {addManual.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    إضافة للمتابعة
                  </Button>
                </form>
              )}

              <Card className="overflow-hidden border border-slate-200 bg-[#fffefa] shadow-sm">
                {isError && (
                  <div className="flex flex-col items-center gap-3 px-4 py-12 text-center" role="alert" data-testid={`error-${currentSection}`}>
                    <AlertCircle className="h-6 w-6 text-rose-700" />
                    <div>
                      <p className="font-semibold text-slate-800">تعذر تحميل التقرير</p>
                      <p className="mt-1 text-xs text-slate-500">{(followupQuery.error as Error)?.message || "تحقق من الاتصال ثم أعد المحاولة."}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void followupQuery.refetch()} className="gap-2" data-testid={`button-retry-${currentSection}`}>
                      <RefreshCw className="h-3.5 w-3.5" /> إعادة المحاولة
                    </Button>
                  </div>
                )}
                {isLoading && (
                  <div className="space-y-3 p-4" aria-label="جاري التحميل" data-testid={`loading-${currentSection}`}>
                    {[0, 1, 2, 3].map((item) => <div key={item} className="h-12 animate-pulse rounded-md bg-slate-100" />)}
                  </div>
                )}
                {isCurrent && !isLoading && !isError && rows.length === 0 && (
                  <div className="flex flex-col items-center px-4 py-14 text-center" data-testid={`empty-${currentSection}`}>
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500"><ClipboardCheck className="h-5 w-5" /></div>
                    <p className="mt-3 font-semibold text-slate-800">لا توجد سجلات لهذا الشهر</p>
                    <p className="mt-1 text-xs text-slate-500">الشهر المحدد: <bdi dir="ltr">{month}</bdi></p>
                  </div>
                )}
                {isCurrent && !isLoading && !isError && rows.length > 0 && (
                  <div className="overflow-x-auto">
                    <Table dir="rtl" className="min-w-[1050px] text-right text-xs">
                      <TableHeader className="bg-[#e8efeb]">
                        <TableRow>
                          <TableHead className="w-10 text-right font-bold text-slate-700">#</TableHead>
                          <TableHead className="text-right font-bold text-slate-700">{readOnly ? "نتيجة الفحص" : "المصدر / العميل"}</TableHead>
                          {!readOnly && <TableHead className="text-right font-bold text-slate-700">تفاصيل تشغيلية</TableHead>}
                          <TableHead className="text-right font-bold text-slate-700">{readOnly ? "حالة النتيجة" : "الفني والحالة"}</TableHead>
                          {currentSection === "installations" && <TableHead className="min-w-[370px] text-right font-bold text-slate-700">{readOnly ? "نتيجة مراجعة السلك" : "مراجعة السلك"}</TableHead>}
                          {!readOnly && <TableHead className="text-right font-bold text-slate-700">فتح التفاصيل</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((row, index) => {
                          const data = row.sourceData || {};
                          const customerName = fieldValue(data, ["customerName", "customer_name", "name"]);
                          const mobile = fieldValue(data, ["customerMobile", "mobile", "phoneNumber", "phone", "customerPhone"]);
                          const address = fieldValue(data, ["address", "customerAddress", "customer_address"]);
                          const fields = contentFields(row);
                          const draft = draftFor(row);
                          const hasUnsaved = !!drafts[row.id];
                          const inspectionId = fieldValue(data, ["inspectionId", "inspection_id"]);
                          const checklist = fieldValue(data, ["checklist"]);
                          return (
                            <TableRow key={row.id} className="align-top hover:bg-[#f5f8f5]" data-testid={`row-followup-${row.id}`}>
                              <TableCell className="font-mono text-slate-400">{index + 1}</TableCell>
                              <TableCell className="max-w-[280px] whitespace-normal">
                                {readOnly ? (
                                  <div className="space-y-1 text-slate-700">
                                    {currentSection === "maintenance" && <div>{displayValue(fieldValue(data, ["checklist"]))}</div>}
                                    {currentSection === "om" && (
                                      <>
                                        <div>رد الفني: {OM_STATUS_LABELS[String(fieldValue(data, ["respStatus"]) || "pending")] || displayValue(data.respStatus)}</div>
                                        {fieldValue(data, ["respTechName"]) && <div className="text-[11px] text-slate-500">القائم بالرد: {displayValue(data.respTechName)}</div>}
                                        {fieldValue(data, ["respRejectionReason"]) && <div className="text-rose-700">{displayValue(data.respRejectionReason)}</div>}
                                        {fieldValue(data, ["respExternalResponseAt"]) && <div className="text-amber-800">رد الشئون الخارجية: {data.respIsFeasibleExternal ? "يمكن التنفيذ" : "سبب تعذر آخر"} · {displayValue(fieldValue(data, ["respExternalName"]))}</div>}
                                        {fieldValue(data, ["respExternalRejectionReason"]) && <div className="text-amber-800">{displayValue(data.respExternalRejectionReason)}</div>}
                                      </>
                                    )}
                                    {currentSection === "installations" && (
                                      <div>مسافة السلك: {displayValue(row.wireDistanceMatch)} · مد السلك للعميل: {displayValue(row.customerWireMatch)}</div>
                                    )}
                                  </div>
                                ) : currentSection === "maintenance" ? (
                                  <div className="space-y-1">
                                    <div className="font-semibold text-slate-900">{displayValue(fieldValue(data, ["exchangeName"]))}</div>
                                    <div className="text-slate-600">كابينة <bdi dir="ltr">{displayValue(fieldValue(data, ["cabinetNumber"]))}</bdi> · بوكس <bdi dir="ltr">{displayValue(fieldValue(data, ["boxNumber"]))}</bdi></div>
                                    <div className="text-[11px] text-slate-500">تاريخ العمل: {displayValue(fieldValue(data, ["workDate"]))}</div>
                                    {checklist != null && <div className="max-w-[260px] truncate text-[11px] text-amber-800" title={displayValue(checklist)}>الفحص: {displayValue(checklist)}</div>}
                                  </div>
                                ) : (
                                  <div className="space-y-1.5">
                                    <div className="font-semibold text-slate-900">{displayValue(customerName)}</div>
                                    <div className="font-mono text-[11px] text-teal-800" dir="ltr">{displayValue(mobile)}</div>
                                    <div className="max-w-[270px] whitespace-normal break-words text-[11px] leading-4 text-slate-600">{displayValue(address)}</div>
                                  </div>
                                )}
                              </TableCell>
                              {!readOnly && <TableCell className="max-w-[360px] whitespace-normal">
                                {currentSection === "maintenance" ? (
                                  <div className="space-y-1 text-slate-600">
                                    <div>المعاينة: <bdi dir="ltr" className="font-mono">{displayValue(fieldValue(data, ["inspectionId"]))}</bdi> · المهمة: <bdi dir="ltr" className="font-mono">{displayValue(fieldValue(data, ["taskId"]))}</bdi></div>
                                    <div>جهة الصرف: {displayValue(fieldValue(data, ["exchangeName"]))}</div>
                                  </div>
                                ) : (
                                  <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                                    {fields.slice(0, 8).map((field) => (
                                      <div key={field.key} className="max-w-[210px] truncate" title={`${field.label}: ${displayValue(field.value)}`}>
                                        <span className="text-slate-500">{field.label}: </span><span className="text-slate-800">{displayValue(field.value)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </TableCell>}
                              <TableCell className="whitespace-normal">
                                <div className="font-medium text-slate-800">{row.technicianName || displayValue(fieldValue(data, ["technicianName", "techName"]))}</div>
                                <span className={`mt-1 inline-flex items-center gap-1 rounded px-2 py-0.5 font-semibold ${row.isComplete ? "bg-teal-100 text-teal-800" : "bg-amber-100 text-amber-800"}`}>
                                  {row.isComplete ? <Check className="h-3 w-3" /> : null}{row.isComplete ? "مكتمل" : "بانتظار المراجعة"}
                                </span>
                                {currentSection === "om" && (
                                  <div className="mt-1 max-w-[180px] text-[10px] leading-4 text-slate-500">
                                    <div>رد الفني: {OM_STATUS_LABELS[String(fieldValue(data, ["respStatus"]) || "pending")] || displayValue(fieldValue(data, ["respStatus"]))}</div>
                                    {fieldValue(data, ["respTechName"]) && <div>القائم بالرد: {displayValue(data.respTechName)}</div>}
                                    {fieldValue(data, ["respRejectionReason"]) && <div className="text-rose-700">{displayValue(data.respRejectionReason)}</div>}
                                    {fieldValue(data, ["respExternalResponseAt"]) && <div>رد الخارجية: {data.respIsFeasibleExternal ? "يمكن التنفيذ" : "سبب تعذر آخر"} · {displayValue(data.respExternalName)}</div>}
                                    {fieldValue(data, ["respExternalRejectionReason"]) && <div className="text-amber-800">{displayValue(data.respExternalRejectionReason)}</div>}
                                  </div>
                                )}
                                {currentSection === "om" && canReplyExternal && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {fieldValue(data, ["respStatus"]) === "needs_external" && (
                                      <>
                                        <Button
                                          size="sm" variant="outline"
                                          disabled={omExternalResponse.isPending}
                                          className="h-7 border-teal-300 px-2 text-[10px] text-teal-800"
                                          onClick={() => omExternalResponse.mutate({ serialNumber: String(fieldValue(data, ["serialNumber"]) || row.sourceKey), isFeasible: true })}
                                        >يمكن التنفيذ</Button>
                                        <Button
                                          size="sm" variant="outline"
                                          disabled={omExternalResponse.isPending}
                                          className="h-7 border-rose-300 px-2 text-[10px] text-rose-800"
                                          onClick={() => {
                                            const reason = window.prompt("سبب التعذر من الشئون الخارجية:");
                                            if (reason?.trim()) omExternalResponse.mutate({
                                              serialNumber: String(fieldValue(data, ["serialNumber"]) || row.sourceKey),
                                              isFeasible: false, rejectionReason: reason.trim(),
                                            });
                                          }}
                                        >سبب تعذر آخر</Button>
                                      </>
                                    )}
                                    {isSuperAdmin && fieldValue(data, ["respStatus"]) === "not_feasible" && (
                                      <Button
                                        size="sm" variant="outline"
                                        disabled={requestOmExternal.isPending}
                                        className="h-7 border-amber-300 px-2 text-[10px] text-amber-800"
                                        onClick={() => requestOmExternal.mutate(String(fieldValue(data, ["serialNumber"]) || row.sourceKey))}
                                      >تحويل للشئون الخارجية</Button>
                                    )}
                                  </div>
                                )}
                                {row.isManual && <span className="mt-1 block text-[10px] text-teal-700">إضافة يدوية</span>}
                              </TableCell>
                              {currentSection === "installations" && (
                                <TableCell className="min-w-[370px] whitespace-normal">
                                  {canEdit ? (
                                    <div className="space-y-2">
                                      <div className="flex flex-wrap gap-2">
                                         <ReviewChoice id={`wire-distance-${row.id}`} label="مطابقة مسافة السلك لأمر الشغل" value={draft.wireDistanceMatch} disabled={saveResponse.isPending} onChange={(value) => setDrafts((current) => ({ ...current, [row.id]: { ...draft, wireDistanceMatch: value } }))} />
                                         <ReviewChoice id={`customer-wire-${row.id}`} label="مطابقة مد السلك للعميل" value={draft.customerWireMatch} disabled={saveResponse.isPending} onChange={(value) => setDrafts((current) => ({ ...current, [row.id]: { ...draft, customerWireMatch: value } }))} />
                                      </div>
                                      <textarea
                                        value={draft.reviewNotes}
                                        onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: { ...draft, reviewNotes: event.target.value } }))}
                                        placeholder="ملاحظات المراجعة"
                                        rows={2}
                                        className="w-full resize-y rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                                        data-testid={`textarea-review-notes-${row.id}`}
                                      />
                                      <div className="flex items-center justify-between gap-2">
                                        {row.reviewedAt ? <span className="text-[10px] text-slate-500">{row.reviewedBy || "—"} · {formatDate(row.reviewedAt)}</span> : <span />}
                                        <Button
                                          size="sm"
                                          disabled={!hasUnsaved || saveResponse.isPending}
                                          onClick={() => saveResponse.mutate({ id: row.id, draft })}
                                          className="h-8 gap-1.5 bg-teal-800 px-3 text-xs text-white hover:bg-teal-900"
                                          data-testid={`button-save-review-${row.id}`}
                                        >
                                          {saveResponse.isPending && saveResponse.variables?.id === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                          حفظ المراجعة
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="space-y-1 text-[11px]">
                                      <div>مسافة السلك: <b className="text-slate-800">{displayValue(row.wireDistanceMatch)}</b></div>
                                      <div>بيان العميل: <b className="text-slate-800">{displayValue(row.customerWireMatch)}</b></div>
                                      <div className="max-w-[320px] whitespace-normal text-slate-600">{row.reviewNotes || "لا توجد ملاحظات"}</div>
                                    </div>
                                  )}
                                </TableCell>
                              )}
                              {!readOnly && <TableCell className="whitespace-nowrap">
                                <div className="flex flex-col items-start gap-1.5">
                                  <Button variant="outline" size="sm" className="h-8 gap-1.5 border-slate-300" onClick={() => setSelectedRow(row)} data-testid={`button-details-${row.id}`}>
                                    تفاصيل كاملة <ArrowUpLeft className="h-3.5 w-3.5" />
                                  </Button>
                                  {currentSection === "maintenance" && inspectionId != null && (
                                    <Link
                                      href={`/maintenance/inspector/${encodeURIComponent(String(inspectionId))}`}
                                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50 px-2.5 text-xs font-semibold text-teal-800 hover:bg-teal-100"
                                      data-testid={`link-inspection-${row.id}`}
                                    >
                                      فتح المعاينة
                                    </Link>
                                  )}
                                  {row.reviewedAt && currentSection !== "installations" && <span className="text-[10px] text-slate-500">مراجعة: {formatDate(row.reviewedAt)}</span>}
                                </div>
                              </TableCell>}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
              {responseData?.readOnly && isCurrent && (
                <p className="text-xs text-slate-500" data-testid={`readonly-${currentSection}`}>العرض فقط حسب صلاحية الحساب.</p>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      {selectedRow && <DetailPanel row={selectedRow} onClose={() => setSelectedRow(null)} />}
    </div>
  );
}

export default InspectionFollowupReport;
