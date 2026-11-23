import { defineConfig } from "drizzle-kit";
import path from "path";
import { messengerDatabaseConnectionString } from "./src/messenger-connection";

if (!process.env.ADS_DATABASE_URL) {
  throw new Error("ADS_DATABASE_URL is required for Oscar Messaging migrations");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  // ⛔ ADS_DATABASE_URL هى قاعدة OscarDevs الحية (أكتر من ٣٢٠ جدول فى public). من غير الفلتر ده drizzle-kit push بيعتبر
  // كل جدول مش فى schema الماسنجر «زيادة» ويقترح يمسحه. الفلتر بيقصره على جداول messenger_ بس.
  schemaFilter: ["public"],
  tablesFilter: ["messenger_*"],
  dbCredentials: {
    url: messengerDatabaseConnectionString(process.env.ADS_DATABASE_URL),
  },
});
