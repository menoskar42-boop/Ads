require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const tenantMiddleware = require('./src/middleware/tenant');
const indexRouter = require('./src/routes/index');
const tenantRouter = require('./src/routes/tenant');
const companyRouter = require('./src/routes/company');

const app = express();
const PORT = process.env.PORT || 5000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'oscardevs-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

// Tenant detection: runs on every request
app.use(tenantMiddleware);

// If req.tenant is set, render the tenant page
app.use((req, res, next) => {
  if (req.tenant) {
    return tenantRouter(req, res, next);
  }
  next();
});

// Company dashboard (no tenant middleware — uses session auth)
app.use('/company', companyRouter);

// Main platform homepage
app.use('/', indexRouter);

// 404 fallback
app.use((req, res) => {
  res.status(404).render('404', { subdomain: null });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Oscardevs Ads running on http://0.0.0.0:${PORT}`);
});
