const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const company = req.tenant;
  const ads = req.tenantAds || [];

  const topAd = ads.find(a => a.position === 'top') || null;
  const sidebarAd = ads.find(a => a.position === 'sidebar') || null;
  const footerAd = ads.find(a => a.position === 'footer') || null;

  res.render('tenant', { company, topAd, sidebarAd, footerAd });
});

module.exports = router;
