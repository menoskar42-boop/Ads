import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpLeft,
  BookOpen,
  Check,
  ChevronLeft,
  Headphones,
  Home as HomeIcon,
  Info,
  Lightbulb,
  Menu,
  Monitor,
  PackageSearch,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
  Zap,
} from 'lucide-react';

type Product = {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  score: string;
  rating: string;
  reviews: string;
  verdict: string;
  badge: string;
  palette: string;
  shape: 'box' | 'headphones' | 'kettle';
  traits: string[];
};

const products: Product[] = [
  {
    id: 'anker-q20i',
    name: 'سماعة Anker Soundcore Q20i',
    category: 'audio',
    categoryLabel: 'صوتيات',
    score: '8.7',
    rating: '4.4',
    reviews: '2.1k',
    verdict: 'اختيار هادئ للعمل والسفر ببطارية طويلة.',
    badge: 'اختيار المحررين',
    palette: 'navy',
    shape: 'headphones',
    traits: ['عزل ضوضاء فعّال', 'بطارية تصل إلى 40 ساعة', 'مريحة للجلسات الطويلة'],
  },
  {
    id: 'philips-airfryer',
    name: 'قلاية Philips Essential',
    category: 'kitchen',
    categoryLabel: 'مطبخ',
    score: '8.3',
    rating: '4.3',
    reviews: '1.7k',
    verdict: 'حل عملي للمطابخ الصغيرة والوجبات اليومية.',
    badge: 'الأكثر توازناً',
    palette: 'orange',
    shape: 'kettle',
    traits: ['سعة 4.1 لتر', 'تنظيف سهل', 'تحكم بسيط وواضح'],
  },
  {
    id: 'kindle-paperwhite',
    name: 'قارئ Kindle Paperwhite',
    category: 'tech',
    categoryLabel: 'تقنية',
    score: '9.1',
    rating: '4.6',
    reviews: '3.4k',
    verdict: 'رفيق القراءة لمن يريد شاشة مريحة بلا تشتيت.',
    badge: 'للقراء الهادئين',
    palette: 'lilac',
    shape: 'box',
    traits: ['شاشة مريحة للعين', 'مقاوم للماء', 'مساحة تخزين 16 جيجابايت'],
  },
  {
    id: 'logitech-mx-keys',
    name: 'لوحة Logitech MX Keys Mini',
    category: 'tech',
    categoryLabel: 'تقنية',
    score: '8.5',
    rating: '4.5',
    reviews: '924',
    verdict: 'كتابة هادئة وتصميم صغير للمكاتب المرنة.',
    badge: 'للمكتب المنزلي',
    palette: 'rose',
    shape: 'box',
    traits: ['إضاءة خلفية ذكية', 'تبديل بين 3 أجهزة', 'تصميم موفّر للمساحة'],
  },
  {
    id: 'tiger-rice',
    name: 'حلة أرز Tiger صغيرة',
    category: 'kitchen',
    categoryLabel: 'مطبخ',
    score: '7.9',
    rating: '4.1',
    reviews: '687',
    verdict: 'مناسبة للوجبات الفردية والمساحات الضيقة.',
    badge: 'للمساحات الصغيرة',
    palette: 'orange',
    shape: 'kettle',
    traits: ['سعة مناسبة لشخصين', 'تحافظ على السخونة', 'تشغيل بزر واحد'],
  },
  {
    id: 'xiaomi-monitor',
    name: 'شاشة Xiaomi مكتبية 27 بوصة',
    category: 'tech',
    categoryLabel: 'تقنية',
    score: '8.1',
    rating: '4.2',
    reviews: '1.2k',
    verdict: 'مساحة مريحة للعمل بسعر مفهوم في الفئة.',
    badge: 'مكتب عملي',
    palette: 'navy',
    shape: 'box',
    traits: ['دقة QHD', 'ألوان متوازنة', 'حواف نحيفة'],
  },
];

const categories = [
  { id: 'tech', label: 'تقنية', count: '24 دليلاً', icon: Monitor },
  { id: 'audio', label: 'صوتيات', count: '12 دليلاً', icon: Headphones },
  { id: 'kitchen', label: 'مطبخ', count: '18 دليلاً', icon: HomeIcon },
  { id: 'home', label: 'منزل', count: '15 دليلاً', icon: Sparkles },
  { id: 'work', label: 'عمل ودراسة', count: '9 أدلة', icon: BookOpen },
  { id: 'fitness', label: 'عناية وحركة', count: '7 أدلة', icon: Zap },
];

