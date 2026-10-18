PRAGMA foreign_keys = ON;

CREATE TABLE cfm_users (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  avatar TEXT,
  is_initial_password INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  suspended INTEGER DEFAULT 0
);

CREATE TABLE centrals (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

INSERT INTO centrals (id, name, code, created_at) VALUES
  ('proof-central-1', 'مركز تجريبي أول', 'PROOF-001', '2026-10-18T08:00:00.000Z'),
  ('proof-central-2', 'مركز تجريبي ثانٍ', 'PROOF-002', '2026-10-18T08:01:00.000Z');
