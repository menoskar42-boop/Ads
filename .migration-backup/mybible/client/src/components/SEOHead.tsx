import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { pageSEOConfig, type PageSEO } from '@/lib/seo-config';

const SITE_URL = 'https://mybible.oscardevs.com';

const breadcrumbMap: Record<string, { name: string; path: string }[]> = {
  '/bible': [{ name: 'الرئيسية', path: '/' }, { name: 'الكتاب المقدس', path: '/bible' }],
  '/plans': [{ name: 'الرئيسية', path: '/' }, { name: 'خطط القراءة', path: '/plans' }],
  '/emotions': [{ name: 'الرئيسية', path: '/' }, { name: 'التغذية الروحية', path: '/emotions' }],
  '/kids': [{ name: 'الرئيسية', path: '/' }, { name: 'الأطفال', path: '/kids' }],
  '/search': [{ name: 'الرئيسية', path: '/' }, { name: 'البحث', path: '/search' }],
  '/highlights': [{ name: 'الرئيسية', path: '/' }, { name: 'آياتي المظللة', path: '/highlights' }],
  '/about': [{ name: 'الرئيسية', path: '/' }, { name: 'من نحن', path: '/about' }],
  '/privacy': [{ name: 'الرئيسية', path: '/' }, { name: 'سياسة الخصوصية', path: '/privacy' }],
  '/contact': [{ name: 'الرئيسية', path: '/' }, { name: 'تواصل معنا', path: '/contact' }],
};

function getBreadcrumbSchema(location: string) {
  const items = breadcrumbMap[location];
  if (!items) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path === '/' ? '' : item.path}`,
    })),
  };
}

interface SEOHeadProps {
  customSchema?: object;
  dynamicSEO?: PageSEO | null;
}

export function SEOHead({ customSchema, dynamicSEO }: SEOHeadProps) {
  const [location] = useLocation();
  
  useEffect(() => {
    const seoData = dynamicSEO || pageSEOConfig[location] || pageSEOConfig['/'];
    
    document.title = seoData.title;
    
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute('content', seoData.description);
    
    let metaKeywords = document.querySelector('meta[name="keywords"]');
    if (!metaKeywords) {
      metaKeywords = document.createElement('meta');
      metaKeywords.setAttribute('name', 'keywords');
      document.head.appendChild(metaKeywords);
    }
    metaKeywords.setAttribute('content', seoData.keywords.join(', '));
    
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', seoData.title);
    
    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) ogDescription.setAttribute('content', seoData.description);

    let ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute('content', `${SITE_URL}${location === '/' ? '' : location}`);
    
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle) twitterTitle.setAttribute('content', seoData.title);
    
    const twitterDescription = document.querySelector('meta[name="twitter:description"]');
    if (twitterDescription) twitterDescription.setAttribute('content', seoData.description);

    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) ogImage.setAttribute('content', 'https://mybible.oscardevs.com/opengraph.jpg');

    const twitterImage = document.querySelector('meta[name="twitter:image"]');
    if (twitterImage) twitterImage.setAttribute('content', 'https://mybible.oscardevs.com/opengraph.jpg');

    const search = typeof window !== 'undefined' ? window.location.search : '';
    const shouldNoIndex = location === '/search' && /[?&]q=[^&]+/.test(search);
    let robotsMeta = document.querySelector('meta[name="robots"]');
    if (!robotsMeta) {
      robotsMeta = document.createElement('meta');
      robotsMeta.setAttribute('name', 'robots');
      document.head.appendChild(robotsMeta);
    }
    robotsMeta.setAttribute(
      'content',
      shouldNoIndex
        ? 'noindex, follow'
        : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1'
    );

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', `${SITE_URL}${location === '/' ? '/' : location}`);

    let hreflangAr = document.querySelector('link[hreflang="ar"]');
    if (hreflangAr) hreflangAr.setAttribute('href', `${SITE_URL}${location === '/' ? '/' : location}`);
    let hreflangDefault = document.querySelector('link[hreflang="x-default"]');
    if (hreflangDefault) hreflangDefault.setAttribute('href', `${SITE_URL}${location === '/' ? '/' : location}`);
    
    let existingSchema = document.querySelector('script[data-seo-schema]');
    if (existingSchema) existingSchema.remove();
    let existingBreadcrumb = document.querySelector('script[data-seo-breadcrumb]');
    if (existingBreadcrumb) existingBreadcrumb.remove();
    
    const schemaToUse = customSchema || seoData.schema;
    if (schemaToUse) {
      const schemaScript = document.createElement('script');
      schemaScript.type = 'application/ld+json';
      schemaScript.setAttribute('data-seo-schema', 'true');
      schemaScript.textContent = JSON.stringify(schemaToUse);
      document.head.appendChild(schemaScript);
    }

    const breadcrumb = getBreadcrumbSchema(location);
    if (breadcrumb) {
      const breadcrumbScript = document.createElement('script');
      breadcrumbScript.type = 'application/ld+json';
      breadcrumbScript.setAttribute('data-seo-breadcrumb', 'true');
      breadcrumbScript.textContent = JSON.stringify(breadcrumb);
      document.head.appendChild(breadcrumbScript);
    }
    
    return () => {
      const schema = document.querySelector('script[data-seo-schema]');
      if (schema) schema.remove();
      const bc = document.querySelector('script[data-seo-breadcrumb]');
      if (bc) bc.remove();
    };
  }, [location, customSchema, dynamicSEO]);
  
  return null;
}
