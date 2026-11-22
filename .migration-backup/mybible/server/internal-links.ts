/**
 * Internal Links Automation — Phase 3
 * Generates contextual internal links for a given query/page.
 * Used in both bot snapshots and the SeoSmartBlock component.
 */

import { detectIntent } from './seo-intent';

export interface InternalLink {
  href: string;
  label: string;
  anchor: string;
}

const SITE = 'https://mybible.oscardevs.com';

const TOPIC_LINK_MAP: Record<string, InternalLink[]> = {
  سلام: [
    { href: '/search?q=السلام', label: 'آيات السلام', anchor: 'آيات الكتاب المقدس عن السلام' },
    { href: '/search?q=الطمأنينة', label: 'آيات الطمأنينة', anchor: 'آيات الكتاب المقدس عن الطمأنينة' },
    { href: '/emotions', label: 'التغذية الروحية', anchor: 'التغذية الروحية' },
  ],
  خوف: [
    { href: '/search?q=الخوف', label: 'آيات الخوف', anchor: 'آيات الكتاب المقدس عن الخوف' },
    { href: '/search?q=القلق', label: 'آيات القلق', anchor: 'آيات الكتاب المقدس عن القلق' },
    { href: '/emotions', label: 'التغذية الروحية', anchor: 'آيات للتغلب على الخوف' },
  ],
  حزن: [
    { href: '/search?q=الحزن', label: 'آيات الحزن', anchor: 'آيات الكتاب المقدس عن الحزن' },
    { href: '/search?q=التعزية', label: 'آيات التعزية', anchor: 'آيات التعزية' },
    { href: '/emotions', label: 'الدعم الروحي', anchor: 'الدعم الروحي' },
  ],
  فرح: [
    { href: '/search?q=الفرح', label: 'آيات الفرح', anchor: 'آيات الكتاب المقدس عن الفرح' },
    { href: '/search?q=الابتهاج', label: 'آيات الابتهاج', anchor: 'آيات الكتاب المقدس عن الابتهاج' },
    { href: '/plans', label: 'خطط القراءة', anchor: 'خطط قراءة يومية' },
  ],
  امل: [
    { href: '/search?q=الأمل', label: 'آيات الأمل', anchor: 'آيات الكتاب المقدس عن الأمل' },
    { href: '/search?q=الرجاء', label: 'آيات الرجاء', anchor: 'آيات الكتاب المقدس عن الرجاء' },
    { href: '/emotions', label: 'التغذية الروحية', anchor: 'آيات للأمل' },
  ],
  وحده: [
    { href: '/search?q=الوحدة', label: 'آيات الوحدة', anchor: 'آيات الكتاب المقدس عن الوحدة' },
    { href: '/emotions', label: 'التغذية الروحية', anchor: 'مساعدة روحية' },
    { href: '/plans', label: 'خطط القراءة', anchor: 'خطط يومية' },
  ],
  حب: [
    { href: '/search?q=المحبة', label: 'آيات المحبة', anchor: 'آيات الكتاب المقدس عن المحبة' },
    { href: '/search?q=الحب', label: 'آيات الحب', anchor: 'آيات الكتاب المقدس عن الحب' },
    { href: '/plans', label: 'خطط القراءة', anchor: 'خطط روحية' },
  ],
  شفاء: [
    { href: '/search?q=الشفاء', label: 'آيات الشفاء', anchor: 'آيات الكتاب المقدس عن الشفاء' },
    { href: '/emotions', label: 'التغذية الروحية', anchor: 'التعزية الروحية' },
  ],
  صلاه: [
    { href: '/search?q=الصلاة', label: 'آيات الصلاة', anchor: 'آيات الكتاب المقدس عن الصلاة' },
    { href: '/plans', label: 'خطط القراءة', anchor: 'خطط قراءة منظمة' },
  ],
  ايمان: [
    { href: '/search?q=الإيمان', label: 'آيات الإيمان', anchor: 'آيات الكتاب المقدس عن الإيمان' },
    { href: '/plans', label: 'خطط القراءة', anchor: 'خطط روحية' },
    { href: '/emotions', label: 'التغذية الروحية', anchor: 'تعزية روحية' },
  ],
  صبر: [
    { href: '/search?q=الصبر', label: 'آيات الصبر', anchor: 'آيات الكتاب المقدس عن الصبر' },
    { href: '/emotions', label: 'التغذية الروحية', anchor: 'تعزية روحية' },
  ],
  حكمه: [
    { href: '/search?q=الحكمة', label: 'آيات الحكمة', anchor: 'آيات الكتاب المقدس عن الحكمة' },
    { href: '/plans', label: 'خطط القراءة', anchor: 'خطط دراسية' },
  ],
};

const DEFAULT_LINKS: InternalLink[] = [
  { href: '/bible', label: 'الكتاب المقدس', anchor: 'اقرأ الكتاب المقدس كاملاً' },
  { href: '/plans', label: 'خطط القراءة', anchor: 'خطط قراءة الكتاب المقدس' },
  { href: '/emotions', label: 'التغذية الروحية', anchor: 'آيات حسب مشاعرك' },
  { href: '/search', label: 'البحث', anchor: 'ابحث في الكتاب المقدس' },
  { href: '/kids', label: 'قصص الأطفال', anchor: 'قصص الكتاب المقدس للأطفال' },
];

export function getInternalLinks(query: string, limit = 5): InternalLink[] {
  if (!query || !query.trim()) return DEFAULT_LINKS.slice(0, limit);

  const { topics } = detectIntent(query);
  const links = new Map<string, InternalLink>();

  for (const topic of topics) {
    const topicLinks = TOPIC_LINK_MAP[topic] || [];
    for (const link of topicLinks) {
      if (!links.has(link.href)) links.set(link.href, link);
    }
  }

  // Fill remaining slots with defaults
  for (const def of DEFAULT_LINKS) {
    if (links.size >= limit) break;
    if (!links.has(def.href)) links.set(def.href, def);
  }

  return Array.from(links.values()).slice(0, limit);
}

export function buildInternalLinksHtml(links: InternalLink[]): string {
  return links
    .map(l => `<a href="${SITE}${l.href}">${l.anchor}</a>`)
    .join(' | ');
}
