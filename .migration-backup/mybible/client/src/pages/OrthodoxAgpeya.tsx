import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Clock, ChevronLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { usePageTracker } from '@/hooks/usePageTracker';
import { agpeyaHoursFull } from '@/lib/agpeya-content';

export default function OrthodoxAgpeya() {
  usePageTracker('/orthodox/agpeya');

  return (
    <div className="max-w-3xl mx-auto px-4 py-6" dir="rtl">
      <nav className="text-sm text-muted-foreground mb-4 flex items-center gap-1">
        <Link href="/orthodox" className="hover:underline">أرثوذوكسيات</Link>
        <ChevronLeft className="w-3 h-3" />
        <span>الأجبية</span>
      </nav>

      <h1 className="text-2xl font-display font-bold mb-2">كتاب الأجبية</h1>
      <p className="text-muted-foreground mb-6">
        الأجبية كتاب الصلوات اليومية القبطي — يحتوي على سبع ساعات صلاة يرتلها المؤمنون في أوقات محددة من اليوم والليل منذ القرن الرابع الميلادي.
      </p>

      <div className="grid gap-3">
        {agpeyaHoursFull.map((hour, i) => (
          <motion.div
            key={hour.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Link href={`/orthodox/agpeya/${hour.id}`}>
              <Card className={`p-4 cursor-pointer hover:shadow-md transition-shadow border-r-4 ${hour.colorBorder}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{hour.icon}</span>
                  <div className="flex-1">
                    <h2 className="font-semibold text-base">{hour.name}</h2>
                    <p className="text-sm text-muted-foreground">{hour.arabicTime}</p>
                  </div>
                  <div className="text-xs text-muted-foreground text-left">
                    <Clock className="w-3 h-3 inline ml-1" />
                    {hour.memory}
                  </div>
                </div>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mt-6 text-center">
        الأجبية تراث طقسي قبطي أرثوذكسي — ملك عام
      </p>
    </div>
  );
}
