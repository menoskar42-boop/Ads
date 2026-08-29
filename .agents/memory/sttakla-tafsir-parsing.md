---
name: St-Takla tafsir parsing
description: Non-obvious source formatting rules for safely separating chapter and verse commentary.
---

St-Takla commentary exports can contain navigation lists and links to other commentaries inside the plain-text field, while a chapter-level import row may use `(chapter:1)` only as a wrapper for the whole page.

**Why:** Treating those artifacts as commentary leaks site navigation into the reader and can make a missing verse appear to have the entire chapter as its explanation.

**How to apply:** Strip source navigation centrally during parsing, recognize compact Arabic subsection labels such as `ع21، 22:` and `ع23:`, and do not infer verse 1 availability from a chapter wrapper row.