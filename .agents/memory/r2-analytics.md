---
name: Cloudflare R2 analytics
description: How to measure R2 request volume and storage without scanning objects.
---

Use Cloudflare GraphQL Analytics `r2OperationsAdaptiveGroups` filtered by account and bucket to measure operation counts, and `r2StorageAdaptiveGroups` for stored bytes and object counts. The R2 REST account metrics endpoint reports storage/object counts, not per-operation volume.

The connected Cloudflare permission can read R2 metrics but may not include the newer Billable Usage API: a read of `/accounts/{account_id}/billable-usage/info` returned an authentication error. Use the dashboard for the authoritative billing cycle and billable totals unless permissions change.

**Why:** A prior R2 object listing was denied, and recurring `ListObjects` scans are unnecessary Class A operations. The app’s S3 credentials are not an account-level analytics credential.

**How to apply:** Use the authorized Cloudflare MCP for read-only analytics. Keep date windows within the dataset’s 31-day range, distinguish calendar windows from the billing cycle, and confirm billable totals in Cloudflare’s Billable Usage dashboard.
