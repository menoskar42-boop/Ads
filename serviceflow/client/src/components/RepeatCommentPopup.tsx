// نافذة «تعليقات الإدارة» اللى بتظهر أول ما المستخدم يفتح الموقع — زى «آية اليوم» فى موقع
// الكتاب المقدس (المالك ٢٠٢٦-١٠-٠٦). بتعرض تعليقات السوبر أدمن على «ردود التكرار» اللى لسه
// ماتقريتش. الإشعارات دى بتتعمل للفنى/الشئون الخارجية/مهندس الكوابل/مدير السنترال بس، فباقى
// المستخدمين عمرهم ما يشوفوا النافذة. «تمام» بتعلّمها مقروءة (وبتختفى من عدّاد الجرس كمان).
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNotifications } from "@/hooks/use-notifications";

export function RepeatCommentPopup() {
  const { items, markRead } = useNotifications();
  const [dismissed, setDismissed] = useState(false);
  const pending = useMemo(() => items.filter((n: any) => n.type === "repeat_comment" && !n.isRead), [items]);
  if (dismissed || !pending.length) return null;
  const ack = async () => {
    for (const n of pending) await markRead.mutateAsync(n.id);
    setDismissed(true);
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) setDismissed(true); }}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>💬 تعليقات الإدارة على ردود التكرار</DialogTitle>
          <DialogDescription>{pending.length} تعليق جديد</DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-auto space-y-2">
          {pending.map((n: any) => (
            <div key={n.id} className="border rounded-md p-3 text-sm leading-relaxed bg-sky-50/60">{n.message}</div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDismissed(true)}>بعدين</Button>
          <Button onClick={ack} disabled={markRead.isPending} data-testid="button-repeat-comments-ack">تمام، قريتها</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
