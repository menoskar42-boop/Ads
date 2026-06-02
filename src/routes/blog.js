const express = require('express');
const router = express.Router();
const { ARTICLES, BY_SLUG } = require('./blog_articles');

router.get('/blog', (req, res) => {
  res.render('blog/index', { articles: ARTICLES });
});

router.get('/blog/:slug', (req, res, next) => {
  const article = BY_SLUG[req.params.slug];
  if (!article) return next();
  res.render('blog/article', {
    article,
    bodyView: 'articles/' + article.slug,
    articles: ARTICLES,
  });
});

module.exports = router;
