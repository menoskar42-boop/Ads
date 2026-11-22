import { ReactNode } from 'react';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { Footer } from './Footer';

interface LayoutProps {
  children: ReactNode;
  isPremium?: boolean;
  onToggleTheme?: () => void;
  isDark?: boolean;
}

export function Layout({ children, isPremium, onToggleTheme, isDark }: LayoutProps) {
  return (
    <div className="min-h-screen bg-ornate bg-pattern-islamic">
      <Header isPremium={isPremium} onToggleTheme={onToggleTheme} isDark={isDark} />
      <main className="pb-24 lg:pb-8">
        {children}
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}
