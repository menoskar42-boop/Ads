---
name: St-Takla tafsir parsing
description: Non-obvious source formatting rules for safely separating chapter and verse commentary.
---

St-Takla commentary exports can contain navigation lists and links to other commentaries inside the plain-text field, while a chapter-level import row may use `(chapter:1)` only as a wrapper for the whole page.

**Why:** Treating those artifacts as commentary leaks site navigation into the reader and can make a missing verse appear to have the entire chapter as its explanation.

**How to apply:** Strip source navigation centrally during parsing, recognize compact Arabic subsection labels such as `ع21، 22:` and `ع23:`, and do not infer verse 1 availability from a chapter wrapper row.

St-Takla can move a chapter to a newer URL while leaving an older generated index link at 404. Keep a short-lived, explicitly mapped live-source fallback for verified missing chapters; do not persist fetched sacred text to disk. Because the imported books may use different St-Takla commentary series, use generic St-Takla attribution unless the exact author is known for that chapter.

**Why:** A stale index should not hide a verified current chapter, and attributing a Tadros or mixed-series page to another commentator is misleading.

**How to apply:** Keep local coverage honest, make recoverable missing chapters selectable, mark live responses separately, and return an explicit unavailable state when no verified current URL exists.