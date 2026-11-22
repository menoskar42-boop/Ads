import assert from "node:assert/strict";
import test from "node:test";
import { messengerDatabaseConnectionString } from "../../../lib/db/src/messenger-connection.ts";

test("uses Supabase session pooler settings without exposing connection details", () => {
  const result = new URL(
    messengerDatabaseConnectionString(
      "postgresql://user:secret@aws-0.pooler.supabase.com:6543/postgres",
    ),
  );

  assert.equal(result.hostname, "aws-0.pooler.supabase.com");
  assert.equal(result.port, "5432");
  assert.equal(result.searchParams.get("sslmode"), "require");
  assert.equal(result.searchParams.get("uselibpqcompat"), "true");
});

test("preserves explicit Supabase pooler connection options", () => {
  const result = new URL(
    messengerDatabaseConnectionString(
      "postgresql://user:secret@aws-0.pooler.supabase.com:5432/postgres?sslmode=verify-full&uselibpqcompat=false",
    ),
  );

  assert.equal(result.port, "5432");
  assert.equal(result.searchParams.get("sslmode"), "verify-full");
  assert.equal(result.searchParams.get("uselibpqcompat"), "false");
});

test("accepts Supabase direct PostgreSQL hosts without rewriting their port", () => {
  const result = new URL(
    messengerDatabaseConnectionString(
      "postgresql://user:secret@db.example.supabase.co:5432/postgres",
    ),
  );

  assert.equal(result.hostname, "db.example.supabase.co");
  assert.equal(result.port, "5432");
  assert.equal(result.searchParams.has("sslmode"), false);
});

test("rejects non-Supabase targets and invalid protocols without echoing values", () => {
  for (const value of [
    "postgresql://user:secret@other.example.com/db",
    "https://user:secret@db.example.supabase.co/db",
    "not a URL",
  ]) {
    assert.throws(
      () => messengerDatabaseConnectionString(value),
      (error) => {
        assert.doesNotMatch(error.message, /secret|other\.example\.com|not a URL/i);
        return true;
      },
    );
  }
});
