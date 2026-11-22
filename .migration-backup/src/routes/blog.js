const express = require('express');
const router = express.Router();
const { ARTICLES, BY_SLUG } = require('./blog_articles');

// Blog pages are real content — allow AdSense.
router.use((req, res, next) => { res.locals.showAds = true; next(); });

// Newest first.
const SORTED = ARTICLES.slice().sort((a, b) => b.date.localeCompare(a.date));

router.get('/blog', (req, res) => {
  res.render('blog/index', { articles: SORTED });
});

router.get('/blog/:slug', (req, res, next) => {
  const article = BY_SLUG[req.params.slug];
  if (!article) return next();
  res.render('blog/article', {
    article,
    bodyView: 'articles/' + article.slug,
    articles: SORTED,
  });
});

module.exports = router;