function ProductArtwork({ product, large = false }: { product: Product; large?: boolean }) {
  return (
    <div className={`product-visual ${product.palette}${large ? ' detail-visual' : ''}`}>
      <span className="product-label">{product.badge}</span>
      <div className={`product-shape ${product.shape}`} aria-label={`رسم توضيحي لـ ${product.name}`} />
    </div>
  );
}

function Brand() {
  return (
    <a href="#top" className="brand" data-testid="link-brand">
      <span className="brand-mark" aria-hidden="true">ن</span>
      <span className="brand-copy">
        <strong>نِظرة</strong>
        <span>اختيارات أوضح، شراء أهدأ</span>
      </span>
    </a>
  );
}

function ProductCard({
  product,
  compared,
  onCompare,
  onDetails,
  onHandoff,
}: {
  product: Product;
  compared: boolean;
  onCompare: (product: Product) => void;
  onDetails: (product: Product) => void;
  onHandoff: (product: Product) => void;
}) {
  return (
    <article className="product-card" data-testid={`card-product-${product.id}`}>
      <ProductArtwork product={product} />
      <div className="product-body">
        <div className="product-meta">
          <span>{product.categoryLabel}</span>
          <span className="stars" aria-label={`تقييم ${product.rating} من 5`}><Star size={12} fill="currentColor" /> {product.rating}</span>
        </div>
        <h3 data-testid={`text-product-name-${product.id}`}>{product.name}</h3>
        <p>{product.verdict}</p>
        <div className="product-actions">
          <button type="button" className="outline-btn" onClick={() => onDetails(product)} data-testid={`button-details-${product.id}`}>
            التفاصيل
          </button>
          <button type="button" className="primary-btn" onClick={() => onHandoff(product)} data-testid={`button-amazon-${product.id}`}>
            الانتقال إلى Amazon.eg
          </button>
          <button
            type="button"
            className="outline-btn"
            aria-pressed={compared}
            onClick={() => onCompare(product)}
            data-testid={`button-compare-${product.id}`}
          >
            {compared ? 'تمت الإضافة' : 'قارن'}
          </button>
        </div>
      </div>
    </article>
  );
}

