import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import {
  subscriptionPlanStore, clinicSubscriptionStore, DEFAULT_PLANS,
  applyPlanModules,
  type SubscriptionPlan, type ClinicSubscription,
} from '@/stores/subscriptionPlanStore';
import { getToken } from '@/utils/authToken';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, Star, Crown, Zap, Building2, Shield, Sparkles, Package, Landmark, Bot, ShieldPlus, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';

const PLAN_ICONS = [Building2, Zap, Star, Crown];
const BILLING_PERIODS: { value: string; labelEn: string; labelAr: string; discount: string }[] = [
  { value: 'annually', labelEn: 'Annual', labelAr: 'سنوي', discount: '' },
  { value: 'fiveYears', labelEn: '5 Years', labelAr: '5 سنوات', discount: '10%' },
  { value: 'tenYears', labelEn: '10 Years', labelAr: '10 سنوات', discount: '20%' },
  { value: 'lifetime', labelEn: 'Lifetime', labelAr: 'مدى الحياة', discount: '40%' },
];

const SubscriptionPlans: React.FC = () => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const isAr = language === 'ar';
  const isSuperAdmin = user?.role === 'super_admin';

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<ClinicSubscription[]>([]);
  const [billingPeriod, setBillingPeriod] = useState<string>('annually');
  const [showCash, setShowCash] = useState(false);

  useEffect(() => {
    const loadPlans = () => {
      let all = subscriptionPlanStore.getAll();
      if (all.length === 0) {
        DEFAULT_PLANS.forEach(p => subscriptionPlanStore.add(p));
        all = subscriptionPlanStore.getAll();
      }
      setPlans(all);
    };
    loadPlans();
    const u1 = subscriptionPlanStore.subscribe(loadPlans);

    const loadSubs = () => setSubscriptions(clinicSubscriptionStore.getAll());
    loadSubs();
    const u2 = clinicSubscriptionStore.subscribe(loadSubs);

    return () => { u1(); u2(); };
  }, []);

  const getPrice = (plan: SubscriptionPlan) => {
    const pricing = plan.pricing as any;
    if (showCash && pricing.cashDiscount) return pricing.cashDiscount;
    return pricing[billingPeriod] || pricing.annually;
  };

  const getCurrentSub = (clinicId: string) =>
    subscriptions.find(s => s.clinicId === clinicId && s.status === 'active');

  const subscribe = async (plan: SubscriptionPlan) => {
    if (!user?.clinicId) return;
    const clinicId = user.clinicId;
    const existing = getCurrentSub(clinicId);
    if (existing) clinicSubscriptionStore.update(s => s.clinicId === clinicId && s.status === 'active', { status: 'cancelled' });
    clinicSubscriptionStore.add({
      id: `sub-${Date.now()}`,
      clinicId,
      planId: plan.id!,
      startDate: new Date().toISOString().split('T')[0],
      isLifetime: billingPeriod === 'lifetime',
      billingPeriod,
      amountPaid: getPrice(plan),
      status: 'active',
      createdAt: new Date().toISOString(),
    });

    // Sync modules immediately (localStorage + optional API)
    applyPlanModules(clinicId, plan.id!);
    const token = getToken();
    if (token) {
      try {
        await fetch('/api/plan/change', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ plan_id: plan.id }),
        });
      } catch { /* fail silently — localStorage already updated */ }
    }

    toast.success(isAr ? `تم الاشتراك في خطة ${plan.nameAr}` : `Subscribed to ${plan.name} plan`);
  };

  const activePlanId = user?.clinicId ? getCurrentSub(user.clinicId)?.planId : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium">
          <Sparkles className="h-4 w-4" />
          {isAr ? 'خطط الاشتراك' : 'Subscription Plans'}
        </div>
        <h1 className="text-3xl font-bold text-foreground">
          {isAr ? 'اختر الخطة المناسبة لعيادتك' : 'Choose the right plan for your clinic'}
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          {isAr ? 'جميع الخطط تشمل دعم فني مجاني وتحديثات مستمرة' : 'All plans include free technical support and continuous updates'}
        </p>
      </div>

      {/* Billing period toggle */}
      <div className="flex flex-wrap justify-center gap-2">
        {BILLING_PERIODS.map(bp => (
          <button
            key={bp.value}
            onClick={() => setBillingPeriod(bp.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${billingPeriod === bp.value ? 'bg-primary text-primary-foreground shadow' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
          >
            {isAr ? bp.labelAr : bp.labelEn}
            {bp.discount && <span className="ml-1.5 text-xs text-green-400">{isAr ? `خصم ${bp.discount}` : `-${bp.discount}`}</span>}
          </button>
        ))}
        <button
          onClick={() => setShowCash(!showCash)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${showCash ? 'bg-amber-500 text-white shadow' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
        >
          {isAr ? 'خصم الكاش' : 'Cash Discount'}
        </button>
      </div>

      {/* Plan Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan, idx) => {
          const Icon = PLAN_ICONS[idx % PLAN_ICONS.length];
          const price = getPrice(plan);
          const isActive = activePlanId === plan.id;
          const isMostPopular = plan.isMostPopular;
          return (
            <Card
              key={plan.id}
              className={`relative flex flex-col transition-all ${isMostPopular ? 'border-2 border-primary shadow-lg scale-105' : ''} ${isActive ? 'ring-2 ring-green-500' : ''}`}
            >
              {isMostPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground gap-1 shadow">
                    <Star className="h-3 w-3 fill-current" />
                    {isAr ? 'الأكثر شعبية' : 'Most Popular'}
                  </Badge>
                </div>
              )}
              {isActive && (
                <div className="absolute -top-3 right-2">
                  <Badge className="bg-green-500 text-white gap-1"><Check className="h-3 w-3" />{isAr ? 'نشط' : 'Active'}</Badge>
                </div>
              )}
              <CardHeader className="pb-4 text-center">
                <div className="h-12 w-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: `${plan.color}20` }}>
                  <Icon className="h-6 w-6" style={{ color: plan.color }} />
                </div>
                <CardTitle className="text-xl">{isAr ? plan.nameAr : plan.name}</CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-foreground">{price.toLocaleString()}</span>
                  <span className="text-muted-foreground text-sm"> ج.م</span>
                  <p className="text-xs text-muted-foreground mt-1">
                    {billingPeriod === 'annually' ? (isAr ? '/ سنة' : '/ year')
                      : billingPeriod === 'fiveYears' ? (isAr ? '/ 5 سنوات' : '/ 5 years')
                      : billingPeriod === 'tenYears' ? (isAr ? '/ 10 سنوات' : '/ 10 years')
                      : (isAr ? 'مرة واحدة' : 'one-time')}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {isAr ? `حتى ${plan.maxBranches} فرع` : `Up to ${plan.maxBranches} branch${plan.maxBranches > 1 ? 'es' : ''}`}
                </p>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-4">
                <ul className="space-y-2 flex-1">
                  {(isAr ? plan.featuresAr : plan.features).map((f, fi) => (
                    <li key={fi} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
                {/* Module badges */}
                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground mb-2">{isAr ? 'الوحدات المتاحة' : 'Included modules'}</p>
                  <div className="flex flex-wrap gap-1">
                    {plan.modules.length === 0
                      ? <span className="text-xs text-muted-foreground">{isAr ? 'النواة الأساسية فقط' : 'Core only'}</span>
                      : plan.modules.map(m => {
                          const moduleLabels: Record<string, { en: string; ar: string; icon: React.ElementType }> = {
                            finance:   { en: 'Finance',   ar: 'المالية',  icon: Landmark },
                            inventory: { en: 'Inventory', ar: 'المخزن',   icon: Package },
                            ai:        { en: 'AI',        ar: 'ذكاء اصطناعي', icon: Bot },
                            insurance: { en: 'Insurance', ar: 'التأمين',  icon: ShieldPlus },
                            reports:   { en: 'Reports',   ar: 'تقارير',   icon: BarChart3 },
                          };
                          const ml = moduleLabels[m];
                          const MIcon = ml?.icon ?? Check;
                          return (
                            <Badge key={m} variant="secondary" className="text-[10px] gap-1 px-1.5 py-0.5">
                              <MIcon className="h-2.5 w-2.5" />
                              {isAr ? ml?.ar : ml?.en}
                            </Badge>
                          );
                        })
                    }
                  </div>
                </div>
                {!isSuperAdmin && (
                  <Button
                    className="w-full"
                    variant={isActive ? 'outline' : isMostPopular ? 'default' : 'outline'}
                    disabled={isActive}
                    onClick={() => subscribe(plan)}
                  >
                    {isActive ? (isAr ? 'خطتك الحالية' : 'Current Plan') : (isAr ? 'اشترك الآن' : 'Subscribe')}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add-ons */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-primary" />
            {isAr ? 'إضافات اختيارية' : 'Optional Add-ons'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { en: 'SMS Notifications', ar: 'إشعارات SMS', price: '500 ج.م/سنة' },
              { en: 'AI Assistant Pack', ar: 'باقة المساعد الذكي', price: '1,000 ج.م/سنة' },
              { en: 'Priority Support', ar: 'دعم فني أولوية', price: '800 ج.م/سنة' },
            ].map((addon, i) => (
              <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium text-sm">{isAr ? addon.ar : addon.en}</p>
                  <p className="text-xs text-muted-foreground">{addon.price}</p>
                </div>
                <Button size="sm" variant="outline" className="text-xs h-7">
                  {isAr ? 'إضافة' : 'Add'}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* SuperAdmin Management View */}
      {isSuperAdmin && subscriptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              {isAr ? 'إدارة الاشتراكات' : 'Subscription Management'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {subscriptions.map(sub => {
                const plan = plans.find(p => p.id === sub.planId);
                return (
                  <div key={sub.id} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                    <div>
                      <p className="font-medium">{sub.clinicId.slice(0, 8)}…</p>
                      <p className="text-muted-foreground">{isAr ? plan?.nameAr : plan?.name} · {sub.startDate}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{sub.amountPaid.toLocaleString()} ج.م</span>
                      <Badge variant={sub.status === 'active' ? 'default' : 'secondary'}>{sub.status}</Badge>
                      {sub.status === 'active' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => clinicSubscriptionStore.update(s => s.id === sub.id, { status: 'cancelled' })}>
                          {isAr ? 'إلغاء' : 'Cancel'}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SubscriptionPlans;
