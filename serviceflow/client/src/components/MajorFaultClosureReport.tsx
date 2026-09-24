import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ClipboardCopy, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { copyHtmlTable } from "@/lib/copy-table";

interface LineData {
  telNo: string | null;
  central: string | null;
  cabinNumber: string | null;
  boxNumber: string | null;
  primaryBlockNo: string | null;
  secBlockNo: string | null;
  iduNo: string | null;
  oduNo: string | null;
}

interface StatItem {
  boxNumber: string | null;
  capacity: number | null;
  workingLines: number;
}

interface EditableStat {
  boxNumber: string | null;
  capacity: string;
  workingLines: string;
}

const COLUMNS = [
  "قطاع", "المنطقة", "السنترال", "Exch Code", "Cable", "Cabinet", "DP", "IDU", "ODU",
  "نوع الجسيم", "السعة", "عدد الخطوط العاملة", "سبب العطل", "تاريخ بداية الجسيم",
  "العنصر المطلوب اغلاقه", "رقم تليفون العنصر", "كود المحافظة",
  "ميل مسئول مركز صيانة الشبكة بالمنطقة",
];

const localISODate = (daysFromToday: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const formatEmailDate = (value: string) => {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : "";
};

const westernDigits = (value: string) =>
  value.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));

export function MajorFaultClosureReport() {
  const [phoneInput, setPhoneInput] = useState("");
  const [line, setLine] = useState<LineData | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");

  const [reason, setReason] = useState("صيانة");
  const [element, setElement] = useState<"cabinet" | "boxes">("cabinet");
  const [closeDate, setCloseDate] = useState(() => localISODate(1));
  const [boxFrom, setBoxFrom] = useState("");
  const [boxTo, setBoxTo] = useState("");
  const [cable, setCable] = useState("");

  const [exchangeCode, setExchangeCode] = useState("");
  const [statsRows, setStatsRows] = useState<EditableStat[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [notice, setNotice] = useState("");

  const rangeValid = /^\d+$/.test(boxFrom) && /^\d+$/.test(boxTo) &&
    Number(boxFrom) >= 1 && Number(boxTo) >= Number(boxFrom) &&
    Number(boxTo) - Number(boxFrom) <= 299;

  useEffect(() => {
    if (!line) {
      setCable("");
      return;
    }
    setCable(element === "cabinet" ? (line.primaryBlockNo || "") : (line.secBlockNo || ""));
  }, [line, element]);

  useEffect(() => {
    setStatsRows([]);
    setExchangeCode("");
    setStatsError("");
    if (!line) {
      setStatsLoading(false);
      return;
    }
    if (element === "boxes" && !rangeValid) {
      setStatsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatsLoading(true);
      const params = new URLSearchParams({
        central: line.central || "",
        cabin: line.cabinNumber || "",
        element,
      });
      if (element === "boxes") {
        params.set("boxFrom", boxFrom);
        params.set("boxTo", boxTo);
      }
      try {
        const response = await fetch(`/api/reports/major-fault-closure/stats?${params}`, {
          credentials: "include",
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "تعذّر تحميل السعة والخطوط العاملة");
        setExchangeCode(data.exchangeCode || "");
        setStatsRows((Array.isArray(data.items) ? data.items : []).map((item: StatItem) => ({
          boxNumber: item.boxNumber == null ? null : String(item.boxNumber),
          capacity: item.capacity == null ? "" : String(item.capacity),
          workingLines: item.workingLines == null ? "0" : String(item.workingLines),
        })));
      } catch (error: any) {
        if (!controller.signal.aborted) {
          setStatsRows([]);
          setStatsError(error.message || "تعذّر تحميل السعة والخطوط العاملة");
        }
      } finally {
        if (!controller.signal.aborted) setStatsLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [line, element, boxFrom, boxTo, rangeValid]);

  const totals = useMemo(() => {
    if (!statsRows.length) return { capacity: null as number | null, working: null as number | null, complete: false };
    const capacityComplete = statsRows.every((row) => row.capacity.trim() !== "" && Number.isFinite(Number(row.capacity)));
    const workingComplete = statsRows.every((row) => row.workingLines.trim() !== "" && Number.isFinite(Number(row.workingLines)));
    return {
      capacity: capacityComplete ? statsRows.reduce((sum, row) => sum + Number(row.capacity), 0) : null,
      working: workingComplete ? statsRows.reduce((sum, row) => sum + Number(row.workingLines), 0) : null,
      complete: capacityComplete && workingComplete,
    };
  }, [statsRows]);

  const updateStat = (index: number, key: "capacity" | "workingLines", value: string) => {
    setStatsRows((current) => current.map((row, i) => i === index ? { ...row, [key]: value } : row));
  };

  const searchPhone = async () => {
    const phone = phoneInput.trim();
    if (!phone) {
      setLookupError("أدخل رقم التليفون");
      return;
    }
    setLookupLoading(true);
    setLookupError("");
    setLine(null);
    setStatsRows([]);
    setNotice("");
    try {
      const response = await fetch(`/api/phone-lines/lookup?phone=${encodeURIComponent(phone)}`, {
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "فشل البحث عن الخط");
      if (!data.found || !data.line) throw new Error("لا توجد بيانات لهذا الرقم");
      const foundLine = data.line as LineData;
      setLine(foundLine);
      const box = westernDigits(String(foundLine.boxNumber || "")).replace(/\D/g, "");
      setBoxFrom(box);
      setBoxTo(box);
    } catch (error: any) {
      setLookupError(error.message || "فشل البحث عن الخط");
    } finally {
      setLookupLoading(false);
    }
  };

  const subjectType = element === "cabinet" ? "رئيسى" : "ثانوى";
  const subject = line
    ? [
        "اغلاق جسيم",
        reason,
        subjectType,
        line.central ? `سنترال ${line.central}` : "",
        cable.trim() ? `كابل ${cable.trim()}` : "",
        line.cabinNumber ? `كابينة ${line.cabinNumber}` : "",
        element === "boxes" && rangeValid ? `بكسيات ${boxFrom} إلى ${boxTo}` : "",
      ].filter(Boolean).join(" ")
    : "";

  const tableRow = line && totals.complete ? [
    "وسط الصعيد",
    "أسيوط",
    line.central || "",
    exchangeCode,
    cable,
    line.cabinNumber || "",
    element === "cabinet" ? "الكل" : `${boxFrom}-${boxTo}`,
    line.iduNo || "",
    line.oduNo || "",
    subjectType,
    totals.capacity,
    totals.working,
    reason,
    formatEmailDate(closeDate),
    element === "cabinet" ? "كابينة" : "بكسيات",
    line.telNo || "",
    "088",
    "maged.gadallah@te.eg",
  ] : null;

  const copySubject = async () => {
    if (!subject) return;
    try {
      await navigator.clipboard.writeText(subject);
      setNotice("تم نسخ سطر موضوع البريد");
    } catch {
      setNotice("تعذّر النسخ؛ اسمح للموقع بالوصول إلى الحافظة");
    }
  };

  const copyTable = async () => {
    if (!tableRow) return;
    const ok = await copyHtmlTable(COLUMNS, [tableRow]);
    setNotice(ok ? "تم نسخ الجدول المنسق للصقه في البريد" : "تعذّر نسخ الجدول");
  };

  return (
    <Card className="p-4 space-y-4" dir="rtl">
      <div>
        <h2 className="text-lg font-bold">إغلاق العطل الجسيم مركز الصيانة</h2>
        <p className="text-xs text-muted-foreground mt-1">
          أدخل رقم التليفون لإنشاء جدول البريد. تُجلب السعة والخطوط العاملة من بيانات الموقع، ويمكن تعديلها قبل النسخ.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => { event.preventDefault(); void searchPhone(); }}
      >
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">رقم التليفون</label>
          <Input
            value={phoneInput}
            onChange={(event) => setPhoneInput(event.target.value)}
            placeholder="أدخل رقم التليفون"
            className="h-9 w-52"
            inputMode="numeric"
          />
        </div>
        <Button type="submit" size="sm" className="gap-1" disabled={lookupLoading}>
          {lookupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          بحث
        </Button>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">نوع الجسيم</label>
          <select
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setCloseDate(localISODate(event.target.value === "اتلاف" ? 0 : 1));
            }}
            className="h-9 w-36 rounded-md border bg-background px-2 text-sm"
          >
            <option value="صيانة">صيانة</option>
            <option value="اتلاف">اتلاف</option>
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">العنصر المطلوب إغلاقه</label>
          <select
            value={element}
            onChange={(event) => setElement(event.target.value as "cabinet" | "boxes")}
            className="h-9 w-36 rounded-md border bg-background px-2 text-sm"
            disabled={!line}
          >
            <option value="cabinet">كابينة</option>
            <option value="boxes">بكسيات</option>
          </select>
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">تاريخ الإغلاق</label>
          <Input
            type="date"
            value={closeDate}
            onChange={(event) => setCloseDate(event.target.value)}
            className="h-9 w-40"
          />
        </div>
        {element === "boxes" && (
          <>
            <div className="grid gap-1">
              <label className="text-xs text-muted-foreground">من بكس</label>
              <Input
                type="number"
                min={1}
                value={boxFrom}
                onChange={(event) => setBoxFrom(event.target.value)}
                className="h-9 w-24"
                disabled={!line}
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-muted-foreground">إلى بكس</label>
              <Input
                type="number"
                min={1}
                value={boxTo}
                onChange={(event) => setBoxTo(event.target.value)}
                className="h-9 w-24"
                disabled={!line}
              />
            </div>
          </>
        )}
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">رقم Cable</label>
          <Input
            value={cable}
            onChange={(event) => setCable(event.target.value)}
            className="h-9 w-24"
            disabled={!line}
          />
        </div>
      </form>

      {lookupError && <div className="text-sm text-red-600">{lookupError}</div>}
      {line && (
        <div className="rounded-md border bg-muted/20 p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <span className="font-semibold">{line.central || "—"}</span>
              {" · "}كابينة <span className="font-semibold">{line.cabinNumber || "—"}</span>
              {" · "}كود السنترال <span className="font-semibold">{exchangeCode || "غير متاح"}</span>
            </div>
            {statsLoading && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> تحديث بيانات السعة</span>}
          </div>

          {element === "boxes" && !rangeValid && (
            <div className="text-xs text-amber-700">أدخل نطاقًا صحيحًا من 1 إلى 300 بكس حتى تُحمّل القيم.</div>
          )}
          {statsError && <div className="flex items-center gap-1 text-sm text-red-600"><AlertCircle className="h-4 w-4" />{statsError}</div>}

          {statsRows.length > 0 && (
            <div className="overflow-x-auto rounded border bg-background">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">العنصر</TableHead>
                    <TableHead className="text-right">السعة</TableHead>
                    <TableHead className="text-right">الشغال في الموقع</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statsRows.map((row, index) => (
                    <TableRow key={row.boxNumber ?? `cabinet-${index}`}>
                      <TableCell className="whitespace-nowrap">
                        {element === "cabinet" ? `الكابينة ${line.cabinNumber || ""}` : `البكس ${row.boxNumber}`}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          aria-label={`السعة ${row.boxNumber ? `للبكس ${row.boxNumber}` : "للكابينة"}`}
                          value={row.capacity}
                          onChange={(event) => updateStat(index, "capacity", event.target.value)}
                          className="h-8 w-28"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          aria-label={`الخطوط العاملة ${row.boxNumber ? `للبكس ${row.boxNumber}` : "للكابينة"}`}
                          value={row.workingLines}
                          onChange={(event) => updateStat(index, "workingLines", event.target.value)}
                          className="h-8 w-28"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell>الإجمالي</TableCell>
                    <TableCell>{totals.capacity ?? "أدخل السعة الناقصة"}</TableCell>
                    <TableCell>{totals.working ?? "أدخل القيمة الناقصة"}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            عند اختيار الكابينة يُستخدم النوع الرئيسي؛ وعند اختيار البكسيات يُستخدم النوع الثانوي. عدّل أي سعة أو عدد خطوط قبل نسخ الجدول.
          </p>
        </div>
      )}

      {line && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">سطر موضوع البريد</div>
              <div className="text-sm font-medium break-words">{subject}</div>
            </div>
            <Button onClick={copySubject} variant="outline" size="sm" className="shrink-0 gap-1" disabled={!subject || (element === "boxes" && !rangeValid)}>
              <ClipboardCopy className="h-4 w-4" /> نسخ سطر الموضوع
            </Button>
          </div>

          {tableRow && (
            <>
              <div className="flex items-center justify-end">
                <Button onClick={copyTable} size="sm" className="gap-1">
                  <ClipboardCopy className="h-4 w-4" /> نسخ الجدول للبريد
                </Button>
              </div>
              <div className="rounded-md border max-h-[55vh] overflow-auto">
                <Table dir="rtl" className="text-xs">
                  <TableHeader>
                    <TableRow>{COLUMNS.map((column) => <TableHead key={column} className="whitespace-nowrap text-right">{column}</TableHead>)}</TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      {tableRow.map((cell, index) => (
                        <TableCell key={index} className="whitespace-nowrap">
                          {cell == null || cell === "" ? "—" : String(cell)}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </>
      )}
      {notice && <div className="text-sm text-emerald-700" role="status">{notice}</div>}
    </Card>
  );
}