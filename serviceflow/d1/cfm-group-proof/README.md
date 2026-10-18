# Local CFM group proof

Run from this directory:

```sh
node --test test.mjs
```

The test uses Wrangler D1 local emulation, imports the synthetic SQL fixture
from `fixtures.sql`, and deletes its temporary state directory after the run.
It does not access Cloudflare, PostgreSQL, production data, or application routes. The local schema mirrors
the current CFM D1 draft plus `box_fault_tickets`; it is a proof fixture, not a
production migration or the final application schema.

The proof covers a joined ticket read, synthetic child writes, foreign-key and
uniqueness failures, valid JSON enforcement, idempotent integration-ledger
upsert, ticket child cascades, and inventory `SET NULL`. It does not verify
Express role checks, the typed Worker API, or atomic multi-statement behavior
through a Worker `batch()`.
