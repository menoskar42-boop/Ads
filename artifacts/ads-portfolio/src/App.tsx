import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowUpLeft,
  Asterisk,
  Instagram,
  Linkedin,
  Mail,
  MapPin,
  Menu,
  MoveUpLeft,
  Phone,
  X,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

type Category = 'الكل' | 'هوية' | 'تجارب رقمية' | 'حملات';

type Project = {
  id: string;
  title: string;
  titleEn: string;
  category: Exclude<Category, 'الكل'>;
  year: string;
  description: string;
  result: string;
  color: string;
  foreground: string;
  kind: 'app' | 'identity' | 'campaign' | 'digital';
};

const projects: Project[] = [
  {
    id: 'nawa',
    title: 'نَوَى',
    titleEn: 'Nawa — web app',
    category: 'تجارب رقمية',
    year: '2024',
    description: 'منصة ذكية تعيد ترتيب علاقتنا بالمال، بتجربة عربية تنساب مثل الحديث.',
    result: 'من التعقيد إلى قرار واضح',
    color: '#d7f26b',
    foreground: '#101b2b',
    kind: 'app',
  },
  {
    id: 'sifr',
    title: 'صِفر',
    titleEn: 'Sifr identity',
    category: 'هوية',
    year: '2024',
    description: 'هوية بصرية لمقهى يرفض أن يشبه أي مقهى آخر.',
    result: 'هوية تتسع لكل كوب',
    color: '#ff785e',
    foreground: '#101b2b',
    kind: 'identity',
  },
  {
    id: 'athar',
    title: 'أثر',
    titleEn: 'Athar / launch campaign',
    category: 'حملات',
    year: '2023',
    description: 'إطلاق يترك أثره في الشارع قبل أن يصل إلى الشاشة.',
    result: 'صوت جديد في المدينة',
    color: '#4558f5',
    foreground: '#f3ecdf',
    kind: 'campaign',
  },
  {
    id: 'bayt',
    title: 'بيت التمر',
    titleEn: 'Bayt Al Tamr',
    category: 'تجارب رقمية',
    year: '2023',
    description: 'متجر إلكتروني يجعل اختيار الهدية لحظة تستحق التمهّل.',
    result: 'تجربة شراء بذاكرة',
    color: '#6bd0c3',
    foreground: '#101b2b',
    kind: 'digital',
  },
];

function useReveal() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.12 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, className: visible ? 'reveal is-visible' : 'reveal' };
}

