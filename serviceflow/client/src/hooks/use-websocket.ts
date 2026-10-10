import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { WS_EVENTS } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { BASE } from "@/lib/base-path";

// أسماء الملفات المرفوعة — للتوضيح فى الإشعار (المفتاح = مسار الرفع)
const IMPORT_LABELS: Record<string, string> = {
  "/api/ticket-queue/import":        "الأعطال الحالية",
  "/api/ticket-queue-ftth/import":   "أعطال FTTH الحالية",
  "/api/complaint-details/import":   "الأعطال المنتظمة (تفاصيل الشكاوى)",
  "/api/maintenance-orders/import":  "التركيبات والنقل الحالى",
  "/api/ftth-orders/import":         "متعذرات OM",
  "/api/ftth-orders/import-soy":     "متعذرات OM (بداية السنة)",
  "/api/ftth-subscribers/import":    "مشتركو FTTH",
  "/api/work-orders/import":         "أوامر الشغل",
  "/api/case-138/import":            "شيت 138 (القياسات)",
  "/api/phone-lines/import":         "بيان 131",
  "/api/phone-ports/import":         "البورتات",
  "/api/cabinet-technicians/import": "فنيو الكباين",
  "/api/cabinet-capacity/import":    "سعة الكباين",
  "/api/technician-names/import":    "أسماء الفنيين",
};

/** رفعات الملفات اللى بتيجى ورا بعض فى المدة دى بتتجمّع فى إعادة جلب واحدة. */
export const IMPORT_SETTLE_MS = 2000;
/** وأقصى تأخير لو الرفعات مابتوقفش. */
export const IMPORT_MAX_WAIT_MS = 8000;

export function useWebSocket() {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // مسار الجذر لازم يدخل هنا كمان — البوّاب بيشيله قبل ما يمرّر الطلب،
    // ومن غيره الترقية بتروح لأوسكار ديفز مش لـService Flow.
    const wsUrl = `${protocol}//${window.location.host}${BASE}/ws`;
    // بعد ما الصفحة تتشال، onclose كان بيعيد الاتصال برضه — فكل خروج/دخول للوحة
    // كان بيسيب سلسلة إعادة اتصال زومبى تعمل سوكيتات وإشعارات وتحديثات مكررة.
    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    // رفعات ورا بعض ⇒ إعادة جلب واحدة وإشعار واحد (شوف DATA_IMPORT تحت)
    let importTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingLabels: string[] = [];
    let pendingCount = 0;
    let firstPendingAt = 0;
    const flushImports = () => {
      importTimer = null;
      firstPendingAt = 0;
      if (stopped || !pendingCount) return;
      const labels = pendingLabels;
      pendingLabels = [];
      pendingCount = 0;
      queryClient.invalidateQueries();
      toast({
        title: "اتحدّثت البيانات",
        description: labels.length === 1
          ? `${labels[0]} — التقرير اتحدّث تلقائياً`
          : labels.length > 1 ? `${labels.join("، ")} — التقارير اتحدّثت تلقائياً` : "التقارير اتحدّثت تلقائياً",
        duration: 4000,
      });
    };

    const connect = () => {
      if (stopped) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("Connected to WebSocket");
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === WS_EVENTS.ORDER_CREATE || message.type === WS_EVENTS.ORDER_UPDATE) {
            // Invalidate the orders query to trigger a refetch
            queryClient.invalidateQueries({ queryKey: [api.orders.list.path] });

            // Show toast notification
            const title = message.type === WS_EVENTS.ORDER_CREATE
              ? "طلب جديد"
              : "تحديث طلب";

            toast({
              title: title,
              description: `الطلب #${message.payload.id} تم تحديثه`,
              duration: 3000,
            });
          }

          if (message.type === WS_EVENTS.NOTIFICATION) {
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          }

          // اترفع ملف جديد → نبطّل صلاحية كل الاستعلامات فالتقرير المفتوح يعيد الجلب
          // لوحده فوراً (الأعطال الحالية/المنتظمة، التركيبات والنقل، متعذرات OM، … أياً كان).
          // invalidateQueries من غير فلتر بتعيد جلب الاستعلامات النشِطة بس، فالتكلفة =
          // طلبات الصفحة المفتوحة فقط. ولازم كده لأن staleTime عندنا Infinity.
          //
          // ٢٠٢٦-١٠-١٠ (المالك: «شاشة الإعدادات بتنهج على الموبايل»): التحديث التلقائى
          // والسكربتات بيرفعوا كذا ملف ورا بعض، وكل رفعة كانت بتعيد جلب كل استعلامات الصفحة
          // فوراً + إشعار — على الموبايل الصفحة كانت بتتخنق. دلوقتى الرفعات اللى ورا بعض
          // (فى خلال IMPORT_SETTLE_MS) بتتجمّع فى إعادة جلب واحدة وإشعار واحد.
          if (message.type === WS_EVENTS.DATA_IMPORT) {
            const label = IMPORT_LABELS[message.payload?.key as string];
            if (label && !pendingLabels.includes(label)) pendingLabels.push(label);
            pendingCount++;
            if (!firstPendingAt) firstPendingAt = Date.now();
            if (importTimer) clearTimeout(importTimer);
            // سيل رفعات مابيوقفش مايأجّلش التحديث على طول: أقصى انتظار IMPORT_MAX_WAIT_MS
            importTimer = Date.now() - firstPendingAt >= IMPORT_MAX_WAIT_MS
              ? setTimeout(flushImports, 0)
              : setTimeout(flushImports, IMPORT_SETTLE_MS);
          }
        } catch (error) {
          console.error("Failed to parse WebSocket message", error);
        }
      };

      ws.onclose = () => {
        if (stopped) return;
        console.log("WebSocket disconnected, reconnecting in 3s...");
        reconnectTimer = setTimeout(connect, 3000);
      };
      
      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        ws.close();
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (importTimer) clearTimeout(importTimer);
      wsRef.current?.close();
    };
  }, [queryClient, toast]);
}
