# Local CFM centrals / D1 proof

This is an isolated compatibility test, not application code. It has no
production D1 ID, no remote binding, and must only be run with `--local`.
Fixtures are synthetic. It does not change the existing Express route, session
authorization, PostgreSQL database, or production traffic.

Run from this directory:

```sh
node --test test.mjs
```

The test uses Wrangler 4 through `npx` without adding Wrangler to the project
manifest. D1 state is created under the OS temporary directory and removed by
the test teardown. The Worker accepts a test-only bearer token injected by the
test process. This exercises an internal proof token only; it does **not** prove
how Express should securely pass the authenticated CFM session to a production
Worker. That identity/permission handoff remains a gate before wiring any app
route to D1.

`created_at` fixture values are canonical ISO strings to match the JSON shape
returned by the current Drizzle route. Production timestamp conversion,
ordering requirements, error mapping, and authenticated user-context handoff
need separate tests before migration.