function Logo({ light = false }: { light?: boolean }) {
  return (
    <a href="#top" className="group inline-flex items-center gap-3" data-testid="link-logo">
      <span className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${light ? 'border-[#d7f26b] text-[#d7f26b]' : 'border-[#101b2b] text-[#101b2b]'}`}>
        <Asterisk size={22} strokeWidth={2.2} />
      </span>
      <span className={`display-type text-lg font-black tracking-[-.06em] ${light ? 'text-[#f3ecdf]' : 'text-[#101b2b]'}`}>أدز<span className={light ? 'text-[#d7f26b]' : 'text-[#ff785e]'}>.</span></span>
    </a>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: '#work', label: 'أعمالنا' },
    { href: '#approach', label: 'طريقتنا' },
    { href: '#studio', label: 'الاستوديو' },
  ];
  return (
    <header className="absolute inset-x-0 top-0 z-40" id="top">
      <div className="mx-auto flex max-w-[1380px] items-center justify-between px-5 py-5 md:px-10 md:py-7">
        <Logo light />
        <nav className="hidden items-center gap-9 md:flex" aria-label="التنقل الرئيسي">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="text-sm text-[#f3ecdf]/75 transition-colors hover:text-[#d7f26b]" data-testid={`link-nav-${link.href.slice(1)}`}>
              {link.label}
            </a>
          ))}
        </nav>
        <a href="#contact" className="hidden items-center gap-2 rounded-full bg-[#d7f26b] px-5 py-3 text-sm font-bold text-[#101b2b] transition-transform hover:-translate-y-0.5 md:inline-flex" data-testid="link-header-contact">
          لنتحدث <ArrowUpLeft size={16} />
        </a>
        <button className="rounded-full border border-[#f3ecdf]/30 p-2 text-[#f3ecdf] md:hidden" onClick={() => setOpen((state) => !state)} aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'} aria-expanded={open} data-testid="button-mobile-menu">
          {open ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>
      {open && (
        <nav className="menu-panel mx-5 rounded-2xl border border-[#f3ecdf]/15 bg-[#17263a] p-3 shadow-2xl md:hidden" aria-label="قائمة الهاتف">
          {links.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="block rounded-xl px-4 py-3 text-sm text-[#f3ecdf] hover:bg-[#f3ecdf]/10" data-testid={`link-mobile-${link.href.slice(1)}`}>
              {link.label}
            </a>
          ))}
          <a href="#contact" onClick={() => setOpen(false)} className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#d7f26b] px-4 py-3 text-sm font-bold text-[#101b2b]" data-testid="link-mobile-contact">
            ابدأ مشروعك <ArrowUpLeft size={16} />
          </a>
        </nav>
      )}
    </header>
  );
}

function Hero() {
  const hero = useReveal();
  return (
    <section className="hero-grid relative min-h-[720px] overflow-hidden bg-[#101b2b] text-[#f3ecdf] md:min-h-[800px]" id="hero">
      <div className="absolute -right-20 top-28 h-72 w-72 rounded-full border border-[#d7f26b]/20 md:h-[30rem] md:w-[30rem]" />
      <div className="orbit absolute -right-20 top-28 h-72 w-72 rounded-full border border-dashed border-[#ff785e]/40 md:h-[30rem] md:w-[30rem]" />
      <div className="absolute right-[14%] top-44 h-4 w-4 rounded-full bg-[#ff785e] shadow-[0_0_0_10px_rgba(255,120,94,.12)]" />
      <div className="absolute bottom-10 left-[9%] h-28 w-28 rotate-12 border border-[#d7f26b]/40 md:h-52 md:w-52" />
      <div className="mx-auto flex min-h-[720px] max-w-[1380px] flex-col justify-end px-5 pb-16 pt-36 md:min-h-[800px] md:px-10 md:pb-24">
        <div ref={hero.ref} className={`${hero.className} relative z-10 max-w-5xl`}>
          <div className="mb-7 flex items-center gap-3 text-xs font-bold text-[#d7f26b]">
            <span className="h-px w-10 bg-[#d7f26b]" />
            استوديو رقمي من الرياض إلى العالم
          </div>
          <h1 className="display-type max-w-4xl text-[clamp(3.2rem,8.4vw,8.8rem)] font-black leading-[1.08]">
            نحوّل الطموح
            <br />
            <span className="text-[#d7f26b]">إلى حضور</span>
            <br />
            لا يُنسى<span className="text-[#ff785e]">.</span>
          </h1>
          <div className="mt-9 flex flex-col gap-7 md:flex-row md:items-end md:justify-between">
            <p className="max-w-sm text-base leading-8 text-[#f3ecdf]/65">
              نبني علامات تجارية تعرف ماذا تقول، وكيف تجعل الناس يتوقفون — ثم يتذكرون.
            </p>
            <a href="#work" className="group inline-flex w-fit items-center gap-3 border-b border-[#d7f26b] pb-2 text-sm font-bold text-[#d7f26b]" data-testid="link-hero-work">
              اكتشف أعمالنا
              <ArrowDownLeft className="transition-transform group-hover:translate-y-1" size={19} />
            </a>
          </div>
        </div>
        <div className="mt-16 flex items-center justify-between border-t border-[#f3ecdf]/15 pt-5 text-[10px] text-[#f3ecdf]/45 md:mt-20">
          <span className="mono-type">ADS / CREATIVE DIGITAL STUDIO</span>
          <span className="hidden md:inline">نصنع فرقاً، لا ضجيجاً</span>
          <span className="mono-type">24°42′N 46°40′E</span>
        </div>
      </div>
    </section>
  );
}

function Marquee() {
  return (
    <div className="overflow-hidden border-b border-[#101b2b]/15 bg-[#d7f26b] py-4 text-[#101b2b]" aria-label="مجالاتنا">
      <div className="marquee-track flex w-max items-center gap-8 whitespace-nowrap text-sm font-black md:gap-12">
        {Array.from({ length: 2 }).flatMap((_, index) => [
          <span key={`a-${index}`}>استراتيجية</span>,
          <Asterisk key={`b-${index}`} size={16} />,
          <span key={`c-${index}`}>هوية</span>,
          <Asterisk key={`d-${index}`} size={16} />,
          <span key={`e-${index}`}>تجارب رقمية</span>,
          <Asterisk key={`f-${index}`} size={16} />,
          <span key={`g-${index}`}>حملات جريئة</span>,
          <Asterisk key={`h-${index}`} size={16} />,
        ])}
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, dark = false }: { eyebrow: string; title: string; dark?: boolean }) {
  return (
    <div className={`flex flex-col gap-6 md:flex-row md:items-end md:justify-between ${dark ? 'text-[#f3ecdf]' : 'text-[#101b2b]'}`}>
      <div>
        <div className={`mb-4 flex items-center gap-2 text-xs font-bold ${dark ? 'text-[#d7f26b]' : 'text-[#ff785e]'}`}>
          <span className={`h-2 w-2 rounded-full ${dark ? 'bg-[#d7f26b]' : 'bg-[#ff785e]'}`} />
          {eyebrow}
        </div>
        <h2 className="display-type max-w-2xl text-4xl font-black leading-[1.18] md:text-6xl">{title}</h2>
      </div>
    </div>
  );
}

function NawaArtwork() {
  return (
    <div className="project-visual relative h-full min-h-[390px] overflow-hidden bg-[#d7f26b] p-5 text-[#101b2b] md:min-h-[510px]">
      <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full border-[28px] border-[#101b2b]/10" />
      <div className="relative flex items-start justify-between text-[10px] font-bold">
        <span className="mono-type">NAWA / 01</span>
        <span className="rounded-full border border-[#101b2b]/30 px-3 py-1">WEB APP</span>
      </div>
      <div className="absolute bottom-8 right-6 w-[76%] max-w-[380px] rotate-[-5deg] rounded-2xl border border-[#101b2b]/15 bg-[#f3ecdf] p-4 shadow-[18px_20px_0_#101b2b] md:right-12">
        <div className="flex items-center justify-between border-b border-[#101b2b]/15 pb-3 text-[9px] font-bold">
          <span>مرحباً، سارة</span><span className="h-5 w-5 rounded-full bg-[#ff785e]" />
        </div>
        <p className="mt-5 text-right text-xs text-[#101b2b]/50">إجمالي محفظتك</p>
        <p className="display-type mt-1 text-right text-3xl font-black tracking-[-.08em]">١٢٬٤٨٠ <span className="text-sm">ر.س</span></p>
        <div className="mt-6 flex h-20 items-end gap-2 border-b border-[#101b2b]/10 pb-1">
          {[36, 52, 42, 68, 57, 82, 73, 94, 78].map((height, index) => (
            <span key={index} className="flex-1 rounded-t-sm bg-[#101b2b]" style={{ height: `${height}%`, opacity: .35 + index / 18 }} />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between text-[9px] font-bold">
          <span className="rounded-full bg-[#d7f26b] px-3 py-1.5">عرض التفاصيل</span><span className="text-[#101b2b]/45">هذا الشهر +١٧٪</span>
        </div>
      </div>
      <div className="absolute bottom-7 left-6 text-[10px] font-bold md:left-8">
        <span className="block text-5xl font-black leading-none">نَوى</span>
        <span className="mt-2 block">قرارك، أوضح.</span>
      </div>
    </div>
  );
}

function AbstractArtwork({ project }: { project: Project }) {
  return (
    <div className="project-visual relative min-h-[250px] overflow-hidden p-6" style={{ background: project.color, color: project.foreground }}>
      {project.kind === 'identity' && (
        <>
          <div className="absolute -left-8 top-10 h-40 w-40 rounded-full border-[24px] border-[#101b2b]/20" />
          <div className="absolute right-8 top-8 h-20 w-20 rotate-45 bg-[#101b2b]/85" />
          <div className="absolute bottom-[-30px] right-[-15px] h-40 w-40 rounded-full border-[16px] border-[#f3ecdf]/45" />
        </>
      )}
      {project.kind === 'campaign' && (
        <>
          <div className="absolute left-8 top-8 h-36 w-24 -rotate-12 border-2 border-[#f3ecdf]/60" />
          <div className="absolute left-16 top-14 h-36 w-24 rotate-12 border-2 border-[#f3ecdf]/60" />
          <div className="absolute bottom-4 right-5 text-[7rem] font-black leading-none text-[#f3ecdf]/20">أ</div>
        </>
      )}
      {project.kind === 'digital' && (
        <>
          <div className="absolute right-[-25px] top-[-25px] h-52 w-52 rounded-full bg-[#f3ecdf]/30" />
          <div className="absolute bottom-8 left-12 h-24 w-24 rounded-full border-[12px] border-[#101b2b]/30" />
          <div className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#101b2b]" />
        </>
      )}
      <div className="relative flex h-full min-h-[205px] flex-col justify-between">
        <div className="flex justify-between text-[10px] font-bold">
          <span className="mono-type">{project.titleEn.toUpperCase()}</span>
          <span>{project.year}</span>
        </div>
        <span className="display-type text-5xl font-black">{project.title}</span>
      </div>
    </div>
  );
}

function ProjectCard({ project, onOpen, featured = false }: { project: Project; onOpen: (project: Project) => void; featured?: boolean }) {
  return (
    <article className={`project-card group cursor-pointer ${featured ? 'md:col-span-2 md:grid md:grid-cols-[1.1fr_.9fr]' : ''}`} onClick={() => onOpen(project)} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpen(project); }} data-testid={`card-project-${project.id}`}>
      {featured ? <NawaArtwork /> : <AbstractArtwork project={project} />}
      <div className={`flex flex-col justify-between border-b border-[#101b2b]/20 bg-[#f3ecdf] p-5 ${featured ? 'min-h-[300px] md:p-8' : 'min-h-[205px]'}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="mono-type text-[10px] text-[#101b2b]/45">{project.titleEn}</span>
            <h3 className="display-type mt-2 text-3xl font-black">{project.title}</h3>
          </div>
          <span className="project-arrow flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#101b2b]/20">
            <MoveUpLeft size={18} />
          </span>
        </div>
        <div>
          <p className="max-w-sm text-sm leading-7 text-[#101b2b]/65">{project.description}</p>
          <div className="mt-5 flex items-center justify-between text-[10px] font-bold">
            <span>{project.category}</span>
            <span className="text-[#101b2b]/45">{project.result}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function Work() {
  const [filter, setFilter] = useState<Category>('الكل');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const section = useReveal();
  const visibleProjects = useMemo(() => filter === 'الكل' ? projects : projects.filter((project) => project.category === filter), [filter]);
  const filters: Category[] = ['الكل', 'تجارب رقمية', 'هوية', 'حملات'];
  return (
    <section className="bg-[#f3ecdf] px-5 py-24 md:px-10 md:py-36" id="work">
      <div ref={section.ref} className={`mx-auto max-w-[1380px] ${section.className}`}>
        <SectionHeading eyebrow="من أعمالنا / ٠١" title="أفكار خرجت من الشاشة، ودخلت الذاكرة." />
        <div className="mt-12 flex flex-wrap items-center gap-2 border-b border-[#101b2b]/15 pb-5">
          {filters.map((item) => (
            <button key={item} onClick={() => setFilter(item)} className={`rounded-full border px-4 py-2 text-xs font-bold transition-colors ${filter === item ? 'border-[#101b2b] bg-[#101b2b] text-[#f3ecdf]' : 'border-[#101b2b]/20 text-[#101b2b]/60 hover:border-[#101b2b]'}`} aria-pressed={filter === item} data-testid={`button-filter-${item}`}>
              {item}
            </button>
          ))}
          <span className="mr-auto hidden text-xs text-[#101b2b]/40 md:block">{visibleProjects.length.toString().padStart(2, '٠')} مشاريع مختارة</span>
        </div>
        {visibleProjects.length > 0 ? (
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {visibleProjects.map((project) => (
              <ProjectCard key={project.id} project={project} onOpen={setSelectedProject} featured={project.id === 'nawa' && (filter === 'الكل' || filter === 'تجارب رقمية')} />
            ))}
          </div>
        ) : (
          <div className="mt-8 flex min-h-64 flex-col items-center justify-center border border-dashed border-[#101b2b]/25 text-center">
            <Asterisk className="mb-4 text-[#ff785e]" size={28} />
            <p className="font-bold">نحضّر هذه المساحة الآن</p>
            <p className="mt-2 text-sm text-[#101b2b]/50">جرّب تصنيفاً آخر من فضلك.</p>
          </div>
        )}
      </div>
      {selectedProject && <ProjectModal project={selectedProject} onClose={() => setSelectedProject(null)} />}
    </section>
  );
}

function ProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#101b2b]/70 p-0 backdrop-blur-sm md:items-center md:p-6" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} data-testid="dialog-project">
      <div className="modal-in max-h-[92dvh] w-full max-w-3xl overflow-auto rounded-t-[2rem] bg-[#f3ecdf] p-6 text-[#101b2b] md:rounded-[2rem] md:p-10">
        <div className="flex items-start justify-between">
          <div>
            <span className="mono-type text-[10px] text-[#101b2b]/45">{project.titleEn}</span>
            <h2 id="project-dialog-title" className="display-type mt-2 text-4xl font-black">{project.title}</h2>
          </div>
          <button onClick={onClose} aria-label="إغلاق تفاصيل المشروع" className="rounded-full border border-[#101b2b]/20 p-2 hover:bg-[#101b2b] hover:text-[#f3ecdf]" data-testid="button-close-project">
            <X size={18} />
          </button>
        </div>
        <div className="mt-8 overflow-hidden rounded-2xl" style={{ backgroundColor: project.color }}>
          {project.id === 'nawa' ? <NawaArtwork /> : <AbstractArtwork project={project} />}
        </div>
        <div className="mt-8 grid gap-7 md:grid-cols-[1.2fr_.8fr]">
          <div>
            <p className="text-lg font-bold leading-9">{project.description}</p>
            <p className="mt-4 text-sm leading-8 text-[#101b2b]/65">بدأنا من سؤال بسيط، ثم بنينا لغة كاملة حوله. من أول شاشة إلى آخر تفصيلة، كل قرار هنا له سبب — وكل حركة تخدم القصة.</p>
          </div>
          <div className="border-t border-[#101b2b]/15 pt-4 text-sm">
            <div className="flex justify-between border-b border-[#101b2b]/15 py-3"><span className="text-[#101b2b]/50">المجال</span><b>{project.category}</b></div>
            <div className="flex justify-between border-b border-[#101b2b]/15 py-3"><span className="text-[#101b2b]/50">النتيجة</span><b>{project.result}</b></div>
            <div className="flex justify-between py-3"><span className="text-[#101b2b]/50">السنة</span><b>{project.year}</b></div>
          </div>
        </div>
        <a href="#contact" onClick={onClose} className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#101b2b] px-5 py-3 text-sm font-bold text-[#d7f26b]" data-testid="link-project-contact">
          نريد شيئاً كهذا <ArrowUpLeft size={17} />
        </a>
      </div>
    </div>
  );
}

function Approach() {
  const approach = useReveal();
  const steps = [
    ['٠١', 'نستمع جيداً', 'نفهم ما وراء الطلب. السوق، الناس، والفرصة التي لا يراها أحد بعد.'],
    ['٠٢', 'نجد الفكرة', 'نختصر التعقيد في فكرة واحدة قوية، تستطيع أن تحمل العلامة إلى مكان أبعد.'],
    ['٠٣', 'نصنع الأثر', 'نحوّل الفكرة إلى هوية وتجربة وحملة تُقاس بما تغيّره، لا بما تقوله.'],
  ];
  return (
    <section className="bg-[#101b2b] px-5 py-24 text-[#f3ecdf] md:px-10 md:py-36" id="approach">
      <div ref={approach.ref} className={`mx-auto max-w-[1380px] ${approach.className}`}>
        <SectionHeading dark eyebrow="كيف نعمل / ٠٢" title="نبدأ من المعنى، وننتهي بشيء يصعب تجاهله." />
        <div className="mt-16 grid border-t border-[#f3ecdf]/20 md:grid-cols-3">
          {steps.map(([number, title, text], index) => (
            <div key={number} className={`border-b border-[#f3ecdf]/20 py-8 md:border-b-0 md:border-l md:px-8 md:py-10 ${index === 0 ? 'md:border-l-0 md:pr-0' : ''}`}>
              <span className="mono-type text-xs text-[#d7f26b]">{number}</span>
              <h3 className="display-type mt-14 text-3xl font-black">{title}</h3>
              <p className="mt-4 max-w-xs text-sm leading-8 text-[#f3ecdf]/55">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-20 flex flex-col justify-between gap-6 border-t border-[#f3ecdf]/20 pt-6 text-sm md:flex-row">
          <span className="text-[#f3ecdf]/50">لا نؤمن بالحلول الجاهزة.</span>
          <span className="flex items-center gap-2 text-[#d7f26b]">كل مشروع يبدأ من الصفر <Asterisk size={16} /></span>
        </div>
      </div>
    </section>
  );
}

function Studio() {
  const studio = useReveal();
  return (
    <section className="relative overflow-hidden bg-[#ff785e] px-5 py-24 text-[#101b2b] md:px-10 md:py-36" id="studio">
      <div className="absolute -left-24 top-16 h-72 w-72 rounded-full border-[40px] border-[#101b2b]/10" />
      <div ref={studio.ref} className={`relative mx-auto max-w-[1380px] ${studio.className}`}>
        <div className="grid gap-14 md:grid-cols-[.9fr_1.1fr] md:items-end">
          <div>
            <span className="mono-type text-[10px]">ADS / THE STUDIO</span>
            <div className="mt-8 flex items-end gap-5">
              <span className="display-type text-[9rem] font-black leading-[.7] tracking-[-.13em] md:text-[15rem]">١٢</span>
              <span className="mb-2 max-w-[100px] text-sm font-bold leading-6 md:mb-5">شخصاً<br />يحبون التفاصيل</span>
            </div>
          </div>
          <div>
            <h2 className="display-type max-w-xl text-4xl font-black leading-[1.2] md:text-6xl">فريق صغير.<br /><span className="text-[#f3ecdf]">طموح كبير.</span></h2>
            <p className="mt-7 max-w-md text-sm leading-8 text-[#101b2b]/70">نحن كتلة من الاستراتيجيين والمصممين والمطورين والكتاب. نعمل كفريق واحد، لأن أفضل الأفكار لا تعرف حدود التخصص.</p>
            <a href="#contact" className="group mt-8 inline-flex items-center gap-3 border-b border-[#101b2b] pb-2 text-sm font-bold" data-testid="link-studio-contact">
              تعال نعمل معاً <ArrowUpLeft size={18} className="transition-transform group-hover:-translate-x-1 group-hover:-translate-y-1" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Contact() {
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [brief, setBrief] = useState('');
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
  };
  return (
    <section className="bg-[#d7f26b] px-5 py-24 text-[#101b2b] md:px-10 md:py-32" id="contact">
      <div className="mx-auto max-w-[1380px]">
        <div className="grid gap-14 md:grid-cols-[1fr_1fr] md:gap-24">
          <div>
            <div className="mb-5 flex items-center gap-2 text-xs font-bold"><span className="h-2 w-2 rounded-full bg-[#ff785e]" /> مشروع جديد؟</div>
            <h2 className="display-type max-w-xl text-5xl font-black leading-[1.08] md:text-7xl">خلّنا نضع<br /><span className="text-[#ff785e]">فكرتك</span> على الخريطة.</h2>
            <div className="mt-14 space-y-4 text-sm">
              <a href="mailto:hello@ads.studio" className="flex items-center gap-3 font-bold hover:underline" data-testid="link-email"><Mail size={17} /> hello@ads.studio</a>
              <a href="tel:+966112345678" className="flex items-center gap-3 font-bold hover:underline" data-testid="link-phone"><Phone size={17} /> +966 11 234 5678</a>
              <span className="flex items-center gap-3 text-[#101b2b]/60"><MapPin size={17} /> الرياض، المملكة العربية السعودية</span>
            </div>
          </div>
          <div>
            {submitted ? (
              <div className="flex min-h-[360px] flex-col justify-center border-t border-[#101b2b]/25 pt-8">
                <span className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#101b2b] text-[#d7f26b]"><Asterisk size={26} /></span>
                <h3 className="display-type text-3xl font-black">وصلت الرسالة.</h3>
                <p className="mt-4 max-w-sm text-sm leading-8 text-[#101b2b]/65">شكراً {name || 'لك'}. سنعود إليك خلال يومي عمل لنبدأ الحديث.</p>
                <button onClick={() => setSubmitted(false)} className="mt-7 w-fit border-b border-[#101b2b] pb-1 text-sm font-bold" data-testid="button-send-another">إرسال رسالة أخرى</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="border-t border-[#101b2b]/25" data-testid="form-contact">
                <label className="block border-b border-[#101b2b]/25 py-5">
                  <span className="mb-2 block text-xs text-[#101b2b]/50">اسمك</span>
                  <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="كيف نناديك؟" className="w-full bg-transparent text-lg outline-none placeholder:text-[#101b2b]/35" data-testid="input-name" />
                </label>
                <label className="block border-b border-[#101b2b]/25 py-5">
                  <span className="mb-2 block text-xs text-[#101b2b]/50">بريدك الإلكتروني</span>
                  <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" className="w-full bg-transparent text-lg outline-none placeholder:text-[#101b2b]/35" dir="ltr" data-testid="input-email" />
                </label>
                <label className="block border-b border-[#101b2b]/25 py-5">
                  <span className="mb-2 block text-xs text-[#101b2b]/50">عن المشروع</span>
                  <textarea required value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="احكِ لنا ما الذي يدور في بالك..." rows={3} className="w-full resize-none bg-transparent text-lg leading-8 outline-none placeholder:text-[#101b2b]/35" data-testid="textarea-brief" />
                </label>
                <button type="submit" className="mt-7 flex w-full items-center justify-between rounded-full bg-[#101b2b] px-6 py-4 text-sm font-bold text-[#d7f26b] transition-transform hover:-translate-y-1" data-testid="button-submit-contact">
                  أرسل الرسالة <ArrowUpLeft size={19} />
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#101b2b] px-5 py-7 text-[#f3ecdf] md:px-10">
      <div className="mx-auto flex max-w-[1380px] flex-col justify-between gap-6 md:flex-row md:items-center">
        <Logo light />
        <div className="flex items-center gap-5 text-[#f3ecdf]/60">
          <a href="https://instagram.com" aria-label="انستغرام" className="transition-colors hover:text-[#d7f26b]" data-testid="link-instagram"><Instagram size={18} /></a>
          <a href="https://linkedin.com" aria-label="لينكدإن" className="transition-colors hover:text-[#d7f26b]" data-testid="link-linkedin"><Linkedin size={18} /></a>
          <span className="mr-4 text-[10px]">© أدز ٢٠٢٤ — كل الحقوق محفوظة</span>
        </div>
      </div>
    </footer>
  );
}

function Home() {
  return (
    <main className="site-shell noise" dir="rtl">
      <Header />
      <Hero />
      <Marquee />
      <Work />
      <Approach />
      <Studio />
      <Contact />
      <Footer />
    </main>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;