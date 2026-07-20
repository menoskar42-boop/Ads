import { Link } from 'wouter';

export function Footer() {
  return (
    <footer className="border-t border-border/50 bg-card/50 py-6 mb-16 lg:mb-0" dir="rtl">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="flex flex-col items-center gap-4">
          <nav className="flex flex-wrap justify-center gap-4 text-sm" aria-label="روابط الموقع">
            <Link href="/bible" className="text-muted-foreground hover:text-primary transition-colors" data-testid="link-footer-bible">
              الكتاب المقدس
            </Link>
            <Link href="/orthodox" className="text-muted-foreground hover:text-primary transition-colors" data-testid="link-footer-orthodox">
              أرثوذوكسيات
            </Link>
            <Link href="/kids" className="text-muted-foreground hover:text-primary transition-colors" data-testid="link-footer-kids">
              للأطفال
            </Link>
            <Link href="/plans" className="text-muted-foreground hover:text-primary transition-colors" data-testid="link-footer-plans">
              خطط القراءة
            </Link>
            <Link href="/emotions" className="text-muted-foreground hover:text-primary transition-colors" data-testid="link-footer-emotions">
              التعزية الروحية
            </Link>
            <Link href="/daily-verse" className="text-muted-foreground hover:text-primary transition-colors" data-testid="link-footer-daily">
              آية اليوم
            </Link>
            <Link href="/search" className="text-muted-foreground hover:text-primary transition-colors" data-testid="link-footer-search">
              بحث
            </Link>
            <Link href="/about" className="text-muted-foreground hover:text-primary transition-colors" data-testid="link-about">
              من نحن
            </Link>
            <Link href="/privacy" className="text-muted-foreground hover:text-primary transition-colors" data-testid="link-privacy">
              سياسة الخصوصية
            </Link>
            <Link href="/contact" className="text-muted-foreground hover:text-primary transition-colors" data-testid="link-contact">
              تواصل معنا
            </Link>
          </nav>
          <p className="text-xs text-muted-foreground text-center">
            الكتاب المقدس رفيقي — منصة مجانية للقراءة اليومية والتفسير والتعزية الروحية
          </p>
        </div>
      </div>
    </footer>
  );
}
