# Research Notes: OscarDevs Business Research Pipeline

**Status:** complete
**Depth:** Deep

## Plan

- **Question:** ما المشكلة التشغيلية التي يدفع أصحاب الأعمال في مصر والخليج لحلها، ويمكن لـ OscarDevs تحويلها إلى SaaS أو خدمة منتجة قابلة للتوسع؟
- **Scope:** مصر والسعودية والإمارات أولًا؛ أسواق عالمية فقط كمرجع للحلول والمنافسة؛ لا بيانات خاصة ولا تواصل نيابة عن OscarDevs.
- **Audience:** مؤسس OscarDevs وفريق صغير يقرر ما الذي يبنيه ويبيعه خلال 90 يومًا.
- **Deliverable:** تقرير تنفيذي مترابط، سجل مصادر قابل للنقر، وملفات CSV للفرص والإشارات والمنافسين والمنتجات وخطة SEO.

## Focus Areas

| # | Area | Status | Sources |
|---|---|---|---|
| 1 | Problem discovery والطلب القطاعي | done | 4 archived + leads |
| 2 | SaaS/Vertical SaaS والمنافسة والتسعير | done | 12 archived |
| 3 | Buying signals وLead generation العام | done | 4 archived + 32 orgs |
| 4 | المنتجات الرقمية وDemo Systems | done | 3 archived + 20 candidates |
| 5 | نموذج العمل والنمو وSEO | done | 5 archived + assumptions |

## Coverage Checklist

- [x] توجد إشارات اتجاهية لمشكلة الكفاءة والرقمنة؛ التكرار المحلي والاستعداد للدفع ينتظران المقابلات. [@mastercard-egypt-sme] [@oecd-d4sme-2025]
- [x] أفضل 10 وأفضل 3 موثقة في التقرير؛ لم تُكرر النتائج للوصول إلى 50 دون دليل.
- [x] BranchFlow وMVP وتسعير اختباري وخطة التحقق موثقة.
- [x] 27 بديلًا ومصفوفة وفجوة الربط بين المحادثة والفرع والمتابعة.
- [x] 32 منظمة بإشارات عامة؛ لم تُملأ قائمة Top 100 لغياب 100 سجل مستقل.
- [x] 20 مرشحًا وأفضل خمسة products وأفضل خمسة demos.
- [x] نموذج تشغيل وسيناريوهات مالية موسومة كافتراضات.
- [x] خريطة SEO لشهور السنة وخطة تحقق 90 يومًا.

## Findings Log

_[@key] markers reference sources in research/sources.json; they become numbered citations in the final report._

### Problem discovery

#### Evidence and method (26 August 2026)

Seven independent web-search calls were run (five in the first pass, including an
Arabic call, and two authority-focused follow-ups). Queries covered Egypt, Saudi
Arabia, UAE, WhatsApp sales/support, bookings, inventory, invoicing, spreadsheets,
manual work and customer follow-up. Search results are discovery leads, not proof
of prevalence. The table below therefore labels each item as a **candidate
problem**: it is a testable customer hypothesis, not a claim that all SMEs have
the problem. “Frequency” is the expected workflow cadence to validate, not a
measured market frequency.

The strongest fetched public sources are Mastercard's Egypt SME Confidence Index
(2025-02-20), Monsha'at's Saudi Digital Transformation for SMEs report (2024
directory entry; the PDF gateway timed out on repeated fetches, so it remains a
search lead rather than a fetched source), and OECD *SME digitalisation for
competitiveness* (2025-04). The two successfully fetched documents are archived
under `research/sources/`.

#### Key facts (measured, not inferred)

- Mastercard reports that **85% of surveyed Egyptian SMEs accept digital
  payments**; the release does not disclose the sample size on the fetched page,
  so this is not a population estimate.
- The same release says **70% of surveyed Egyptian SMEs identify rising costs of
  goods and services as a key challenge**. It also reports 94% calling
  user-friendly financial solutions, 93% better data analytics/insights, and
  90% training/development critical to long-term success. These are survey
  responses from a vendor-sponsored index, not proof of a specific SaaS feature
  demand.
- OECD's 2025 D4SME survey covers **ten OECD countries**, not Egypt, Saudi
  Arabia, or the UAE. It frames digitalisation as a way to improve operational
  efficiency and identifies digital maturity, skills, technology adoption and
  process adaptation as relevant barriers. It is useful for problem framing,
  not country prevalence.
- The search result for the official Monsha'at Saudi report describes digital
  transformation opportunities, but the report could not be fetched (HTTP 504);
  no numerical Saudi pain claim is made here.

#### Candidate problem register

