import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { messengerDatabaseConnectionString } from "./messenger-connection";

const { Pool } = pg;

if (!process.env.ADS_DATABASE_URL) {
  throw new Error(
    "ADS_DATABASE_URL must be set for Oscar Messaging.",
  );
}

export const pool = new Pool({
  connectionString: messengerDatabaseConnectionString(process.env.ADS_DATABASE_URL),
  max: 5,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
