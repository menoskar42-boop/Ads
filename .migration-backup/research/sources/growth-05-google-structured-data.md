Source: https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
Title: Intro to How Structured Data Markup Works | Google Search Central  |  Documentation  |  Google for Developers
Fetched: 2026-08-26T10:30:46.309Z

[Skip to main content](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data#main-content)

[![Google Search Central](https://developers.google.com/static/search/images/google-search-central-logo.svg)](https://developers.google.com/search)

- [GoogleSearch Central](https://developers.google.com/search)

`/`

Language

- [English](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)
- [Deutsch](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=de)
- [Español](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=es)
- [Español – América Latina](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=es-419)
- [Français](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=fr)
- [Indonesia](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=id)
- [Italiano](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=it)
- [Polski](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=pl)
- [Português – Brasil](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=pt-br)
- [Tiếng Việt](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=vi)
- [Türkçe](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=tr)
- [Русский](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=ru)
- [العربيّة](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=ar)
- [हिंदी](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=hi)
- [ภาษาไทย](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=th)
- [中文 – 简体](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=zh-cn)
- [中文 – 繁體](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=zh-tw)
- [日本語](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=ja)
- [한국어](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data?hl=ko)

[Sign in](https://developers.google.com/_d/signin?continue=https%3A%2F%2Fdevelopers.google.com%2Fsearch%2Fdocs%2Fappearance%2Fstructured-data%2Fintro-structured-data&prompt=select_account)

- [Documentation](https://developers.google.com/search/docs)

[Search Console](https://goo.gle/searchconsole)

- On this page
- [Why add structured data to a page?](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data#why)
- [How structured data works in Google Search](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data#how-structured-data-works-in-google-search)
- [Structured data vocabulary and format](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data#structured-data-vocabulary-and-format)
  - [Supported formats](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data#supported-formats)
- [Structured data guidelines](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data#guidelines)
- [Get started with structured data](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data#get-started)
- [Measuring the effect of structured data](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data#measuring)

- [Home](https://developers.google.com/)
- [Search Central](https://developers.google.com/search)
- [Documentation](https://developers.google.com/search/docs)



 Send feedback



- On this page
- [Why add structured data to a page?](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data#why)
- [How structured data works in Google Search](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data#how-structured-data-works-in-google-search)
- [Structured data vocabulary and format](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data#structured-data-vocabulary-and-format)
  - [Supported formats](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data#supported-formats)
- [Structured data guidelines](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data#guidelines)
- [Get started with structured data](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data#get-started)
- [Measuring the effect of structured data](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data#measuring)

# Introduction to structured data markup in Google Search

Google Search works hard to understand the content of a page. You can help us by providing explicit
clues about the meaning of a page to Google by including structured data on the page.
Structured data is a standardized format for providing information about a page and classifying
the page content; for example, on a recipe page, what are the ingredients, the cooking
time and temperature, the calories, and so on.

## Why add structured data to a page?

Adding structured data can enable search results that are more engaging to users and might
encourage them to interact more with your website, which are called _rich results_.
Here are some case studies of websites that have implemented structured data for their site:

- Rotten Tomatoes added structured data to 100,000 unique pages and measured a 25% higher click-through rate for pages enhanced with structured data, compared to pages without structured data.
- The Food Network has converted 80% of their pages to enable search features, and has seen a 35% increase in visits.
- Rakuten has found that users spend 1.5x more time on pages that implemented structured data
than on non-structured data pages, and have a 3.6x higher interaction rate on AMP pages
with search features vs non-feature AMP pages.
- Nestlé has measured pages that show as rich results in search have an 82% higher click
through rate than non-rich result pages.

## How structured data works in Google Search

Google uses structured data that it finds on the web to understand the content of the page,
as well as to gather information about the web and the world in general, such as information
about the people, books, or companies that are included in the markup. For example,
when a recipe page has [JSON-LD](https://json-ld.org/) structured data
(describing the title of the recipe, the author of the recipe, and other details), Google Search
can use that information to display a rich result for the recipe:

![How a recipe web page's structured data can influence a rich result in Google Search](https://developers.google.com/static/search/docs/images/structured-data-explainer.png)

Because the structured data labels each individual element of the recipe, users can search
for your recipe by ingredient, calorie count, cook time, and so on.

Structured data is coded using in-page markup on the page that the information applies to.
The structured data on the page describes the content of that page. Don't create
blank or empty pages just to hold structured data, and don't add structured data about
information that is not visible to the user, even if the information is accurate. For more technical
and quality guidelines, see the [Structured data\\
general guidelines](https://developers.google.com/search/docs/guides/sd-policies).

The [Rich Results Test](https://search.google.com/test/rich-results) is an easy and useful
tool for validating your structured data, and in some cases, previewing a feature in Google Search. Try it out:

## Structured data vocabulary and format

This documentation describes which properties are required, recommended, or optional for
structured data with special meaning to Google Search. Most Search structured data uses
[schema.org](https://schema.org/) vocabulary, but you should rely
on the Google Search Central documentation as definitive for Google Search behavior, rather
than the schema.org documentation. There are more attributes and objects on schema.org that
aren't required by Google Search; they may be useful for other search engines, services, tools, and platforms.

Be sure to check your structured data using the [Rich Results Test](https://search.google.com/test/rich-results) during development, and the
[Rich result status reports](https://support.google.com/webmasters/answer/7552505)
after deployment, to monitor the validity of your pages, which might break
after deployment due to templating or serving issues.

You must include all the required properties for an object to be eligible for appearance in
Google Search with enhanced display. In general, defining more recommended features can make
it more likely that your information can appear in Search results with enhanced display.
**However**, it is more important to supply fewer but complete and accurate
recommended properties rather than trying to provide every possible recommended property with
less complete, badly-formed, or inaccurate data.

In addition to the properties and objects documented here, Google can make general use of the
[`sameAs`](https://schema.org/sameAs) property and other
[schema.org](https://schema.org/)
structured data. Some of these elements may be used to enable future Search features, if they
are deemed useful.

### Supported formats

Google Search supports structured data in the following formats, unless documented otherwise.
In general, we recommend using a format that's easiest for you to implement and maintain (in most cases,
that's JSON-LD); all 3 formats are equally fine for Google, as long as the markup is valid and
properly implemented per the feature's documentation.

| Formats |
| --- |
| [JSON-LD](https://json-ld.org/)\\* **(Recommended)** | A JavaScript notation embedded in a `<script>` tag in the `<head>`<br> and `<body>` elements of an HTML page. The<br> markup is not interleaved with the user-visible text, which makes nested data items easier<br> to express, such as the `Country` of a `PostalAddress`<br> of a `MusicVenue` of an `Event`.<br> Also, Google can read JSON-LD data when it is [dynamically\<br> injected into the page's contents](https://developers.google.com/search/docs/guides/generate-structured-data-with-javascript), such as by JavaScript code or embedded widgets in<br> your content management system. |
| [Microdata](https://html.spec.whatwg.org/multipage/microdata.html#microdata) | An open-community HTML specification used to nest structured data within HTML<br> content. Like RDFa, it uses HTML tag attributes to name the properties you want<br> to expose as structured data. It is typically used in the `<body>` element, but can be used in the `<head>` element. |
| [RDFa](https://rdfa.info/) | An HTML5 extension that supports linked data by introducing<br> [HTML tag attributes](https://www.w3.org/TR/rdfa-lite/#the-attributes) that<br> correspond to the user-visible content that you want to describe for search engines. RDFa<br> is commonly used in both the `<head>` and `<body>` sections of the HTML page. |

## Structured data guidelines

Be sure to follow the [general structured data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies), as well
as any guidelines specific to your structured data type; otherwise your structured
data might be ineligible for rich result display in Google Search.

## Get started with structured data

If you're new to structured data, check out [schema.org\\
beginner's guide to structured data](https://schema.org/docs/gs.html). While the guide focuses on Microdata,
the basic ideas are relevant for JSON-LD and RDFa.

Once you're comfortable with the basics of structured data, explore the [list of structured data features in Google Search](https://developers.google.com/search/docs/appearance/structured-data/search-gallery)
and pick a feature to implement. Each guide goes into detail on how to
implement the structured data in a way that makes your site eligible for a rich result
appearance on Google Search.

[Choose a feature](https://developers.google.com/search/docs/appearance/structured-data/search-gallery)

## Measuring the effect of structured data

You probably want to compare performance of your pages with structured data with those pages that
don't have structured data, in order to decide if it's worth your effort. The best way to do that
is to run a [before and after test on a few pages on your site](https://developers.google.com/search/docs/crawling-indexing/website-testing).
This can be a little tricky, since page views can vary for a single page for various reasons.

1. Take some pages on your site that are not using any structured data, and have several months of
    data in Search Console. Be sure to choose pages that won't be affected by the time of year or
    timeliness of the page content; use pages that won't change much, but are still popular enough to
    be read often enough to generate meaningful data.
2. Add structured data or other features to your pages. Confirm that your markup is valid, and
    that Google has found your structured data using the
    [URL Inspection tool](https://support.google.com/webmasters/answer/9012289)
    on your page.
3. Record the performance for a few months in the
    [Performance report](https://support.google.com/webmasters/answer/7576553#by_search_appearance),
    and filter by URL to compare performance of your page.



 Send feedback



Except as otherwise noted, the content of this page is licensed under the [Creative Commons Attribution 4.0 License](https://creativecommons.org/licenses/by/4.0/), and code samples are licensed under the [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0). For details, see the [Google Developers Site Policies](https://developers.google.com/site-policies). Java is a registered trademark of Oracle and/or its affiliates.

Last updated 2025-12-10 UTC.


Need to tell us more?






\[\[\["Easy to understand","easyToUnderstand","thumb-up"\],\["Solved my problem","solvedMyProblem","thumb-up"\],\["Other","otherUp","thumb-up"\]\],\[\["Missing the information I need","missingTheInformationINeed","thumb-down"\],\["Too complicated / too many steps","tooComplicatedTooManySteps","thumb-down"\],\["Out of date","outOfDate","thumb-down"\],\["Samples / code issue","samplesCodeIssue","thumb-down"\],\["Other","otherDown","thumb-down"\]\],\["Last updated 2025-12-10 UTC."\],\[\],\["Structured data enhances Google Search's understanding of web page content. Implementing it using formats like JSON-LD, Microdata, or RDFa can result in rich results. Case studies show increased click-through rates, visits, and user engagement on pages with structured data. CMS users can add it via plugins or settings. Use the Rich Results Test for validation. Adhere to guidelines and prioritize complete, accurate properties. After implementing, compare the performance of pages with and without structured data to assess its impact.\\n"\]\]



Info


Chat


API