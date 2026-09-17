import pg from "pg";

const configuredMax = Number.parseInt(
  process.env.MYBIBLE_PG_POOL_MAX || "5",
  10,
);
const max = Number.isFinite(configuredMax) && configuredMax > 0
  ? configuredMax
  : 5;

// MyBible shares one Supabase project and one session-pooler account with the
// parent Ads process. One process-wide pool keeps their combined connection
// ceiling below Supabase's limit; parallel requests wait here instead of
// failing with EMAXCONNSESSION.
export const dbPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
});

dbPool.on("error", (error) => {
  console.error("[pg] shared idle client error (recovered):", error.message);
});
