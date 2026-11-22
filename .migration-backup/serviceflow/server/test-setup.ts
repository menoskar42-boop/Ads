/**
 * Integration-test bootstrap.
 *
 * The normal test command deliberately does not inherit the app's DATABASE_URL:
 * that URL may point at a live development or production database. Set
 * SERVICEFLOW_TEST_DATABASE_URL explicitly to run the PostgreSQL tests; the
 * dedicated database is then rebuilt idempotently before the test files load.
 */
export {};

const testDatabaseUrl = String(process.env.SERVICEFLOW_TEST_DATABASE_URL || "").trim();

if (testDatabaseUrl) {
  process.env.DATABASE_URL = testDatabaseUrl;
  const { ensureSchema } = await import("./db");
  await ensureSchema();
  console.log("[tests] Service Flow test schema is ready");
}