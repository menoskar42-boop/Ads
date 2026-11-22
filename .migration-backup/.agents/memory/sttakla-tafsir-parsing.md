---
name: St-Takla tafsir parsing
description: Non-obvious source formatting rules for safely separating chapter and verse commentary.
---

St-Takla commentary exports can contain navigation lists and links to other commentaries inside the plain-text field, while a chapter-level import row may use `(chapter:1)` only as a wrapper for the whole page.

**Why:** Treating those artifacts as commentary leaks site navigation into the reader and can make a missing verse appear to have the entire chapter as its explanation.

**How to apply:** Strip source navigation centrally during parsing, recognize compact Arabic subsection labels such as `ع21، 22:` and `ع23:`, prefer dedicated range rows over chapter bodies, stop a direct row before its first child marker, ignore inline cross-references as section headers, strip leading quoted Bible passages, do not infer verse 1 availability from a chapter wrapper row, and never reuse a preceding section or unmarked tail across an explicit verse gap.

Some exports store a complete titled chapter body under a non-zero CSV verse (Isaiah 1 is under verse 2), and may write markers as `آية (1)` without a trailing colon. Treat the declared chapter title plus embedded markers as the section boundary only for that body row; keep ordinary non-zero rows range-checked.

**Why:** Requiring a colon misses valid Isaiah sections, while trusting every non-zero row would let unrelated verse rows leak into another verse lookup.

**How to apply:** Allow an explicitly titled body whose declared chapter matches the requested chapter to serve embedded verse sections, and make the Arabic verse-marker colon optional.

St-Takla can move a chapter to a newer URL while leaving an older generated index link at 404. Keep a short-lived, explicitly mapped live-source fallback for verified missing chapters; do not persist fetched sacred text to disk. Because the imported books may use different St-Takla commentary series, use generic St-Takla attribution unless the exact author is known for that chapter.

**Why:** A stale index should not hide a verified current chapter, and attributing a Tadros or mixed-series page to another commentator is misleading.

**How to apply:** Keep local coverage honest, make recoverable missing chapters selectable, mark live responses separately, and return an explicit unavailable state when no verified current URL exists.