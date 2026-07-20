import { Link, useLocation } from 'wouter';
import { Home, Book, CalendarDays, Heart, Baby } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'الرئيسية', icon: Home },
  { href: '/bible', label: 'الكتاب', icon: Book },
  { href: '/plans', label: 'خطط', icon: CalendarDays },
  { href: '/emotions', label: 'تعزية', icon: Heart },
  { href: '/kids', label: 'أطفال', icon: Baby },
];

export function BottomNav() {
  const [location] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-background/95 backdrop-blur-xl border-t border-border/50 safe-area-pb">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          
          return (
            <Link key={item.href} href={item.href}>
              <button
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-xl transition-all min-w-[60px]',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                data-testid={`bottom-nav-${item.href.replace('/', '') || 'home'}`}
              >
                <div className={cn(
                  'p-1.5 rounded-lg transition-colors',
                  isActive && 'bg-primary/10'
                )}>
                  <Icon className={cn('w-6 h-6', isActive && 'stroke-[2.5]')} />
                </div>
                <span className="text-xs font-semibold">{item.label}</span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
