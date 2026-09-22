import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Loader2, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ContactOutcome = "answered" | "no_answer";

type ContactLog = {
  id: number;
  outcome: ContactOutcome;
  notes: string | null;
  contactedAt: string;
  contactedByName: string | null;
};

export const formatContactTime = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
};

const outcomeLabel = (outcome: ContactOutcome) =>
  outcome === "answered" ? "تم الاتصال والعميل رد" : "تم الاتصال ولم يرد العميل";

export function CustomerContactActions({ phone }: { phone: string }) {
  const queryClient = useQueryClient();
  const [recordOpen, setRecordOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [outcome, setOutcome] = useState<ContactOutcome>("answered");
  const [notes, setNotes] = useState("");

  const logsQuery = useQuery({
    queryKey: ["/api/customer-contact-logs", phone],
    queryFn: async () => {
      const res = await fetch(`/api/customer-contact-logs?phone=${encodeURIComponent(phone)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("تعذّر تحميل سجل الاتصالات");
      return res.json() as Promise<{ data: ContactLog[] }>;
    },
    enabled: historyOpen,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ nextOutcome, nextNotes }: { nextOutcome: ContactOutcome; nextNotes: string }) => {
      const res = await fetch("/api/customer-contact-logs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullPhone: phone, outcome: nextOutcome, notes: nextNotes }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "تعذّر حفظ الاتصال");
      return body;
    },
    onSuccess: async () => {
      setRecordOpen(false);
      setNotes("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/customer-contact-logs", phone] }),
        queryClient.invalidateQueries({ queryKey: ["/api/phone-lines/account-complaints"] }),
      ]);
    },
  });

  return (
    <>
      <span className="inline-flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
           onClick={() => { setOutcome("answered"); setNotes(""); setRecordOpen(true); }}
          title="تسجيل اتصال بالعميل"
        >
          <PhoneCall className="h-3.5 w-3.5" />
          تم الاتصال
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-indigo-700 hover:bg-indigo-50"
          onClick={() => setHistoryOpen(true)}
          title="عرض كل الاتصالات السابقة"
        >
          <History className="h-3.5 w-3.5" />
          الاتصالات
        </Button>
      </span>

      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تسجيل اتصال بالعميل</DialogTitle>
            <DialogDescription>
              الرقم: <bdi dir="ltr">{phone}</bdi> — سيتم تسجيل الوقت الحالي تلقائيًا.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup
            value={outcome}
            onValueChange={(value) => setOutcome(value as ContactOutcome)}
            className="gap-3"
          >
            <label className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-muted/50">
              <RadioGroupItem value="answered" id={`contact-answered-${phone}`} />
              <span>
                <Label htmlFor={`contact-answered-${phone}`} className="cursor-pointer font-medium">
                  تم الاتصال والعميل رد
                </Label>
                <span className="block text-xs text-muted-foreground mt-0.5">العميل أجاب على المكالمة</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-muted/50">
              <RadioGroupItem value="no_answer" id={`contact-no-answer-${phone}`} />
              <span>
                <Label htmlFor={`contact-no-answer-${phone}`} className="cursor-pointer font-medium">
                  تم الاتصال ولم يرد العميل
                </Label>
                <span className="block text-xs text-muted-foreground mt-0.5">تمت محاولة الاتصال دون رد</span>
              </span>
            </label>
          </RadioGroup>
          <div className="space-y-1.5">
            <Label htmlFor={`contact-notes-${phone}`}>ملاحظات</Label>
            <Textarea
              id={`contact-notes-${phone}`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="اكتب أي تفاصيل مهمة عن المكالمة..."
              maxLength={2000}
              rows={3}
              className="resize-y"
            />
            <p className="text-xs text-muted-foreground text-left" dir="ltr">
              {notes.length}/2000
            </p>
          </div>
          {saveMutation.isError && (
            <p className="text-sm text-red-600">{(saveMutation.error as Error).message}</p>
          )}
          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="button" variant="outline" onClick={() => setRecordOpen(false)} disabled={saveMutation.isPending}>
              إلغاء
            </Button>
            <Button
              type="button"
              onClick={() => saveMutation.mutate({ nextOutcome: outcome, nextNotes: notes })}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              حفظ الاتصال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>سجل اتصالات العميل</DialogTitle>
            <DialogDescription>
              الرقم: <bdi dir="ltr">{phone}</bdi>
            </DialogDescription>
          </DialogHeader>
          {logsQuery.isFetching ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : logsQuery.isError ? (
            <p className="py-4 text-center text-sm text-red-600">تعذّر تحميل سجل الاتصالات.</p>
          ) : !logsQuery.data?.data.length ? (
            <p className="py-4 text-center text-sm text-muted-foreground">لا توجد اتصالات مسجّلة لهذا الرقم.</p>
          ) : (
            <div className="max-h-72 overflow-auto rounded border">
              <table className="w-full text-right text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="p-2 font-semibold">وقت الاتصال</th>
                    <th className="p-2 font-semibold">النتيجة</th>
                    <th className="p-2 font-semibold">الملاحظات</th>
                    <th className="p-2 font-semibold">بواسطة</th>
                  </tr>
                </thead>
                <tbody>
                  {logsQuery.data.data.map((log) => (
                    <tr key={log.id} className="border-t">
                      <td className="p-2 whitespace-nowrap">{formatContactTime(log.contactedAt)}</td>
                      <td className="p-2">{outcomeLabel(log.outcome)}</td>
                      <td className="p-2 whitespace-pre-wrap break-words">{log.notes || "-"}</td>
                      <td className="p-2">{log.contactedByName || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}