import { defineConfig } from "drizzle-kit";
import path from "path";
import { messengerDatabaseConnectionString } from "./src/messenger-connection";

if (!process.env.ADS_DATABASE_URL) {
  throw new Error("ADS_DATABASE_URL is required for Oscar Messaging migrations");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: messengerDatabaseConnectionString(process.env.ADS_DATABASE_URL),
  },
});
