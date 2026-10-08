// «إدخال كمية سلك تركيبات» — جوّه تاب «أوامر شغل بدون كمية سلك» (المالك ٢٠٢٦-١٠-٠٨).
// «إدخال كمية السلك» بقى للصيانة بس، فالتركيب/النقل اللى لسه ماجاش فى ملف أوامر الشغل (أو أى رقم
// تركيب يدوى) بيتسجّل من هنا: رقم + تركيب/نقل + الكمية. نفس /api/cable-entries — فلما أمر الشغل ييجى
// بنفس الرقم والنوع بيتربط بالكمية دى ومايظهرش فى «أوامر شغل بدون كمية سلك».
// والكمية بتتخصم من رصيد سلك التركيبات والنقل فى المخزن المحلى (زى أى إدخال تانى).
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Plus, Cable } from "lucide-react";

export function InstallCableManualForm() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [workOrderType, setWorkOrderType] = useState<"تركيب" | "نقل">("تركيب");
  const [qty, setQty] = useState("");
  // المخزن المحلى: فنى الإغلاق مش من الخمسة ⇒ السيرفر بيطلب يتخصم من مين (422 needTech)
  const [stockTech, setStockTech] = useState("");
  const [needTechNames, setNeedTechNames] = useState<string[] | null>(null);
  const resetTech = () => { setNeedTechNames(null); setStockTech(""); };

  const save = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/cable-entries", {
      phone, workOrderType, cableQuantity: qty, ...(stockTech ? { stockTech } : {}),
    })).json(),
    onSuccess: (d: any) => {
      toast({ title: "تم الحفظ", description: `كمية السلك ${qty} متر للرقم ${phone} (${workOrderType})${d?.stockTech ? ` — من رصيد ${d.stockTech}` : ""}`, duration: 4000 });
      if (typeof d?.stockBalance === "number" && d.stockBalance < 0) {
        toast({ title: "الرصيد بالسالب", description: `رصيد سلك التركيبات والنقل عند ${d.stockTech}: ${d.stockBalance} متر — محتاج أمر إفراج من المخزن المحلى`, variant: "destructive", duration: 8000 });
      }
      setPhone(""); setQty(""); resetTech();
      for (const k of ["/api/reports/work-orders-no-cable", "/api/cable-entries", "/api/work-orders", "/api/local-store"]) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e: any) => {
      let msg = e?.message || "حدث خطأ";
      const m = String(msg).match(/^\d+:\s*(.*)$/s);
      if (m) msg = m[1];
      try {
        const j = JSON.parse(msg);
        if (j?.message) msg = j.message;
        if (j?.needTech) { setNeedTechNames(j.techNames || []); toast({ title: "اختار الفنى", description: msg, duration: 7000 }); return; }
      } catch { /* نص عادى */ }
      toast({ title: "تعذّر الحفظ", description: msg, variant: "destructive", duration: 6000 });
    },
  });

  const ok = phone.trim().length >= 5 && /^\d+(\.\d+)?$/.test(qty.trim()) && (!needTechNames || !!stockTech);
  return (
    <Card className="p-4 bg-slate-50/70 border border-slate-200 shadow-none mb-4" data-testid="install-cable-manual-form">
      <div className="flex items-center gap-2 mb-3">
        <Cable className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold">إدخال كمية سلك تركيبات</h3>
        <span className="text-xs text-muted-foreground">— لرقم تركيب/نقل لسه ماظهرش فى أوامر الشغل، أو أى رقم يدوى</span>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (ok && !save.isPending) save.mutate(); }} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[150px]">
          <Label className="text-xs text-muted-foreground block mb-1">رقم التليفون</Label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground font-mono shrink-0">88-</span>
            <Input inputMode="numeric" value={phone} placeholder="2657290" dir="ltr" className="text-sm text-left"
              onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*$/.test(v)) { setPhone(v); resetTech(); } }} />
          </div>
        </div>
        <div className="w-full sm:w-36">
          <Label className="text-xs text-muted-foreground block mb-1">نوع امر الشغل</Label>
          <Select value={workOrderType} onValueChange={(v) => { setWorkOrderType(v as "تركيب" | "نقل"); resetTech(); }}>
            <SelectTrigger className="text-right text-sm" dir="rtl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="تركيب" className="text-right">تركيب</SelectItem>
              <SelectItem value="نقل" className="text-right">نقل</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-36">
          <Label className="text-xs text-muted-foreground block mb-1">كمية السلك (متر)</Label>
          <Input inputMode="decimal" value={qty} placeholder="مثال: 12.5" dir="ltr" className="text-sm text-left"
            onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setQty(v); }} />
        </div>
        {needTechNames && (
          <div className="w-full sm:w-44">
            <Label className="text-xs text-red-700 block mb-1">يتخصم من رصيد الفنى</Label>
            <Select value={stockTech} onValueChange={setStockTech}>
              <SelectTrigger className="text-right text-sm border-red-300" dir="rtl"><SelectValue placeholder="اختار الفنى" /></SelectTrigger>
              <SelectContent>{needTechNames.map((t) => <SelectItem key={t} value={t} className="text-right">{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <Button type="submit" disabled={!ok || save.isPending} className="gap-1">
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} حفظ
        </Button>
      </form>
      <p className="text-xs text-muted-foreground mt-2">
        لما أمر الشغل بتاع الرقم ده ييجى فى الملف بنفس النوع، هيتربط بالكمية دى ومش هيظهر فى القايمة تحت.
      </p>
    </Card>
  );
}
