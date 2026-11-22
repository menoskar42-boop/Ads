import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { ChevronLeft, Calendar, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function ReadingPlansPreview() {
  const { data: readingPlans, isLoading: plansLoading } = useQuery({
    queryKey: ['readingPlans'],
    queryFn: api.readingPlans.getAll,
  });

  const { data: userProgress } = useQuery({
    queryKey: ['userProgress'],
    queryFn: api.userProgress.getAll,
  });

  if (plansLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-muted rounded mb-4 w-32" />
        <div className="space-y-3">
          <div className="h-32 bg-muted rounded-lg" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-32 bg-muted rounded-lg" />
            <div className="h-32 bg-muted rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  const activePlanProgress = userProgress?.[0];
  const activePlan = activePlanProgress
    ? readingPlans?.find(p => p.id === activePlanProgress.planId)
    : undefined;
  const suggestedPlans = readingPlans?.filter(p => p.id !== activePlan?.id).slice(0, 2) || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg font-bold text-foreground">خطط القراءة</h2>
        <Link href="/plans">
          <Button variant="ghost" size="sm" className="text-primary" data-testid="link-all-plans">
            عرض الكل
            <ChevronLeft className="w-4 h-4 mr-1" />
          </Button>
        </Link>
      </div>

      <div className="space-y-3">
        {activePlan && activePlanProgress && (
          <Card className="p-4 bg-gradient-to-l from-primary/5 to-transparent border-primary/20">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Calendar className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-foreground">{activePlan.name}</h3>
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-primary/10 text-primary rounded-full">
                    نشطة
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{activePlan.description}</p>
                <div className="flex items-center gap-2">
                  <Progress 
                    value={(activePlanProgress.currentDay / activePlan.daysTotal) * 100} 
                    className="h-2 flex-1" 
                  />
                  <span className="text-xs font-medium text-primary">
                    {activePlanProgress.currentDay}/{activePlan.daysTotal}
                  </span>
                </div>
              </div>
            </div>
            <Link href="/plans">
              <Button size="sm" className="w-full mt-3" data-testid="button-continue-plan">
                متابعة القراءة
              </Button>
            </Link>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-3">
          {suggestedPlans.map((plan) => (
            <Card key={plan.id} className="p-4 hover:shadow-md transition-shadow" data-testid={`card-plan-${plan.id}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{plan.name}</h3>
                  <p className="text-[10px] text-muted-foreground">{plan.duration}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{plan.description}</p>
              <Button variant="outline" size="sm" className="w-full text-xs" data-testid={`button-start-plan-${plan.id}`}>
                ابدأ الخطة
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
