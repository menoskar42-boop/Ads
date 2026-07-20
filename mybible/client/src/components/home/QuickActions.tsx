import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { Heart, CalendarDays, Highlighter, Baby, Search, BookOpen, Users, Cross, Home, ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';

const actions = [
  { 
    href: '/emotions', 
    label: 'تعزية روحية', 
    icon: Heart, 
    color: 'from-rose-500/20 to-rose-600/10 border-rose-500/20',
    iconColor: 'text-rose-500'
  },
  { 
    href: '/plans', 
    label: 'خطط القراءة', 
    icon: CalendarDays, 
    color: 'from-blue-500/20 to-blue-600/10 border-blue-500/20',
    iconColor: 'text-blue-500'
  },
  { 
    href: '/highlights', 
    label: 'آياتي المحفوظة', 
    icon: Highlighter, 
    color: 'from-amber-500/20 to-amber-600/10 border-amber-500/20',
    iconColor: 'text-amber-500'
  },
  { 
    href: '/kids', 
    label: 'للأطفال', 
    icon: Baby, 
    color: 'from-purple-500/20 to-purple-600/10 border-purple-500/20',
    iconColor: 'text-purple-500'
  },
  { 
    href: '/search', 
    label: 'بحث ذكي', 
    icon: Search, 
    color: 'from-teal-500/20 to-teal-600/10 border-teal-500/20',
    iconColor: 'text-teal-500'
  },
  { 
    href: '/bible', 
    label: 'الإنجيل', 
    icon: BookOpen, 
    color: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/20',
    iconColor: 'text-emerald-500'
  },
  { 
    href: '/groups', 
    label: 'مجموعات مدارس الأحد', 
    icon: Users, 
    color: 'from-indigo-500/20 to-indigo-600/10 border-indigo-500/20',
    iconColor: 'text-indigo-500'
  },
  {
    href: '/family',
    label: 'ركن العائلة',
    icon: Home,
    color: 'from-emerald-500/20 to-teal-600/10 border-emerald-500/20',
    iconColor: 'text-emerald-600'
  },
  {
    href: '/orthodox',
    label: 'أرثوذوكسيات',
    icon: Cross,
    color: 'from-amber-500/20 to-amber-600/10 border-amber-500/20',
    iconColor: 'text-amber-600'
  },
  {
    href: '/service',
    label: 'قسم الخدمة',
    icon: ScrollText,
    color: 'from-orange-500/20 to-red-600/10 border-orange-500/20',
    iconColor: 'text-orange-600'
  },
];

export function QuickActions() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <h2 className="font-display text-lg font-bold text-foreground mb-4">الوصول السريع</h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {actions.map((action, index) => {
          const Icon = action.icon;
          return (
            <motion.div
              key={action.href}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.1 + index * 0.05 }}
            >
              <Link href={action.href}>
                <button
                  className={cn(
                    'w-full flex flex-col items-center gap-2 p-4 rounded-2xl bg-gradient-to-br border transition-all hover:scale-105 hover:shadow-md',
                    action.color
                  )}
                  data-testid={`quick-action-${action.href.replace('/', '')}`}
                >
                  <div className={cn('w-10 h-10 rounded-xl bg-background/80 flex items-center justify-center shadow-sm', action.iconColor)}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-medium text-foreground text-center leading-tight">
                    {action.label}
                  </span>
                </button>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
