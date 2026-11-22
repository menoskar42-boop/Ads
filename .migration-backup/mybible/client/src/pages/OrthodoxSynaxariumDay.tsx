import { useParams, Link } from 'wouter';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, BookOpen, ExternalLink, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePageTracker } from '@/hooks/usePageTracker';
import { api } from '@/lib/api';
import {
  synaxariumMonths,
  getMonthById,
} from '@/lib/synaxarium-content';

export default function OrthodoxSynaxariumDay() {
  const { monthId: monthIdStr, day: dayStr } = useParams<{ monthId: string; day: string }>();
  const monthId = parseInt(monthIdStr || '1', 10);
  const day = parseInt(dayStr || '1', 10);

  usePageTracker(`/orthodox/synaxarium/${monthId}/${day}`);

  const month = getMonthById(monthId);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['orthodox-synaxarium', monthId, day],
    queryFn: () => api.orthodox.getSynaxariumDay(monthId, day),
    enabled: Boolean(month),
    staleTime: 6 * 60 * 60 * 1000,
  });

  if (!month) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 text-center" dir="rtl">
        <p className="text-muted-foreground">لم يتم العثور على هذا الشهر.</p>
        <Link href="/orthodox/synaxarium" className="text-primary underline mt-4 block">العودة للسنكسار</Link>
      </div>
    );
  }

  const prevDay = day > 1 ? day - 1 : null;
  const nextDay = day < month.days.length ? day + 1 : null;
  const prevMonth = monthId > 1 ? monthId - 1 : null;
  const nextMonth = monthId < 13 ? monthId + 1 : null;
  const entries = data?.entries ?? [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6" dir="rtl">
      <nav className="text-sm text-muted-foreground mb-4 flex items-center gap-1 flex-wrap">
        <Link href="/orthodox" className="hover:underline">أرثوذوكسيات</Link>
        <ChevronLeft className="w-3 h-3" />
        <Link href="/orthodox/synaxarium" className="hover:underline">السنكسار</Link>
        <ChevronLeft className="w-3 h-3" />
        <span>{month.arabicName} {day}</span>
      </nav>

      <h1 className="text-2xl font-display font-bold mb-1">
        سنكسار {month.arabicName} {day}
      </h1>
      <p className="text-sm text-muted-foreground mb-5">
        {data?.copticDate || `${month.copticName} ${day}`} — النص من المصدر القبطي الموثوق
      </p>

      {isLoading ? (
        <Card className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          جاري تحميل سنكسار اليوم من المصدر...
        </Card>
      ) : isError ? (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">تعذر تحميل سنكسار هذا اليوم من المصدر حاليًا.</p>
          <p className="text-xs text-muted-foreground mt-2">حاول تحديث الصفحة بعد قليل.</p>
        </Card>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground">لا توجد بيانات لهذا اليوم.</p>
      ) : (
        <div className="space-y-4">
          {entries.map((entry, i) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="p-4">
                <div className="flex items-start gap-3">
                  <span className="text-primary mt-0.5">
                    <BookOpen className="w-5 h-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h2 className="font-semibold text-sm">{entry.title}</h2>
                      <Badge variant="outline" className="text-xs">سنكسار</Badge>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{entry.description}</p>

                    {entry.url && (
                      <div className="mt-3">
                        <a href={entry.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                          <ExternalLink className="w-3.5 h-3.5" />
                          فتح المصدر
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Day navigation */}
      <div className="mt-6 flex items-center justify-between gap-2 text-sm">
        <div>
          {prevDay ? (
            <Link href={`/orthodox/synaxarium/${monthId}/${prevDay}`} className="text-primary hover:underline flex items-center gap-1">
              <ChevronRight className="w-4 h-4" />
              {month.arabicName} {prevDay}
            </Link>
          ) : prevMonth ? (
            <Link href={`/orthodox/synaxarium/${prevMonth}/1`} className="text-primary hover:underline flex items-center gap-1">
              <ChevronRight className="w-4 h-4" />
              {synaxariumMonths[prevMonth - 1]?.arabicName}
            </Link>
          ) : null}
        </div>
        <Link href="/orthodox/synaxarium" className="text-muted-foreground hover:underline text-xs">جميع الأشهر</Link>
        <div>
          {nextDay ? (
            <Link href={`/orthodox/synaxarium/${monthId}/${nextDay}`} className="text-primary hover:underline flex items-center gap-1">
              {month.arabicName} {nextDay}
              <ChevronLeft className="w-4 h-4" />
            </Link>
          ) : nextMonth ? (
            <Link href={`/orthodox/synaxarium/${nextMonth}/1`} className="text-primary hover:underline flex items-center gap-1">
              {synaxariumMonths[nextMonth - 1]?.arabicName}
              <ChevronLeft className="w-4 h-4" />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
