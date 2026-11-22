import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { ChevronLeft, Calendar } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { usePageTracker } from '@/hooks/usePageTracker';
import { synaxariumMonths, gregorianToCoptic } from '@/lib/synaxarium-content';

export default function OrthodoxSynaxarium() {
  usePageTracker('/orthodox/synaxarium');

  const today = gregorianToCoptic(new Date());

  return (
    <div className="max-w-3xl mx-auto px-4 py-6" dir="rtl">
      <nav className="text-sm text-muted-foreground mb-4 flex items-center gap-1">
        <Link href="/orthodox" className="hover:underline">أرثوذوكسيات</Link>
        <ChevronLeft className="w-3 h-3" />
        <span>السنكسار القبطي</span>
      </nav>

      <h1 className="text-2xl font-display font-bold mb-2">السنكسار القبطي الأرثوذكسي</h1>
      <p className="text-muted-foreground mb-2">
        السنكسار كتاب سير القديسين والشهداء والأعياد في الكنيسة القبطية الأرثوذكسية، مرتّباً حسب التقويم القبطي.
      </p>

      <Link
        href={`/orthodox/synaxarium/${today.month}/${today.day}`}
        className="inline-flex items-center gap-2 text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg mb-6 hover:opacity-90 transition-opacity"
      >
        <Calendar className="w-4 h-4" />
        سنكسار اليوم — {synaxariumMonths[today.month - 1]?.arabicName} {today.day}
      </Link>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {synaxariumMonths.map((month, i) => (
          <motion.div
            key={month.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.04 }}
          >
            <Link href={`/orthodox/synaxarium/${month.id}/1`}>
              <Card className="p-3 cursor-pointer hover:shadow-md transition-shadow text-center">
                <p className="font-semibold text-sm">{month.arabicName}</p>
                <p className="text-xs text-muted-foreground">{month.copticName}</p>
                <p className="text-xs text-muted-foreground mt-1">{month.gregStart}</p>
                {month.id === today.month && (
                  <span className="text-xs text-primary font-medium mt-1 block">الشهر الحالي</span>
                )}
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
