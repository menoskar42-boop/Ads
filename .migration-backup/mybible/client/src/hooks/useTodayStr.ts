import { useEffect, useState } from 'react';
import { todayStr } from '@/lib/group-auto-reading';

/**
 * «النهارده» (تاريخ الجهاز) وبيتحدّث لوحده بعد ١٢ بالليل.
 *
 * المالك ٢٠٢٦-١١-٠٥: عضو «بيفتح الجروب الساعه 12 و خمسه فى نص الليل بيلاقى القرايات لسه بتاعه اليوم السابق».
 * الصفحة كانت بتحسب اليوم مرة واحدة لما تتفتح — والموبايل بيرجّع التطبيق من الخلفية من غير ما يعيد تحميله. دلوقتى
 * بنراجع اليوم لما الصفحة ترجع قدّام العضو، ولما تاخد الفوكس، وكل نص دقيقة.
 */
export function useTodayStr(): string {
  const [today, setToday] = useState(todayStr());
  useEffect(() => {
    const tick = () => setToday((prev) => { const t = todayStr(); return t === prev ? prev : t; });
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', tick);
    const id = window.setInterval(tick, 30_000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', tick);
      window.clearInterval(id);
    };
  }, []);
  return today;
}
