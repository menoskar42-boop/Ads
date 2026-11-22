const SUPABASE_POOLER_SUFFIX = ".pooler.supabase.com";
const SUPABASE_DATABASE_SUFFIX = ".supabase.co";

export function messengerDatabaseConnectionString(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("ADS_DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("ADS_DATABASE_URL must use PostgreSQL");
  }

  const host = url.hostname.toLowerCase();
  const isPooler = host.endsWith(SUPABASE_POOLER_SUFFIX);
  if (!isPooler && !host.endsWith(SUPABASE_DATABASE_SUFFIX)) {
    throw new Error("ADS_DATABASE_URL must point to Supabase PostgreSQL");
  }

  if (isPooler) {
    if (url.port === "6543") url.port = "5432";
    if (!url.searchParams.has("sslmode")) {
      url.searchParams.set("sslmode", "require");
    }
    if (!url.searchParams.has("uselibpqcompat")) {
      url.searchParams.set("uselibpqcompat", "true");
    }
  }

  return url.toString();
}
