---
name: St-Takla section contracts
description: External index pages can be HTTP-successful while losing expected letters, months, encoding, or article content.
---

Treat St-Takla reference indexes as a structural contract, not merely a successful HTTP response: the current Arabic dictionaries expose 28 letter entries and the calendar index exposes 12 month entries. Reject replacement characters, non-Arabic pages, missing expected entries, empty dictionary pages, and empty calendar articles as unavailable.

**Why:** An upstream redesign can leave a page reachable while silently making the application show an incomplete or empty reference shelf.

**How to apply:** Keep the expected entry contract and fixture coverage aligned when St-Takla intentionally changes its index structure; return an explicit unavailable state until the new shape is verified.