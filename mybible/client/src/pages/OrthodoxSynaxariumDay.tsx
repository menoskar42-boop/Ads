import { useState } from 'react';
import { useParams, Link } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePageTracker } from '@/hooks/usePageTracker';
import {
  synaxariumMonths,
  getMonthById,
  getDayEntries,
  entryTypeIcon,
} from '@/lib/synaxarium-content';
import { synaxariumFullStories } from '@/lib/synaxarium-full-stories';

export default function OrthodoxSynaxariumDay() {
  const { monthId: monthIdStr, day: dayStr } = useParams<{ monthId: string; day: string }>();
  const monthId = parseInt(monthIdStr || '1', 10);
  const day = parseInt(dayStr || '1', 10);

  usePageTracker(`/orthodox/synaxarium/${monthId}/${day}`);

  const [expandedStory, setExpandedStory] = useState<string | null>(null);

  const month = getMonthById(monthId);
  const entries = getDayEntries(monthId, day);

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
        {month.copticName} {day} — {month.gregStart.replace(/\d+/, '').trim()} {day}
      </p>

      {entries.length === 0 ? (
        <p className="text-muted-foreground">لا توجد بيانات لهذا اليوم.</p>
      ) : (
        <div className="space-y-4">
          {entries.map((entry, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="p-4">
                <div className="flex items-start gap-3">
                  <span className="text-xl mt-0.5">{entryTypeIcon[entry.type]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h2 className="font-semibold text-sm">{entry.name}</h2>
                      <Badge variant="outline" className="text-xs">{entry.type}</Badge>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{entry.description}</p>

                    {synaxariumFullStories[entry.name] && (
                      <div className="mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1.5 text-primary border-primary/30 hover:bg-primary/5"
                          onClick={() => setExpandedStory(expandedStory === entry.name ? null : entry.name)}
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          {expandedStory === entry.name ? 'إخفاء القصة' : 'اقرأ القصة الكاملة'}
                          {expandedStory === entry.name ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </Button>

                        <AnimatePresence>
                          {expandedStory === entry.name && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.3 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-3 p-3 bg-muted/40 rounded-lg border border-border/50">
                                <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">
                                  {synaxariumFullStories[entry.name]}
                                </p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
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
