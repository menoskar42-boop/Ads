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

CREATE TABLE cables (
  id TEXT PRIMARY KEY NOT NULL,
  central_id TEXT NOT NULL REFERENCES centrals(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  cable_number TEXT,
  cabinet_number TEXT,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (central_id, number)
);

CREATE TABLE fault_types (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE work_types (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  associated_materials TEXT CHECK (associated_materials IS NULL OR json_valid(associated_materials)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE task_types (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE contractors (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE excavation_workers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  national_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO centrals (id, name, code, created_at) VALUES
  ('proof-central-1', 'مركز تجريبي أول', 'PROOF-001', '2026-10-18T08:00:00.000Z'),
  ('proof-central-2', 'مركز تجريبي ثانٍ', 'PROOF-002', '2026-10-18T08:01:00.000Z');