function Home() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [comparedIds, setComparedIds] = useState<string[]>(['anker-q20i', 'kindle-paperwhite']);
  const [toast, setToast] = useState('');

  useEffect(() => {
    document.title = 'نِظرة — اختيارات أوضح للشراء من Amazon.eg';
    const description = 'نِظرة يساعدك على اكتشاف المنتجات ومقارنتها بوضوح قبل أن تكمل شراءك على Amazon.eg.';
    const setMeta = (name: string, content: string, property = false) => {
      const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`;
      let tag = document.head.querySelector(selector) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement('meta');
        property ? tag.setAttribute('property', name) : tag.setAttribute('name', name);
        document.head.appendChild(tag);
      }
      tag.content = content;
    };
    setMeta('description', description);
    setMeta('og:title', 'نِظرة — اختيارات أوضح للشراء من Amazon.eg', true);
    setMeta('og:description', description, true);
    setMeta('og:type', 'website', true);
    setMeta('twitter:card', 'summary', false);
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedProduct(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const filteredProducts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = activeCategory === 'all' || product.category === activeCategory;
      const matchesSearch = !query || `${product.name} ${product.categoryLabel} ${product.verdict}`.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, searchTerm]);

  const comparedProducts = comparedIds.map((id) => products.find((product) => product.id === id)).filter(Boolean) as Product[];

  const showToast = (message: string) => setToast(message);
  const handleHandoff = (product: Product) => {
    const amazonSearchUrl = `https://www.amazon.eg/s?k=${encodeURIComponent(product.name)}`;
    window.open(amazonSearchUrl, '_blank', 'noopener,noreferrer');
    showToast('انتقلت إلى Amazon.eg لإكمال البحث والشراء هناك.');
  };
  const toggleCompare = (product: Product) => {
    setComparedIds((current) => {
      if (current.includes(product.id)) {
        showToast('أزيل المنتج من المقارنة.');
        return current.filter((id) => id !== product.id);
      }
      if (current.length >= 3) {
        showToast('يمكنك مقارنة 3 منتجات كحد أقصى في هذه النسخة التجريبية.');
        return current;
      }
      showToast('أضيف المنتج إلى المقارنة.');
      return [...current, product.id];
    });
  };
  const jumpToProducts = () => document.getElementById('discover')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="app-shell" id="top" dir="rtl">
      <header className="topbar">
        <div className="container-wide topbar-inner">
          <Brand />
          <nav className="desktop-nav" aria-label="التنقل الرئيسي">
            <a href="#discover" data-testid="link-discover">اكتشف المنتجات</a>
            <a href="#compare" data-testid="link-compare">قارن</a>
            <a href="#guides" data-testid="link-guides">أدلة الشراء</a>
            <a href="#method" data-testid="link-method">كيف نختار؟</a>
          </nav>
          <div className="nav-actions">
            <button type="button" className="icon-btn" aria-label="فتح البحث" onClick={jumpToProducts} data-testid="button-nav-search">
              <Search size={17} />
            </button>
            <button type="button" className="icon-btn mobile-menu-btn" aria-label="فتح القائمة" aria-expanded={mobileMenu} onClick={() => setMobileMenu(!mobileMenu)} data-testid="button-mobile-menu">
              {mobileMenu ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        {mobileMenu && (
          <div className="mobile-drawer">
            <a href="#discover" onClick={() => setMobileMenu(false)} data-testid="link-mobile-discover">اكتشف المنتجات</a>
            <a href="#compare" onClick={() => setMobileMenu(false)} data-testid="link-mobile-compare">قارن اختياراتك</a>
            <a href="#guides" onClick={() => setMobileMenu(false)} data-testid="link-mobile-guides">أدلة الشراء</a>
            <a href="#method" onClick={() => setMobileMenu(false)} data-testid="link-mobile-method">كيف نختار؟</a>
          </div>
        )}
      </header>

      <main>
        <section className="hero">
          <div className="container-wide hero-grid">
            <div>
              <div className="eyebrow">رفيق البحث المصري</div>
              <h1>قبل أن تشتري،<br /><em>خد نظرة</em> أهدى.</h1>
              <p className="hero-lede">نِظرة يجمع لك الخلاصة التي تهمك: ما الذي يستحق؟ وما الذي يمكنك تجاهله؟ اكتشف، قارن، ثم أكمل قرارك على Amazon.eg وأنت مطمئن.</p>
              <form className="search-box" onSubmit={(event) => { event.preventDefault(); jumpToProducts(); }} role="search">
                <Search size={19} aria-hidden="true" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="ابحث عن منتج، فئة، أو استخدام..."
                  aria-label="ابحث عن منتج أو فئة"
                  data-testid="input-product-search"
                />
                <button type="submit" className="search-button" data-testid="button-search">ابحث</button>
              </form>
              <div className="search-hints">
                <span>جرّب:</span>
                <button type="button" onClick={() => setSearchTerm('سماعة')} data-testid="button-search-hint-headphones">سماعة عزل</button>
                <button type="button" onClick={() => setSearchTerm('مطبخ')} data-testid="button-search-hint-kitchen">أساسيات المطبخ</button>
              </div>
            </div>
            <div className="hero-art" aria-label="رسم توضيحي لبطاقة بحث ومقارنة">
              <div className="art-orbit" />
              <div className="art-paper">
                <span className="paper-tag">ورقة نِظرة رقم ٠١</span>
                <div className="paper-lines"><i /><i /><i /><i /><i /></div>
              </div>
              <span className="art-sticker sticker-top">نقارن قبل ما نرشّح</span>
              <span className="art-sticker sticker-bottom">خلاصة مفيدة</span>
            </div>
          </div>
        </section>

        <div className="notice-strip">
          <div className="container-wide notice-inner">
            <ShieldCheck size={17} />
            <span><strong>نِظرة لا يبيع لك شيئاً.</strong> الدفع والشحن والإرجاع وخدمة العملاء تتم بالكامل على Amazon.eg.</span>
          </div>
        </div>

        <section className="section" id="categories">
          <div className="container-wide">
            <div className="section-heading">
              <div><div className="eyebrow">ابدأ من المكان الصح</div><h2>ماذا تبحث عنه اليوم؟</h2></div>
              <p>فئات مختارة حول استخدامات حقيقية في البيت والمكتب والحياة اليومية.</p>
            </div>
            <div className="category-grid">
              <button type="button" className="category-card" onClick={() => { setActiveCategory('all'); jumpToProducts(); }} data-testid="button-category-all">
                <span className="category-icon"><SlidersHorizontal size={20} /></span><strong>كل الاختيارات</strong><span>كل المنتجات المختارة</span>
              </button>
              {categories.map((category) => {
                const Icon = category.icon;
                return (
                  <button type="button" className="category-card" key={category.id} onClick={() => { setActiveCategory(category.id); jumpToProducts(); }} data-testid={`button-category-${category.id}`}>
                    <span className="category-icon"><Icon size={20} /></span><strong>{category.label}</strong><span>{category.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="section section-tinted" id="discover">
          <div className="container-wide">
            <div className="section-heading">
              <div><div className="eyebrow">اختيارات لها سبب</div><h2>منتجات نرجع لها</h2></div>
              <p>بيانات تحريرية تجريبية للتوضيح فقط — ليست أسعاراً أو توافراً حياً.</p>
            </div>
            <div className="product-grid">
              {filteredProducts.length ? filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} compared={comparedIds.includes(product.id)} onCompare={toggleCompare} onDetails={setSelectedProduct} onHandoff={handleHandoff} />
              )) : (
                <div className="search-empty" data-testid="empty-search-state">
                  <PackageSearch size={27} />
                  <strong>لم نجد اختياراً مطابقاً بعد</strong>
                  <span>جرّب كلمة أبسط أو ارجع لكل المنتجات.</span><br />
                  <button type="button" onClick={() => { setSearchTerm(''); setActiveCategory('all'); }} data-testid="button-clear-search">إظهار كل المنتجات</button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="section" id="compare">
          <div className="container-wide">
            <div className="compare-panel">
              <div className="compare-head">
                <div><div className="eyebrow" style={{ color: '#f0be7b' }}>قرارك في سطرين</div><h2>قارن بهدوء</h2></div>
                <p>اختر حتى 3 منتجات. لا نبحث عن فائز مطلق؛ نبحث عن الأنسب لاستخدامك.</p>
              </div>
              {comparedProducts.length < 2 ? (
                <div className="compare-empty" data-testid="empty-compare-state">
                  <Info size={20} /><div>أضف منتجين على الأقل لترى المقارنة.</div>
                  <button type="button" onClick={jumpToProducts} data-testid="button-add-compare">تصفح الاختيارات</button>
                </div>
              ) : (
                <div className="compare-table-wrap">
                  <table className="compare-table">
                    <thead><tr><th>المعيار</th>{comparedProducts.map((product) => <th key={product.id}><span className="compare-product-name"><span className="mini-art">{product.categoryLabel.slice(0, 1)}</span>{product.name}</span></th>)}</tr></thead>
                    <tbody>
                      <tr><td>تقييم نِظرة</td>{comparedProducts.map((product) => <td key={product.id} className="good">{product.score} / 10</td>)}</tr>
                      <tr><td>تقييم المستخدمين</td>{comparedProducts.map((product) => <td key={product.id}><span className="stars"><Star size={11} fill="currentColor" /> {product.rating}</span> <small>({product.reviews})</small></td>)}</tr>
                      <tr><td>الخلاصة</td>{comparedProducts.map((product) => <td key={product.id}>{product.verdict}</td>)}</tr>
                      <tr><td>يناسبك إذا</td>{comparedProducts.map((product) => <td key={product.id} className="warm">{product.traits[0]}</td>)}</tr>
                      <tr><td>إجراء</td>{comparedProducts.map((product) => <td key={product.id}><button type="button" className="outline-btn" onClick={() => handleHandoff(product)} data-testid={`button-compare-amazon-${product.id}`}>شاهد على Amazon.eg</button></td>)}</tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="section section-tinted" id="guides">
          <div className="container-wide">
            <div className="section-heading">
              <div><div className="eyebrow">دليل من إنسان لإنسان</div><h2>اقرأ قبل ما تقارن</h2></div>
              <a className="text-link" href="#guides" data-testid="link-all-guides">كل الأدلة <ChevronLeft size={14} style={{ verticalAlign: 'middle' }} /></a>
            </div>
            <div className="guide-grid">
              <article className="guide-feature">
                <span className="guide-kicker">دليل عملي · ٦ دقائق</span>
                <h3>كيف تختار سماعة تعيش معك في المواصلات والشغل؟</h3>
                <p>العزل ليس كل شيء. نفكك الراحة، الميكروفون، البطارية، وما الذي يهم فعلاً في يوم مصري طويل.</p>
                <button type="button" className="text-link" style={{ border: 0, background: 'transparent', padding: '12px 0 0', textAlign: 'right', width: 'fit-content' }} onClick={() => showToast('هذا الدليل التحريري سيُفتح قريباً في النسخة القادمة.')} data-testid="button-read-feature-guide">اقرأ الدليل <ArrowLeft size={14} style={{ verticalAlign: 'middle' }} /></button>
              </article>
              <div className="guide-side">
                <article className="guide-card"><span className="guide-kicker">مقارنة سريعة · ٤ دقائق</span><h3>القلاية الهوائية: ما السعة المناسبة لبيتك؟</h3><span>للمطبخ اليومي</span></article>
                <article className="guide-card"><span className="guide-kicker">ورقة قرار · ٣ دقائق</span><h3>هل تحتاج شاشة 4K فعلاً لمكتبك؟</h3><span>للعمل والدراسة</span></article>
              </div>
            </div>
          </div>
        </section>

        <section className="section method-section" id="method">
          <div className="container-wide method-grid">
            <div>
              <div className="eyebrow">منهج نِظرة</div>
              <h2>أقل ضجيجاً.<br />أكثر فائدة.</h2>
              <p>نحن لا نعيد كتابة وصف المنتج. نقرأ المواصفات، نضعها في سياق الاستخدام، ونقول لك أين يدفع المنتج ثمنه وأين يستحق.</p>
            </div>
            <div className="method-list">
              <div className="method-item"><span className="method-number">01</span><div><strong>نحدد الاستخدام</strong><span>مواصلات؟ مكتب؟ مطبخ صغير؟ القرار يبدأ من يومك أنت.</span></div></div>
              <div className="method-item"><span className="method-number">02</span><div><strong>نقارن ما يفرق</strong><span>نستبعد الأرقام اللامعة ونركز على الراحة، الاعتمادية، والعمر.</span></div></div>
              <div className="method-item"><span className="method-number">03</span><div><strong>نترك القرار لك</strong><span>ترشيح واضح، سبب مفهوم، ثم رابطك إلى Amazon.eg لإتمام الشراء هناك.</span></div></div>
            </div>
          </div>
        </section>

        <section className="disclosure">
          <div className="container-wide disclosure-inner">
            <Info size={17} />
            <div><strong>إفصاح مهم:</strong> قد نكسب عمولة إحالة إذا أكملت شراءك من خلال بعض الروابط. هذا لا يغيّر سعر المنتج عليك، ولا يجعل Amazon.eg جزءاً من نِظرة. الأسعار، التوافر، الدفع، الشحن، الإرجاع وخدمة العملاء مسؤولية Amazon.eg وحدها.</div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container-wide">
          <div className="footer-grid">
            <div><Brand /><p style={{ maxWidth: 300, marginTop: 18 }}>مساحة مصرية تساعدك على الشراء بوعي، من غير استعجال ومن غير ضجيج.</p></div>
            <div><h4>استكشف</h4><div className="footer-links"><a href="#discover" data-testid="link-footer-products">المنتجات المختارة</a><a href="#compare" data-testid="link-footer-compare">المقارنة</a><a href="#guides" data-testid="link-footer-guides">أدلة الشراء</a></div></div>
            <div><h4>شفافية</h4><div className="footer-links"><a href="#method" data-testid="link-footer-method">منهجنا</a><a href="#top" data-testid="link-footer-disclosure">الإفصاح والخصوصية</a><a href="#top" data-testid="link-footer-amazon">عن Amazon.eg</a></div></div>
          </div>
          <div className="footer-bottom"><span>© 2025 نِظرة. نسخة تأسيسية تحريرية.</span><span>هذه ليست واجهة متجر — نحن نساعدك على اتخاذ القرار فقط.</span></div>
        </div>
      </footer>

      {selectedProduct && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedProduct(null); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="product-dialog-title" data-testid="dialog-product-details">
            <div className="modal-head">
              <button type="button" className="icon-btn modal-close" aria-label="إغلاق التفاصيل" onClick={() => setSelectedProduct(null)} data-testid="button-close-details"><X size={17} /></button>
              <div className="eyebrow">بطاقة المنتج التحريرية</div>
              <h2 id="product-dialog-title">{selectedProduct.name}</h2>
              <p>مراجعة مختصرة مبنية على بيانات تجريبية — لا تمثل سعراً أو توافراً حياً.</p>
            </div>
            <div className="modal-content">
              <div className="detail-layout">
                <ProductArtwork product={selectedProduct} large />
                <div className="detail-copy">
                  <h3>{selectedProduct.verdict}</h3>
                  <p>إذا كان هذا قريباً من استخدامك اليومي، فهذه هي النقاط التي تستحق أن تراجعها قبل اتخاذ القرار.</p>
                  <div className="detail-points">{selectedProduct.traits.map((trait) => <div key={trait}><Check size={15} /><span>{trait}</span></div>)}</div>
                  <button type="button" className="primary-btn" onClick={() => handleHandoff(selectedProduct)} data-testid={`button-detail-amazon-${selectedProduct.id}`}>راجع المنتج على Amazon.eg <ArrowUpLeft size={14} style={{ verticalAlign: 'middle' }} /></button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status" data-testid="status-toast">{toast}</div>}
    </div>
  );
}

function App() {
  return <Home />;
}

export default App;