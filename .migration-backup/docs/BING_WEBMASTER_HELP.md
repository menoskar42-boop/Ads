تمام ✅ خلّصت فتح **كل صفحات الـ Help Center** في كل الأقسام (39 صفحة) وجمعت النص كامل نسخ-لصق. ده كل المحتوى منظّم حسب الأقسام:

> ملاحظة: صفحتي **Webmaster Guidelines** و **Help Center (الرئيسية)** بعتهملك بالكامل في الرسالة السابقة، فمش هكررهم هنا.

---

# 📁 قسم 1: GETTING STARTED

## Getting Started Checklist
`/webmasters/help/getting-started-checklist-66a806de`

**Getting started checklist**

New to Bing Webmaster Tools? This checklist can help you get started. Steps 1 and 2 will get you up and running, while steps 3 and 4 are optional, but highly recommended.

**Step 1: Open a Bing Webmaster Tools account** — Go to the Bing Webmaster Tools sign-in or sign-up and open a free account. You can sign up using an existing Microsoft, Google or Facebook account, or create a new Microsoft account (select Microsoft then click Create one).

**Step 2: Add & verify your website** — Once you have an account, you can Add Sites. Then verify ownership via the Add and Verify Site section. There are multiple Ownership Verification methods. A green checkmark means success; a red cross means an error to resolve. You can manage permissions through User Management, and delete an added site (you'll have to re-verify to add again).

**Step 3: Create and upload your sitemaps** — Bing supports: XML Sitemaps and XML Sitemap index files (sitemaps.org); Atom 0.3 and 1.0; RSS 2.0; and Text files (one URL per line). The sitemap usually lives at the root of your domain (e.g. http://www.contoso.com/sitemap.xml). After uploading, tell Bing about it via the Sitemaps section.

**Step 4: Create a search optimization plan** — Under SEO in the left navigation you'll find tools for backlinks, keyword research, and SEO error analysis. SEO Reports run automatically every alternate week (twice a month on average) on any verified domain. Recently verified domains may need a few days.

---

# 📁 قسم 2: WEBMASTER TOOLS & FEATURE (21 صفحة)

## Home
`/webmasters/help/home-05a5a164`

The Home page is the dashboard with overview of reports, notifications, new feature announcements and marketing info. Three sections: **Recommended for you** (new tools/features/blogs/announcements, click Get Started or Learn more); **What's new** (unread messages and notifications); **Reports** (core web vitals like Search Performance — Impressions, Clicks, Crawl Errors, Indexed pages, Avg. CTR — SEO reports, or URL submission quota left; click View complete report for details). Note: after verifying your site it takes a couple of days to collate data.

## Add and Verify site
`/webmasters/help/add-and-verify-site-12184f8b`

**Adding a site** — Create an account, then prove you own the site (or section). You can create a property for an entire domain (example.com) or a single branch (example.com/clothing/). Two ways to add:
- **Import sites from Google Search Console**: if you have a verified GSC account, import settings + property directly into Bing (needs permission to access your Search Console). Selected sites get added and auto-verified.
- **Add your site manually**: enter the URL and click add.

Once added it usually takes 48 hours to generate analytics. **Managing Search Console access**: Bing periodically validates ownership via your Search Console; new sitemaps are imported automatically. See linked accounts under Profile; use Disconnect to stop access. Notes: number of importable sites may differ from GSC; URLs may be normalized/grouped; max 100 websites per import, limit 1000 sites per account.

**Verify ownership** — four methods:
- **DNS auto verification**: uses Domain Connect to auto-insert CNAME (only for partnered DNS providers).
- **XML File authentication**: save BingSiteAuth.xml and upload to your root directory.
- **Meta tag authentication**: paste the `<meta />` tag at the end of the `<head>` section.
- **Add CNAME record to DNS**: edit CNAME record with the provided verification code.

## Search Performance
`/webmasters/help/search-performance-c680da36`

Shows how your site performs on Bing search — which pages get clicked, which keyword phrases your pages appear for, and traffic sources. Analyze up to the past 6 months.

**Key Terms**: Impressions (times your link showed up across Web search, Chat, News, Image, Knowledge Panel); Clicks; Average CTR; Average Position (Web traffic only); Crawl Requests; Crawl Errors; Indexed Pages.

The overview chart tracks Clicks, Impressions, Avg. CTR, Avg. position, Crawl requests, Crawl errors and Indexed pages over up to 6 months. Export to CSV with the Download button. Since Mar 24, 2023, more sources (Chat, News, Images, Videos, Knowledge Panel) were added beyond Web. Recently added websites may take a few days; no backdated data. Metrics by source: All (Clicks, Impressions, Avg. CTR); Web and Chat (+ Avg. position); News/Images/Videos/Knowledge Panel (Clicks, Impressions, Avg. CTR); Crawl and Indexing (Crawl requests, errors, indexed pages).

**Keywords / Pages** drill-downs let you see metrics per keyword and per page, including position-level performance. Keywords and Pages data is Web traffic only. Video clicks are attributed only if the click results in redirect to the site.

## AI Performance
`/webmasters/help/ai-performance-9f8e7d6c`

The AI Performance Report shows how your content is used in AI-generated answers across Microsoft Copilot and partner experiences — which pages are cited, visibility trends over time, and grounding queries.

**AI surfaces included**: Microsoft Copilot, AI-generated summaries in Bing, select partner AI integrations.

**Measures**: Pages Cited in AI Answers; Average Cited Pages (avg unique pages cited per day); Grounding Queries Your Content Appears In; Page-Level Citation Activity (citation counts by URL — reflects how often, not importance/ranking).

**Timeline view** shows citation volume over time (7 days, 30 days, 3 months, custom). Changes may reflect shifts in user questions, content updates, or model updates — observational only.

**Metrics**: Total Citations; Cited pages; Average cited pages. AI Performance does not measure rankings, authority, or importance — just what was cited.

**Grounding Queries tab** shows grouped phrases (not full user questions) the AI used when retrieving cited content. A query can map to multiple pages and vice versa. Use it to understand which phrases drive citations and find strong/weak visibility areas.

**Page-Level Citation Activity** (Pages view) shows most-cited pages; Grounding Query–Page Mapping connects queries↔pages (filter by one at a time).

**Data**: refreshed daily with short delay; aggregated/sampled (not a complete log); totals may differ across views; historical data limited to ranges shown. Reflects only content eligible for indexing; respects robots.txt. **Export** in CSV and Excel.

**Improving visibility**: align content with user intent; strengthen depth/expertise; improve clarity/structure (headings, sections, tables, FAQ); support claims with evidence; keep content fresh; maintain consistency across formats.

**FAQs** cover: why citation counts change; citations ≠ clicks/traffic; why some pages aren't cited; why grounding queries look short; AI metrics differ from search metrics; why no grounding queries appear; filtering limits in Grounding Query–Pages Mapping; and why counts may differ by filter direction (sampling over different time windows). Exports reflect the applied filter.

## URL Inspection
`/webmasters/help/url-inspection-55a30305`

Check and act on URLs for crawling, indexing, SEO, and markup details/errors. Enter a URL from your added domain or pick from the last 10 inspected. Provides three cards:
- **Index card**: index status and details (when/where discovered, crawled, indexed), with HTML and HTTP response details. HTTP status classes: 1xx informational, 2xx successful, 3xx redirection, 4xx client error, 5xx server error. You can request indexing (subject to quota).
- **SEO card**: SEO errors/warnings/notices. Error count shown; red = high, yellow = medium, blue = low priority. Hover for "How to fix"; click for detailed analysis and HTML highlighting.
- **Markup card**: shows whether structured markup is readable by Bing. Recognizes HTML Microdata, Microformats, Open Graph, JSON-LD. Doesn't validate regular HTML.

**Live URL**: see exactly what Bingbot sees; helps detect if your site sends different HTML to Bingbot vs users. Sends requests to Bingbot (slight delay). Does not follow redirects — shows destination and you must use "Inspect redirect destination."

## Site Explorer
`/webmasters/help/site-explorer-c680da37`

A unique view to navigate your site and find insights/issues (redirects, crawl issues, robots.txt disallowed, etc.). A "folder" is a container (subdomain or URL path part).

**Folder info**: number of URLs, cumulative Clicks, Impressions, Backlinks. **Crawl info**: Indexed, Error, Warning, Excluded. **URL info/actions**: Impressions, Clicks, Last crawled date, Discovered date, HTTP code, Backlinks, HTTPS check, robots.txt test. You can inspect URLs, request indexing, and test in robots.txt tester. Sort folders/URLs alphabetically or by clicks/impressions.

**Filters**: Indexed URLs; crawling issues (deadlinks 404-410); crawling issues (server errors 403, 5xx); robots.txt disallowed; NOINDEX tag; redirecting; canonical source; guideline issues; selected but not yet crawled; malware; other issues.

## Sitemaps
`/webmasters/help/sitemaps-3b5cf6ed`

Sitemaps tell Bing about URLs hard to discover. Accepted formats: XML Sitemap, RSS 2.0, Atom 0.3 and 1.0, Text (one URL per line). The page lists all sitemaps/indexes/feeds (submitted, imported from GSC, or discovered). Click "Submit sitemaps" (only accepted formats, only for the selected site). Table shows submitted/discovered/imported dates, last processing date, status, URLs discovered; filter by type and status. Resubmit is one-click (individual only — no multiple). Click an entry for details/errors. Download the full list or individual sitemaps. You can also reference your sitemap in robots.txt: `Sitemap: http://www.example.com/sitemap.xml`

## IndexNow
`/webmasters/help/indexnow-0z209wby`

IndexNow is a protocol to instantly notify search engines (Bing, Seznam.cz, Naver) about new/updated/deleted content — leading to faster crawling/indexing. Advantages: increased visibility and more traffic.

**Dashboard**: URLs Submitted; Sources (self-submission or via WordPress plugin, Cloudflare, Shopify, Joomla, BitRix24, Drupal, PrestaShop, MODX, Shopware, Opencart, Typo3). **IndexNow Insights**: tooltip annotation, submission overview graph, "View complete report." **Submitted URLs List**: sample URL list, submission time (UTC default), submission source, details (crawl status, index status, first indexed time, late submission). Hover for "Inspect URL"; sort by date; export CSV.

**Important URLs Missed**: significant URLs indexed in last 7 days but NOT through IndexNow — a call to action. **Submitted URLs Overview** (View Complete Report): date-wise URLs submitted, crawled, indexed, with graphical comparison; export CSV/Excel.

**Categorized webpages**: Indexed; Need Attention; Informational. Issue types with solutions: Content Quality, Canonical URL Exists, Redirect URLs, No-Index Tag, Robots Disallowed, Not Crawled, Deadlink. Click an issue for sampled URLs and fixes.

## URL Submission
`/webmasters/help/url-submission-62f2860b`

Bing recommends **IndexNow** for faster automated submission. URL/Content Submission remain supported but may be deprecated.

**Options**: 
- **IndexNow (Strongly Recommended)** — notifies Bing + participating engines when URLs change; integrated into many CMS/CDN/tools.
- **Manual URL Submission** — submit individual URLs; up to 10,000 URLs/domain/day; quota resets daily at midnight UTC, applies at domain level; recent 1,000 viewable in history; no bulk/automation.
- **URL Submission API** — for advanced/custom implementations; up to 10,000 URLs/domain/day; OAuth 2.0 required; batch up to 500 URLs/request. Only submits to Bing.
- **Content Submission API** — submits both URLs and full page content; best for real-time pipelines; OAuth 2.0; up to 10MB payload (uncompressed) per submission; supports Gzip. Honors NOINDEX (but can index robots.txt-disallowed content). Can submit images (base64 the httpMessage stream). Includes JSON/XML request-response examples and FAQs (API key generation, 99.9% SLA, quota increases via support, submitting 404s, etc.).

## Backlinks
`/webmasters/help/backlinks-c3a334e8`

Shows your backlink profile: aggregated referring pages, referring domains, anchor texts (a representative set, not complete).

**Backlinks for your site**: Domains (unique linking domains + backlink counts; up to 1500 domains, 10,000 backlinks each; export CSV); Anchor texts (which anchors link to you; up to 1500, click for referring pages up to 10,000); Pages (linking pages on the web; up to 100,000 URLs; export).

**Backlinks to any site**: compare your profile with up to 2 other sites (saved across sessions). Overview shows total referring domains/anchor texts. Top 10 referring domains + top 10 anchor texts (considers top 500 by count). Filters: Show all data; Show only common domains; Show domains not linking to my site (same for Anchor Texts). Click any to see up to 100 referring pages; export 100 rows.

## Keyword Research
`/webmasters/help/keyword-research-628070b6`

Find phrases/keywords searchers look for and their search volumes. Higher volume = more interest. Gives keyword ideas, search frequency, and trends over time. Focus on your area of expertise rather than just trending topics.

**Using it**: enter a root keyword in the search box; by default lists keywords bringing traffic + volume trend. Apply filters by country, language, devices; any timeframe in last 6 months (defaults: all countries/languages/devices, previous 3 months).

**Results**: search volume and trends + Global breakdown by country (country filter doesn't apply to Global breakdown). Three lists: **Related keywords** (sorted by relevance); **Question keywords** (specific user questions); **Newly discovered** (related keywords qualified only in last 30 days). Also lists top 10 URLs in search results for the root keyword + associated topics (which can serve as new root keywords).

## Recommendations
`/webmasters/help/recommendations-55a30304`

Personalized, prioritized guidance for the most impactful tasks to improve visibility/discoverability across Microsoft search and AI experiences. Generated automatically and refreshed at intervals, only for verified sites using pages Bing has indexed.

**How it works**: Bing scans indexed pages against best practices, identifies issues, groups by type, gives actionable guidance. Main page shows: list of issues, short descriptions, severity (High/Moderate/Low), page counts, links to Recommended Action pages.

**Recommended Action pages**: Severity, Pages with Error, Total Errors, Recommended Actions, List of URLs with the Issue (up to 50; Download all for full CSV). Refresh automatically as Bing recrawls. **Related Links**: Inspect a URL, Search Performance, Site Explorer.

## Site Scan
`/webmasters/help/site-scan-623520c9`

On-demand site audit tool that crawls your site and checks common technical SEO issues.

**Configuring a scan**: click "Start new scan," enter Scan Name and Scope:
- **Website**: crawls like Bingbot from a start URL, follows outlinks in scope (use "Crawl all subdomains" for whole site — mind your quota).
- **Sitemap**: crawls URLs in a specific sitemap (no outlinks).
- **URL List**: crawls a specific list.

**Limit scan to**: max pages. Quota is auto-calculated; no increase requests supported. **Communication**: email updates. **Advanced Settings**: Max Scan Depth; Crawling speed (URLs/sec); URL parameters to be ignored; Ignore Robots.txt. Only Administrator and Read-Modify users can start/stop/delete. User Agent: `Bingbot - (Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm))`.

**Scan report**: Scan Status, pages scanned, errors, warnings, list of issues with severity. Categories: **Errors** (most critical, impact indexability), **Warnings** (medium, SEO health), **Notices** (lowest). Click an issue for affected pages (sorted by depth); download CSV. Store up to 5 scans (delete one to start new). Menu options: Delete scan, view settings, stop ongoing scan.

## Crawl Control
`/webmasters/help/crawl-control-55a30303`

Control the speed at which Bingbot requests pages/resources, per hour, for all 24 hours. Limit activity during busy hours and allow more during quiet hours. Note: a crawl-delay directive in robots.txt always takes precedence.

**Preset crawl pattern**: pick the busiest time-of-day preset (based on local time) to auto-optimize (slower during busy hours, faster otherwise). Choose a time zone from the dropdown if needed. **Custom crawl pattern**: drag over the cubes/quadrants — more blue = faster crawl, fewer = slower. Default is 5 quadrants per time slice (algorithmic baseline). Click Save changes.

## Block URLs
`/webmasters/help/block-urls-264e560b`

Temporarily prevent URLs from appearing in Bing/Copilot search results while you make permanent changes. Only site owners/webmasters can block; others must contact the owner or use the Content Removal Tool. **Block expires after 90 days** (extendable). Doesn't remove from index permanently.

**When to use**: page appeared before ready; sensitive content needs hiding; NOINDEX not yet applied; page being removed but not yet recrawled. **What happens**: URL hidden 90 days; content not deleted; may still exist in index; doesn't prevent crawling unless separately blocked.

**How to block**: Sign in → Configuration → Block URLs → enter URL → single page or directory → block URL+cached or cached only → Submit. **Expiry**: after 90 days apply permanent removal or Extend. **Permanent**: delete page (404/410), add NOINDEX, or redirect; Bingbot must crawl to detect. Notify via IndexNow or sitemap for faster detection.

## robots.txt tester
`/webmasters/help/robotstxt-tester-623520ca`

The Robots Exclusion Protocol (robots.txt) lets owners regulate how bots crawl. The tester analyzes your robots.txt and highlights issues hurting crawling. If a search result says Bing can't show a description, it's because the page is disallowed in robots.txt.

**To test**: enter the URL in Test URL and select Test; toggle between Bingbot and AdIdxbot. It checks the URL against the editor content (re-test after edits). Shows allow/disallow per user agent, with https:// and http:// variants. Edit/download to update offline; use Fetch latest to get the live file. Download provides a step-by-step update process. Note: robots.txt must be in the root directory (https://www.example.com/robots.txt).

## Verify Bingbot
`/webmasters/help/verify-bingbot-2195837f`

Checks if an IP address belongs to Bingbot — useful to confirm "Bingbot"/"MSNBOT" user-agent traffic in server logs is genuine. Available inside Webmaster Tools (Tools & Enhancements) and publicly at http://www.bing.com/toolbox/verify-bingbot. Enter the IP (plus captcha if not signed in) and click Submit/Verify. Also see "Verifying Bingbot" for alternative methods, or match against the Bingbot IP list.

## User management
`/webmasters/help/how-to-add-users-to-your-site-account-d5d00364`

Add users with permission levels: **Read only** (see features/reports, can't change settings or add users); **Read/Write** (access/control almost all features, can't add users); **Administrator** (control all features incl. adding/delegating users). Find User management in the left nav. New users sign up via Microsoft, Facebook or Gmail first; then the admin enters their email, selects a role, sets Access scope (URL-path), and clicks Add. Have multiple admins for corporate accounts. Note: Administrator and Read/Write users can block crawling/indexation.

## Microsoft Clarity
`/webmasters/help/microsoft-clarity-55a30306`

Microsoft Clarity is a free analytics product to understand visitor behavior. Verified Bing Webmaster users get exclusive integrated access. Shows which parts of your site get most/least engagement; useful for debugging.

**Steps**: 1) Verify your website in Bing Webmaster Tools. 2) Add your website as a project in Clarity (accept Terms of use). 3) Add the Clarity script tag into the `<head>` of the page/webapp. 4) Browse analysis in Clarity (Heatmaps, Session playbacks). Multiple users can access the same project (each must add Clarity and accept Terms). Deleting a project removes it from both Clarity and the Webmaster portal.

