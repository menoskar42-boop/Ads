import { motion } from 'framer-motion';
import { Church, MapPin, ChevronLeft, Plus, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link, useLocation } from 'wouter';
import { SEOHead } from '@/components/SEOHead';
import { useQuery } from '@tanstack/react-query';
import { getMinistryUser } from '@/lib/ministry-auth';
import { Loader2 } from 'lucide-react';

export default function Churches() {
  const [, navigate] = useLocation();
  const user = getMinistryUser();

  const { data, isLoading } = useQuery({
    queryKey: ['churches'],
    queryFn: async () => {
      const res = await fetch('/api/churches');
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-4xl flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const churchList = data?.churches || [];

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <SEOHead />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-md">
              <Church className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">الكنائس</h1>
              <p className="text-sm text-muted-foreground">الكنائس المسجلة في النظام</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/church-request">
              <Button variant="outline" size="sm" data-testid="button-request-church">
                <Plus className="w-4 h-4 ml-1" />
                طلب إنشاء صفحة للكنيسة
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={() => navigate('/groups')} data-testid="button-back-groups">
              <ArrowRight className="w-4 h-4 ml-1" />
              رجوع
            </Button>
          </div>
        </div>

        {churchList.length === 0 ? (
          <Card className="p-8 text-center">
            <Church className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h2 className="font-display text-lg font-bold text-foreground mb-2">لا توجد صفحات كنائس مسجلة بعد</h2>
            <p className="text-sm text-muted-foreground mb-4">يمكنك تقديم طلب لتسجيل كنيستك</p>
            <Link href="/church-request">
              <Button data-testid="button-request-church-empty">طلب إنشاء صفحة للكنيسة</Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-3">
            {churchList.map((church: any) => (
              <Card
                key={church.id}
                className="p-4 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/church/${church.id}`)}
                data-testid={`card-church-${church.id}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center">
                      <Church className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-foreground">{church.name}</h3>
                      <div className="flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{church.governorate}</span>
                      </div>
                    </div>
                  </div>
                  <ChevronLeft className="w-5 h-5 text-muted-foreground" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
