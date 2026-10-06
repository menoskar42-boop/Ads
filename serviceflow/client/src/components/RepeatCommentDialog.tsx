// تعليق السوبر أدمن على رد فى «ردود التكرار» (٢٠٢٦-١٠-٠٦). التعليق بيتبعت إشعار للفنى
// والشئون الخارجية ومهندس الكوابل ومدير السنترال بس — السيرفر بيحدّدهم (repeat-reviews.ts).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export function RepeatCommentButton({ reviewId, phone, month, count }: { reviewId: number; phone: string; month: string; count?: number }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();
  const url = `/api/repeat-reviews/${reviewId}/comments`;
  const list = useQuery<{ data: any[] }>({
    queryKey: [url],
    queryFn: async () => { const r = await fetch(url, { credentials: "include" }); if (!r.ok) throw new Error("تعذّر التحميل"); return r.json(); },
    enabled: open,
  });
  const send = useMutation({
    mutationFn: async () => {
      const r = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || `خطأ ${r.status}`);
      return j;
    },
    onSuccess: (j: any) => {
      setBody("");
      qc.invalidateQueries({ queryKey: [url] });
      qc.invalidateQueries({ queryKey: ["/api/repeat-reviews/report"] });
      toast({ title: "اتبعت ✓", description: j.notified ? `وصل إشعار لـ ${j.notified} مستخدم` : "اتسجّل — بس مفيش مستخدم مربوط بالخط ده يوصله إشعار" });
    },
    onError: (e: any) => toast({ title: "ماتبعتش", description: e.message, variant: "destructive" }),
  });
  return (
    <>
      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs text-sky-700 border-sky-200" onClick={() => setOpen(true)} data-testid={`button-repeat-comment-${reviewId}`}>
        <MessageSquare className="w-3.5 h-3.5" /> تعليق{count ? ` (${count})` : ""}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تعليق الإدارة — الخط {phone} ({month})</DialogTitle>
            <DialogDescription>بيوصل إشعار للفنى والشئون الخارجية ومهندس الكوابل ومدير السنترال بس — بيظهرلهم عند الدخول وفى الجرس.</DialogDescription>
          </DialogHeader>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} rows={4} placeholder="اكتب تعليقك على الرد…"
            className="w-full border rounded-md p-2 text-sm bg-background" aria-label="التعليق" />
          <div className="flex justify-end">
            <Button disabled={!body.trim() || send.isPending} onClick={() => send.mutate()}>
              {send.isPending && <Loader2 className="w-4 h-4 animate-spin ml-1" />} إرسال
            </Button>
          </div>
          <div className="max-h-60 overflow-auto space-y-2">
            {list.isLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (list.data?.data ?? []).map((c) => (
              <div key={c.id} className="border rounded-md p-2 text-sm">
                <p className="whitespace-pre-line">{c.body}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{c.created_by || ""} · {String(c.created_local || "").slice(0, 16).replace("T", " ")} · وصل لـ {c.notified_count}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