| # | Candidate recurring problem (hypothesis) | Evidence URL(s) | Likely customer | Current workaround to test | Expected frequency | Confidence |
|---:|---|---|---|---|---|---|
| 1 | Leads and support inquiries split across WhatsApp chats | [WA business report](https://whatsappbusiness.com/resources/resource-library/state-of-business-messaging/) | Retail/service owner | Personal phones, pinned chats | Daily | Low—cross-reference locally |
| 2 | No shared inbox or owner of unanswered WhatsApp messages | [WA business report](https://whatsappbusiness.com/resources/resource-library/state-of-business-messaging/) | Clinics, salons, home services | Staff hand-off in chat | Daily | Low |
| 3 | Slow follow-up after a quote or inquiry | [Mastercard Egypt](https://www.mastercard.com/news/eemea/en/newsroom/press-releases/en/2025-1/february/mastercard-sme-confidence-index-egyptian-smes-embrace-digital-payments-and-innovation-for-sustainable-growth) | Sales-led SMEs | WhatsApp search/reminders | Daily | Low |
| 4 | Customer history is not visible to the next staff member | [OECD report](https://www.oecd.org/content/dam/oecd/en/publications/reports/2025/04/sme-digitalisation-for-competitiveness_3116862a/197e3077-en.pdf) | Multi-agent support teams | Chat exports and memory | Daily | Low |
| 5 | Booking requests are negotiated manually instead of using availability | [WA business report](https://whatsappbusiness.com/resources/resource-library/state-of-business-messaging/) | Clinics, salons, tour operators | Calendar plus chat | Daily | Low |
| 6 | Double-booking or missed appointment reminders | [OECD report](https://www.oecd.org/content/dam/oecd/en/publications/reports/2025/04/sme-digitalisation-for-competitiveness_3116862a/197e3077-en.pdf) | Appointment businesses | Paper/phone calendar | Daily/weekly | Low |
| 7 | Rescheduling and cancellation follow-up is forgotten | [WA business report](https://whatsappbusiness.com/resources/resource-library/state-of-business-messaging/) | Clinics and classes | Manual message templates | Weekly | Low |
| 8 | Branches cannot see one another's bookings | [Monsha'at lead](https://www.monshaat.gov.sa/sites/default/files/2024-11/DIGITAL_TRANSFORMATION%D9%80FOR%D9%80SMEs%D9%80%D9%80EN.pdf) | Retail/service chains | Separate spreadsheets | Daily | Low—fetch/cross-reference |
| 9 | Central owner lacks a live branch workload view | [Monsha'at lead](https://www.monshaat.gov.sa/sites/default/files/2024-11/DIGITAL_TRANSFORMATION%D9%80FOR%D9%80SMEs%D9%80%D9%80EN.pdf) | Growing Saudi/UAE chains | Calls and end-of-day reports | Daily | Low |
| 10 | Stock counts differ by branch/channel | [OECD report](https://www.oecd.org/content/dam/oecd/en/publications/reports/2025/04/sme-digitalisation-for-competitiveness_3116862a/197e3077-en.pdf) | Retail, food, pharmacies | Physical count + sheet | Daily/weekly | Low |
| 11 | Owner discovers stock-outs only after a sale | [OECD report](https://www.oecd.org/content/dam/oecd/en/publications/reports/2025/04/sme-digitalisation-for-competitiveness_3116862a/197e3077-en.pdf) | Instagram/WhatsApp sellers | Ask staff to check shelves | Daily | Low |
| 12 | Reordering is based on intuition, not a threshold | [OECD report](https://www.oecd.org/content/dam/oecd/en/publications/reports/2025/04/sme-digitalisation-for-competitiveness_3116862a/197e3077-en.pdf) | Small retailers | Notes and supplier calls | Weekly | Low |
| 13 | Product/catalogue prices become inconsistent across channels | [WA business report](https://whatsappbusiness.com/resources/resource-library/state-of-business-messaging/) | Social sellers | Copy/paste messages | Weekly | Low |
| 14 | Orders arrive as unstructured text, making fulfilment error-prone | [WA business report](https://whatsappbusiness.com/resources/resource-library/state-of-business-messaging/) | D2C and restaurants | Manually retype order | Daily | Low |
| 15 | Delivery address/phone details are incomplete or buried in chat | [WA business report](https://whatsappbusiness.com/resources/resource-library/state-of-business-messaging/) | Local commerce | Ask customer again | Daily | Low |
| 16 | Digital payment is accepted but not reconciled to each order | [Mastercard Egypt](https://www.mastercard.com/news/eemea/en/newsroom/press-releases/en/2025-1/february/mastercard-sme-confidence-index-egyptian-smes-embrace-digital-payments-and-innovation-for-sustainable-growth) | Egyptian merchants | Bank/app screenshots | Daily | Medium—payment adoption is sourced; reconciliation is hypothesis |
| 17 | Payment confirmation is manually checked before fulfilment | [Mastercard Egypt](https://www.mastercard.com/news/eemea/en/newsroom/press-releases/en/2025-1/february/mastercard-sme-confidence-index-egyptian-smes-embrace-digital-payments-and-innovation-for-sustainable-growth) | WhatsApp commerce | Screenshot approval | Daily | Low |
| 18 | Invoice creation is disconnected from order capture | [Mastercard Egypt](https://www.mastercard.com/news/eemea/en/newsroom/press-releases/en/2025-1/february/mastercard-sme-confidence-index-egyptian-smes-embrace-digital-payments-and-innovation-for-sustainable-growth) | Egyptian SMEs | Spreadsheet/accountant | Daily | Low |
| 19 | E-invoice data has to be re-entered or corrected | [OECD report](https://www.oecd.org/content/dam/oecd/en/publications/reports/2025/04/sme-digitalisation-for-competitiveness_3116862a/197e3077-en.pdf) | Tax-registered SMEs | Accountant and portal | Daily/monthly | Low—needs tax-workflow evidence |
| 20 | Invoice/payment follow-up is not systematically scheduled | [Mastercard Egypt](https://www.mastercard.com/news/eemea/en/newsroom/press-releases/en/2025-1/february/mastercard-sme-confidence-index-egyptian-smes-embrace-digital-payments-and-innovation-for-sustainable-growth) | B2B suppliers | Calendar/phone reminders | Weekly | Low |
| 21 | Cash-flow visibility lags behind sales activity | [Mastercard Egypt](https://www.mastercard.com/news/eemea/en/newsroom/press-releases/en/2025-1/february/mastercard-sme-confidence-index-egyptian-smes-embrace-digital-payments-and-innovation-for-sustainable-growth) | Owner-managed SMEs | Bank statement + sheet | Weekly | Medium—financial resilience is source theme |
| 22 | Spreadsheet versions conflict between sales and stock | [OECD report](https://www.oecd.org/content/dam/oecd/en/publications/reports/2025/04/sme-digitalisation-for-competitiveness_3116862a/197e3077-en.pdf) | Small teams | Shared files/WhatsApp | Daily/weekly | Medium—digital maturity evidence; exact conflict needs interviews |
| 23 | Manual reporting consumes owner/manager time | [OECD report](https://www.oecd.org/content/dam/oecd/en/publications/reports/2025/04/sme-digitalisation-for-competitiveness_3116862a/197e3077-en.pdf) | All owner-managed SMEs | End-of-day summaries | Daily | Medium—manual work is plausible, not quantified locally |
| 24 | Staff lack a consistent script for common support questions | [WA business report](https://whatsappbusiness.com/resources/resource-library/state-of-business-messaging/) | Retail and services | Saved replies | Daily | Low |
| 25 | Repeat customers are not prompted at the right time | [WA business report](https://whatsappbusiness.com/resources/resource-library/state-of-business-messaging/) | Salons, clinics, maintenance | Personal reminders | Weekly/monthly | Low |
| 26 | Customer complaints are not assigned or measured to closure | [WA business report](https://whatsappbusiness.com/resources/resource-library/state-of-business-messaging/) | Service operators | Chat search | Daily | Low |
| 27 | Arabic/English customer context is lost in handovers | [WA business report](https://whatsappbusiness.com/resources/resource-library/state-of-business-messaging/) | Bilingual Gulf businesses | Translation and notes | Daily | Low—requires bilingual interviews |
| 28 | Staff permissions and branch access are managed informally | [Monsha'at lead](https://www.monshaat.gov.sa/sites/default/files/2024-11/DIGITAL_TRANSFORMATION%D9%80FOR%D9%80SMEs%D9%80%D9%80EN.pdf) | Multi-branch SMEs | Shared logins | Monthly/ongoing | Low—fetch/cross-reference |
| 29 | Owner cannot compare conversion, response time, and repeat rate | [OECD report](https://www.oecd.org/content/dam/oecd/en/publications/reports/2025/04/sme-digitalisation-for-competitiveness_3116862a/197e3077-en.pdf) | Sales/service owners | Manual spreadsheet formulas | Weekly | Low |
| 30 | Tool adoption is blocked by cost, skills, or integration effort | [OECD report](https://www.oecd.org/content/dam/oecd/en/publications/reports/2025/04/sme-digitalisation-for-competitiveness_3116862a/197e3077-en.pdf) | Micro and small firms | Stay with familiar tools | Quarterly/ongoing | Medium—OECD barrier evidence; country fit needs validation |

**Interpretation:** Only the Mastercard-reported Egyptian digital-payment
adoption signal and the OECD digital-maturity/barrier findings should currently
be treated as measured facts. All workflow rows are discovery hypotheses
anchored to those broad signals or to messaging/authority source leads.
No row is a market-size estimate, and no frequency or confidence value is a
statistical probability.

#### Claims needing cross-reference before product commitment

1. WhatsApp dependence and response-time pain need country- and sector-specific
   surveys or interviews; the global WhatsApp report cannot establish Egypt,
   Saudi, or UAE prevalence.
2. Booking, branch coordination, inventory, and spreadsheet failure need direct
   customer evidence; the OECD report is cross-market and does not prove each
   workflow.
3. “Digital payment adoption” does not imply reconciliation or invoice pain.
   Validate with accountants/owners and official Egyptian Tax Authority material.
4. Monsha'at search evidence describes digital-transformation opportunity, not
   a measured list of Saudi SME pain points; fetch and inspect the PDF before
   citing specific claims.
5. Bilingual Arabic/English and branch-permission hypotheses require interviews
   in all three markets.

#### Source quality, gaps, and source register

| Source | URL | Date | Tier | Archived path / status |
|---|---|---|---|---|
| Mastercard, *SME Confidence Index: Egyptian SMEs embrace digital payments and innovation* | https://www.mastercard.com/news/eemea/en/newsroom/press-releases/en/2025-1/february/mastercard-sme-confidence-index-egyptian-smes-embrace-digital-payments-and-innovation-for-sustainable-growth | 2025-02-20 | 2 (primary sponsor survey/press release; methodology must be checked) | `research/sources/problem-01-egypt-mastercard-sme-confidence.md` (fetched) |
| Monsha’at, *Digital Transformation for SMEs* | https://www.monshaat.gov.sa/sites/default/files/2024-11/DIGITAL_TRANSFORMATION%D9%80FOR%D9%80SMEs%D9%80%D9%80EN.pdf | 2024-11 directory entry | 1–2 (official authority, but PDF content not retrieved) | `research/sources/problem-02-saudi-monshaat-digital-transformation.md` (not archived: repeated 504; search lead only) |
| OECD, *SME digitalisation for competitiveness* | https://www.oecd.org/content/dam/oecd/en/publications/reports/2025/04/sme-digitalisation-for-competitiveness_3116862a/197e3077-en.pdf | 2025-04 | 1 (multilateral report; broad cross-country scope) | `research/sources/problem-03-oecd-sme-digitalisation.md` (fetched; first 50k-character chunk) |
| WhatsApp Business, *State of Business Messaging* | https://whatsappbusiness.com/resources/resource-library/state-of-business-messaging/ | 2026 page (date to verify) | 3 (vendor source; global, commercial framing) | Search lead only |

Important gaps: no primary interviews, no representative country-by-country
sample for the target workflows, no public willingness-to-pay data, and no
reliable estimates of time or money lost. Search snippets and vendor claims
must not be promoted to facts. The Saudi source gateway failure is explicit;
retry/fetch it before using its detailed findings.

### SaaS and competition

- BranchFlow هو الخيار المختار للاختبار، مع 27 بديلًا ومخاطر امتثال موثقة. [@salla-plans] [@zid-pricing] [@zatca-einvoice]

### Buying signals

- توجد 32 منظمة بإشارات عامة، لكن الإشارة لا تعني طلب شراء. [@aramco-digital-news] [@lucky-series-b] [@uae-space-platform]

### Products, demos, growth

- أفضل أصل قابل لإعادة البيع هو core واحد مع vertical packs، وتُدار SEO عبر محتوى people-first وSearch Console. [@google-seo-starter] [@google-search-console]

## Conflicts & Open Questions

- بيانات حجم السوق المنشورة غالبًا تقيس قطاعًا واسعًا أو سوقًا عالميًا، لا سوق SaaS العربي المتخصص؛ لن تُعرض كتقدير محلي إلا مع وسمها بوضوح.
- أسعار المنافسين تختلف حسب الدولة، عدد المستخدمين، الإضافات، والضريبة؛ الأسعار غير المعلنة ستبقى Unknown، وأي نطاق مقترح سيكون افتراضًا اختباريًا.
- صفحات التواصل الاجتماعي لا يمكن اعتبارها دليلًا قابلًا للتدقيق من دون مصدر عام بديل؛ ستُستخدم كإشارة فقط إن أمكن توثيقها.

## Gaps

- لا توجد بيانات أولية من مقابلات أو مكالمات عملاء؛ ستُحوّل الفجوات إلى أسئلة مقابلات في التسليم.
- بيانات الشراء الفعلية وميزانيات الشركات الخاصة غير عامة؛ درجات الفرص تقديرية وليست احتمالات إغلاق.