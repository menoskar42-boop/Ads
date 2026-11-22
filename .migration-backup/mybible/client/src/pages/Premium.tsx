import { useState } from 'react';
import { motion } from 'framer-motion';
import { Crown, Check, Sparkles, Search, Youtube, Brain, Heart } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const freeFeatures = [
  'نص الكتاب المقدس كاملاً',
  'آية اليوم',
  'اقتراحات القراءة اليومية',
  'خطط القراءة (30-365 يوم)',
  'تظليل الآيات بألوان متعددة',
  'تصفح حسب المشاعر والموضوعات',
  'قصص الأطفال المصورة'
];

const premiumFeatures = [
  { icon: Brain, text: 'تحليل مشاعر متقدم - أتكلم مع الإنجيل' },
  { icon: Search, text: 'بحث موضوعي ذكي بالمعنى والسياق' },
  { icon: Heart, text: 'اقتراحات آيات مخصصة حسب حالتك' },
  { icon: Youtube, text: 'روابط عظات يوتيوب حسب الموضوع' }
];

export default function Premium() {
  const [isSubscribed, setIsSubscribed] = useState(false);

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', bounce: 0.5, delay: 0.2 }}
            className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center mx-auto mb-4 shadow-lg"
          >
            <Crown className="w-10 h-10 text-white" />
          </motion.div>
          <h1 className="font-display text-3xl font-bold text-foreground mb-2">النسخة المدفوعة</h1>
          <p className="text-muted-foreground">ترقية اختيارية لتجربة أفضل مع الذكاء الاصطناعي</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card className="p-6 border-2 border-border">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-foreground">المجانية</h2>
                <p className="text-sm text-muted-foreground">للجميع مجانًا</p>
              </div>
            </div>

            <div className="text-3xl font-bold text-foreground mb-4">
              $0
              <span className="text-sm font-normal text-muted-foreground">/شهريًا</span>
            </div>

            <ul className="space-y-3 mb-6">
              {freeFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <span className="text-sm text-foreground">{feature}</span>
                </li>
              ))}
            </ul>

            <Button variant="outline" className="w-full" disabled data-testid="button-current-plan">
              الخطة الحالية
            </Button>
          </Card>

          <Card className={cn(
            'p-6 border-2 relative overflow-hidden',
            isSubscribed ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20' : 'border-primary'
          )}>
            <Badge className="absolute top-4 left-4 bg-gradient-to-l from-amber-500 to-amber-600">
              موصى به
            </Badge>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
                <Crown className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-foreground">المدفوعة</h2>
                <p className="text-sm text-muted-foreground">ذكاء اصطناعي متقدم</p>
              </div>
            </div>

            <div className="text-3xl font-bold text-foreground mb-1">
              $0.10
              <span className="text-sm font-normal text-muted-foreground">/شهريًا</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">200 طلب ذكاء اصطناعي/شهر</p>

            <ul className="space-y-3 mb-6">
              <li className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                <span>كل مميزات النسخة المجانية</span>
              </li>
              {premiumFeatures.map((feature) => (
                <li key={feature.text} className="flex items-start gap-2">
                  <feature.icon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <span className="text-sm text-foreground font-medium">{feature.text}</span>
                </li>
              ))}
            </ul>

            {isSubscribed ? (
              <div className="space-y-3">
                <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-xl text-center">
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    أنت مشترك! ✨
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                    متبقي 187 طلب هذا الشهر
                  </p>
                </div>
                <Button variant="outline" className="w-full" onClick={() => setIsSubscribed(false)} data-testid="button-cancel">
                  إلغاء الاشتراك
                </Button>
              </div>
            ) : (
              <Button
                className="w-full bg-gradient-to-l from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white"
                onClick={() => setIsSubscribed(true)}
                data-testid="button-subscribe"
              >
                <Crown className="w-4 h-4 ml-2" />
                اشترك الآن
              </Button>
            )}
          </Card>
        </div>

        <Card className="p-6 bg-muted/30">
          <h3 className="font-display text-lg font-bold text-foreground mb-4 text-center">
            لماذا النسخة المدفوعة؟
          </h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="p-4 bg-background rounded-xl">
              <Brain className="w-8 h-8 text-primary mb-2" />
              <h4 className="font-semibold text-foreground mb-1">فهم أعمق</h4>
              <p className="text-sm text-muted-foreground">
                الذكاء الاصطناعي المدفوع يفهم مشاعرك المركبة ويقدم آيات أدق
              </p>
            </div>
            <div className="p-4 bg-background rounded-xl">
              <Search className="w-8 h-8 text-primary mb-2" />
              <h4 className="font-semibold text-foreground mb-1">بحث بالمعنى</h4>
              <p className="text-sm text-muted-foreground">
                ابحث بالسياق وليس بالكلمات فقط للوصول لما تحتاجه
              </p>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
