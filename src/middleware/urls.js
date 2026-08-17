const { canonicalCompanyUrl, companyPageUrl, isProductionHost } = require('../lib/urls');

module.exports = (req, res, next) => {
  res.locals.canonicalCompanyUrl = (slug) => canonicalCompanyUrl(slug, req);
  // For anything UNDER a company's site. Templates used to concatenate onto the
  // canonical, which has no trailing slash — producing `…oscardevs.comdoctor/x`
  // as the canonical of every doctor page. Joining is done here, once.
  res.locals.companyPageUrl = (slug, sub) => companyPageUrl(slug, req, sub);
  res.locals.isProductionHost = isProductionHost(req);
  next();
};
