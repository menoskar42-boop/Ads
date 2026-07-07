// Central AdSense configuration. ALL ads across the platform — main site,
// every tenant shop and every tenant portfolio — are served from
// OscarDevs' publisher account. Slot IDs are read from env so they can
// be filled in after the AdSense review without touching code.
//
// Usage in views: <%- include('partials/ad_unit', { slot: ads.slots.homeTop }) %>
// (skips rendering when slot is empty, so pages stay clean until each
// ad unit is actually created in the AdSense dashboard).

module.exports = {
  publisherId: process.env.ADSENSE_PUBLISHER_ID || 'ca-pub-3132188303904900',
  enabled: process.env.ADS_ENABLED !== 'false',
  slots: {
    // Main OscarDevs marketing pages
    homeTop:     process.env.ADS_HOME_TOP     || '',
    homeMid:     process.env.ADS_HOME_MID     || '',
    homeBottom:  process.env.ADS_HOME_BOTTOM  || '',

    // Blog pages
    blogTop:        process.env.ADS_BLOG_TOP        || '',
    blogInArticle:  process.env.ADS_BLOG_INARTICLE  || '',
    blogBottom:     process.env.ADS_BLOG_BOTTOM     || '',

    // Legal / apply / contact / faq / about
    pageTop:     process.env.ADS_PAGE_TOP     || '',
    pageBottom:  process.env.ADS_PAGE_BOTTOM  || '',

    // Tenant shops (/view/:slug for shops)
    shopTop:     process.env.ADS_SHOP_TOP     || '',
    shopInGrid:  process.env.ADS_SHOP_INGRID  || '',
    shopBottom:  process.env.ADS_SHOP_BOTTOM  || '',

    // Tenant product detail pages
    productTop:     process.env.ADS_PRODUCT_TOP     || '',
    productMid:     process.env.ADS_PRODUCT_MID     || '',
    productBottom:  process.env.ADS_PRODUCT_BOTTOM  || '',

    // Tenant portfolios (/view/:slug for portfolio)
    portfolioTop:     process.env.ADS_PORTFOLIO_TOP     || '',
    portfolioSidebar: process.env.ADS_PORTFOLIO_SIDEBAR || '',
    portfolioBottom:  process.env.ADS_PORTFOLIO_BOTTOM  || '',

    // Orders platform — ONLY on the menu / browse content surface.
    // NEVER on cart / checkout / order confirm-track / customer pages (AdSense policy).
    ordersMenu:  process.env.ADS_ORDERS_MENU  || '',
  },
};
