const { canonicalCompanyUrl, isProductionHost } = require('../lib/urls');

module.exports = (req, res, next) => {
  res.locals.canonicalCompanyUrl = (slug) => canonicalCompanyUrl(slug, req);
  res.locals.isProductionHost = isProductionHost(req);
  next();
};
