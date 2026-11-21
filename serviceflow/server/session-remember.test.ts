// جلسة الدخول وجهاز التنفيذ (٢٠٢٦-١١-١٧: جهاز التنفيذ وقف بعد قفل التاب). الجسر مااتعدّلش (قرار المالك).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("session cookie is httpOnly + SameSite=lax + secure auto, and «فاكرنى» makes it 30 days on both login routes", () => {
  const r = read("./routes.ts");
  assert.match(r, /cookie: \{ maxAge: SESSION_MS, httpOnly: true, sameSite: "lax", secure: "auto" \}/);
  assert.match(r, /REMEMBER_MS = 30 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(r, /req\?\.body\?\.remember === true/);
  assert.equal((r.match(/rememberSession\(req\);/g) || []).length, 2);
  const login = read("../client/src/pages/login.tsx");
  assert.match(login, /login\(\{ username, password, remember \}\)/);
  assert.match(login, /sf_exec_active/);
});

test("executor says the session expired on 401 instead of a generic queue error", () => {
  const ex = read("../client/src/components/ExecutorButton.tsx");
  assert.match(ex, /r\.status === 401/);
  assert.match(ex, /الجلسة انتهت/);
});
