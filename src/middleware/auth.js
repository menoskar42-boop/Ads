function requireLogin(req, res, next) {
  if (req.session && req.session.companyId) return next();
  res.redirect('/company/login');
}

module.exports = requireLogin;