## Bing News PubHub Support
`/webmasters/help/bing-news-pubhub-support-e85a0280`

**Notice: Bing PubHub is being retired.** Refer to Technical Help Guidelines for submission issues. Q&A covers: approved but status "pending" (lag time — wait a few days); no reply after submitting (review takes time; check "My Sites"); rejected (can't reply to individual selections — review Publisher Guidelines); some URL versions not included (http:// vs https:// and .com vs .com.uk treated as different sites — create separate submissions); news + non-news content (create separate submissions). Raise support request for assistance.

## Content Removal
`/webmasters/help/content-removal-cb6c294d`

How to remove content from Bing/Copilot. Bing can't remove content from the internet itself, but can update results once changes are made at the source.

**If you're the site owner** — three action types:
1. **Fastest (Temporary): Block URLs/Directories** — hide a page/directory up to 90 days (most blocks processed in <12 hours).
2. **Permanent Removal** — delete page (404/410) or add NOINDEX; takes effect after re-crawl (several days).
3. **Redirecting Pages** — guide users/engines to updated content.
4. **Speed up detection** with IndexNow or updated XML Sitemaps.

**If you're not the owner**: still accessible → contact site owner; no longer accessible (dead link) → use Content Removal Tool; updated but old version shows → Content Removal Tool to request refresh.

**Broken link removal**: confirm 404/410 → submit via Content Removal Tool. **Report harmful/illegal/sensitive content**: https://www.microsoft.com/en-us/concern/CSAM

---

# 📁 قسم 3: MESSAGES & ALERTS (3 صفحات)

## Using the Notifications Center
`/webmasters/help/using-the-notifications-center-2d8ad7ca`

Contains all alerts/messages from Bing. Access via the bell icon (top right). Tip: set email preferences for daily digests. Filter messages by site or issue type using the dropdown; toggle "Unread" only. **Issue types**: Administrator (service changes); Crawl errors; Index issues; Malware; Bing Ads. High-priority alerts also appear on your dashboard. Delete a notification by hovering and clicking the Delete icon.

## Set Email Alert Preferences
`/webmasters/help/how-to-set-email-alert-preferences-c73a478c`

Lets you permit email alerts about new/unread messages and set frequency. Click the Settings (gear) icon beside the notification icon. Under Communication preference, toggle to receive communication and set alert preferences. **Alert preference items**: Crawl errors; Index issues; Account related; Promotional (new features/offers).

## Crawl Error Alerts
`/webmasters/help/crawl-error-alerts-e29a3f3e`

Describes crawl error alerts sent to the Notifications Center when issues are significant/increasing:
- **401 (Unauthorized)**: server requires login — check you're not unintentionally blocking pages; consider robots.txt disallow.
- **403 (Forbidden)**: server denying Bingbot — check IP-range blocking (Bingbot IPs change); use Verify Bingbot; use robots.txt/Crawl Control instead of blocking.
- **5xx (aggregate server errors)**: temporary or code/config error — check server logs.
- **500 (Internal Server Error)**: code/config issue — check URLs in Crawl Information + server logs.
- **503 (Service Unavailable)**: overload/maintenance — check samples.
- **509 (Bandwidth Exceeded)**: throughput/bandwidth limits — use Crawl Control.
- **Crawl politeness — Crawl delay setting**: your robots.txt crawl-delay prevents effective crawling — remove it, use Crawl Control.
- **Crawl politeness — Increase crawl rate**: current setting prevents efficient crawling — increase via Crawl Control.
- **DNS issues**: DNS failures (e.g. TTL=0 misconfig, filtering Bingbot) — check with URL Inspection.
- **Connection issues**: connection errors (server overloaded) — check logs; use URL Inspection.

---

# 📁 قسم 4: GETTING HELP & SUPPORT (3 صفحات)

## Webmaster Support
`/webmasters/help/webmaster-support-24ab5ebf`

Separate help sections accessible from the left nav. Lists common queries with self-diagnose steps. Recommends reading the Bing Webmaster Guidelines. **Most popular queries**: Why is my site not in the Bing index?; Why is this URL not indexed?; How can I submit URLs?; How can I remove a URL?; Why is Bing crawling too often?; Unable to verify site; Where to get verification code?; No search data; How to understand user behavior. Diagnostic tools help; otherwise Raise a support request.

## Report a Bingbot issue
`/webmasters/help/how-to-report-an-issue-with-bingbot-25c19802`

Bingbot is Bing's crawler; it honors robots.txt including crawl-delay, and respects Crawl Control ("Crawl Politeness"). **Report overcrawling**: 1) Verify the traffic is genuine Bingbot (Verify Bingbot tool — user agents are easily spoofed). 2) Reduce traffic via methods 3–5. 3) Lower crawl speed during busy hours (Crawl Control). 4) Add a crawl-delay directive to robots.txt (e.g. `User-agent: Bingbot / Crawl-delay: 5`). Crawl-delay limits pages: delay 5 → ~17,280 URLs/day; delay 10 → ~8,640; max 20 (lowest count). 5) If still occurring, contact Bing Webmaster Support → "Crawling issue" → "Bing is crawling too much"; reply in 24–48 hours (keep server log samples handy).

## Bing User Help Topics
`/webmasters/help/bing-user-help-topics-efa48dfe`

> **Content has moved.** (الصفحة دي محتواها اتنقل، مفيش نص فيها حاليًا.)

---

# 📁 قسم 5: ADVANCED TOPICS (5 صفحات)

## Block URLs from Bing
`/webmasters/help/block-urls-from-bing-264e560a`

Note: applies to webmasters; if not the owner,