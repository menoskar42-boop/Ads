// Standalone launcher (kept for running Safari Kids on its own if ever needed).
// When merged into OscarDevs, server.js imports ./app.mjs directly and this
// file is not used.
import app from "./app.mjs";
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  const hasKey = Boolean(process.env.OPENAI_API_KEY);
  console.log(`🦁 Safari Kids Adventure (standalone) on ${PORT}`);
  if (!hasKey) console.log("⚠️  no OPENAI_API_KEY — AI features fall back to Web Speech.");
});
