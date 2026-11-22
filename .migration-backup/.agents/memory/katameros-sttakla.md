---
name: Katameros St-Takla source
description: The verified source pattern for date-specific Coptic lectionary readings.
---

Date-specific Katameros data is exposed by St-Takla’s `today-arabic` page, which links each available reading to a `today_bible` page containing the verse tables. The application must discover and display those links and must not substitute local generated schedules when a day or reading is unavailable.

**Why:** The local schedule covered only a subset of the year and could present the nearest prior day as if it were today’s service readings.

**How to apply:** Keep the upstream URL and query shape server-controlled, validate every discovered link stays on the St-Takla host, show the upstream source link, and report missing upstream readings explicitly.