# Service Flow storage and R2 audit

**Snapshot date:** 2026-10-12  
**Scope:** read-only PostgreSQL catalog/statistics queries and Cloudflare R2 metrics. No object listing scan, data deletion, schema change, or rate-limit rule was performed.

## Summary

- PostgreSQL database size: **581,419,008 bytes (about 554.5 MiB)**.
- The seven largest tables below occupy **496,369,664 bytes (about 473.3 MiB, 85.4% of the database)**.
- Cloudflare reports one R2 bucket, `serviceflow-maintenance`, with **1,967 objects**, **463,498,295 payload bytes (0.464 GB / 0.432 GiB)**, and 57,043 metadata bytes.
- R2 `GetObject` volume was **3,612 in September** and **249 from October 1–12**. The latter is about **0.0025%** of the documented 10-million monthly Class B included operations. `PutObject` was 1,831 in September and 180 in October 1–12.
- Current usage is far below the published Standard-tier included amounts. The Cloudflare account’s billing-cycle usage and any account-specific terms still need to be checked in **Billable Usage**; the analytics date ranges here are calendar dates.
- No application throttling or caching change is recommended from this snapshot. A new limiter could interrupt legitimate media playback while the measured request volume is negligible.

## PostgreSQL snapshot

Sizes and row counts are estimates from PostgreSQL relation/catalog and statistics views, not table scans. MiB uses 1,048,576 bytes.

| Table | Total MiB | Heap MiB | Index MiB | Live rows (estimate) | Dead rows (estimate) |
| --- | ---: | ---: | ---: | ---: | ---: |
| `complaint_details` | 111.7 | 68.5 | 43.1 | 234,683 | 23,027 |
| `exec_jobs` | 92.4 | 63.3 | 28.9 | 183,358 | 24,453 |
| `complaint_details_current` | 85.3 | 67.7 | 17.5 | 234,683 | 21,840 |
| `remaining_complaints` | 50.4 | 29.2 | 21.2 | 112,389 | 3,342 |
| `ftth_orders_current` | 50.0 | 49.0 | 0.9 | 12,858 | 0 |
| `ftth_orders` | 45.6 | 43.5 | 2.0 | 25,495 | 0 |
| `case_138` | 38.0 | 24.0 | 14.0 | 131,893 | 0 |

Dead-row figures are planner statistics and can be stale; they do not prove that a table needs manual vacuuming. The high-use indexes inspected on `complaint_details` and `exec_jobs` should not be dropped: their PostgreSQL counters show substantial scan activity.

Two start-of-day snapshot tables are unusually index-heavy for their estimated row counts:

- `complaint_details_sod`: about 12.9 MiB total, 61 live rows estimated; its two indexes occupy about 12.8 MiB and have recorded scans.
- `remaining_complaints_sod`: about 4.8 MiB total, 67 live rows estimated; its indexes occupy about 4.7 MiB and have recorded scans.

This is a candidate for a separate, carefully scheduled `REINDEX INDEX CONCURRENTLY` assessment, not permission to run it now. Confirm the target database, free disk headroom, index dependencies, and effect on uploads first. Do not remove either unique complaint-number index.

**Growth rate is not measurable from this single snapshot.** PostgreSQL reported no `stats_reset` timestamp, but that is not a size history. Take a second read-only size snapshot after a representative interval before proposing retention or archival changes.

## Cloudflare R2 operations

Cloudflare GraphQL Analytics was queried for the one bucket; no objects were listed.

| Period (UTC calendar dates) | `GetObject` | `PutObject` | `ListObjects` |
| --- | ---: | ---: | ---: |
| 2026-09-01 through 2026-09-30 | 3,612 | 1,831 | 7 |
| 2026-10-01 through 2026-10-12 | 249 | 180 | 1 |

`GetObject` is Class B; `PutObject` and `ListObjects` are Class A. October 1–12 used 181 of the published 1 million included Class A requests from these operations and 249 of the published 10 million included Class B requests from `GetObject`. Other management actions also appear in September analytics; the billing dashboard remains authoritative for account-wide billable usage and the active billing cycle.

Cloudflare’s current R2 pricing documentation lists **10 GB-month Standard storage, 1 million Class A requests, and 10 million Class B requests** as included monthly usage. The R2 REST `/metrics` endpoint reports storage/object counts, not operation totals; use `r2OperationsAdaptiveGroups` for request counts and `r2StorageAdaptiveGroups` for storage. Avoid periodic `ListObjects` scans.

## Safe next actions

1. Review **Manage Account → Billing → Billable Usage** to confirm the active billing cycle and actual billable R2 usage.
2. Consider Cloudflare’s dollar-based Budget Alert in the dashboard. It warns on projected spend, not a hard request-count cap, and it does not stop requests.
3. Take a second PostgreSQL size/statistics snapshot after a representative interval. Review the two start-of-day tables and disk headroom before considering concurrent index rebuilds.
4. Keep the existing media response cache headers. Do not add a per-request database counter, memory-heavy whole-bucket cache, public-bucket setting, or broad rate limit without evidence of a request spike and a tested rollback.

## References

- [R2 pricing and included monthly usage](https://developers.cloudflare.com/r2/pricing/)
- [R2 metrics and analytics](https://developers.cloudflare.com/r2/platform/metrics-analytics/)
- [Cloudflare Billable Usage](https://developers.cloudflare.com/billing/manage/billable-usage/)
- [Cloudflare Budget Alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/)
