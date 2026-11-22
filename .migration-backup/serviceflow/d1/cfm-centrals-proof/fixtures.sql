PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS centrals (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cables (
  id TEXT PRIMARY KEY NOT NULL,
  central_id TEXT NOT NULL REFERENCES centrals(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  cable_number TEXT,
  cabinet_number TEXT,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (central_id, number)
);

CREATE TABLE IF NOT EXISTS fault_types (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS work_types (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  associated_materials TEXT CHECK (associated_materials IS NULL OR json_valid(associated_materials)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_types (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contractors (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS excavation_workers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  national_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tech_coverage_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grantee_tech_name TEXT NOT NULL,
  covered_tech_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  UNIQUE (grantee_tech_name, covered_tech_name)
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY NOT NULL,
  ticket_number TEXT NOT NULL UNIQUE,
  central_department TEXT NOT NULL,
  central_id TEXT NOT NULL REFERENCES centrals(id),
  cable_id TEXT NOT NULL REFERENCES cables(id),
  cabinet TEXT NOT NULL,
  box TEXT NOT NULL,
  fault_type_id TEXT NOT NULL REFERENCES fault_types(id),
  notes TEXT,
  latitude REAL,
  longitude REAL,
  status TEXT NOT NULL DEFAULT 'open',
  final_repair_id TEXT,
  final_repair_description TEXT,
  final_repair_repaired_at TEXT,
  final_repair_repaired_by TEXT,
  closed_at TEXT,
  closed_by TEXT,
  created_by TEXT NOT NULL,
  opened_by_label TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ticket_number_idx ON tickets(ticket_number);
CREATE INDEX IF NOT EXISTS status_idx ON tickets(status);
CREATE TABLE IF NOT EXISTS ticket_box_claims (
  central_key TEXT NOT NULL,
  cabinet_key TEXT NOT NULL,
  box_key TEXT NOT NULL,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  PRIMARY KEY (central_key, cabinet_key, box_key)
);

CREATE TABLE IF NOT EXISTS measurement_entries (
  id TEXT PRIMARY KEY NOT NULL,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  reading TEXT NOT NULL,
  distance REAL,
  direction TEXT,
  notes TEXT,
  performed_by TEXT,
  created_by TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS work_entries (
  id TEXT PRIMARY KEY NOT NULL,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  measurement_id TEXT REFERENCES measurement_entries(id) ON DELETE CASCADE,
  items TEXT NOT NULL CHECK (json_valid(items)),
  notes TEXT,
  performed_by TEXT NOT NULL,
  works_by TEXT,
  contractor_id TEXT REFERENCES contractors(id),
  created_by TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS used_task_entries (
  id TEXT PRIMARY KEY NOT NULL,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  measurement_id TEXT REFERENCES measurement_entries(id) ON DELETE CASCADE,
  items TEXT NOT NULL CHECK (json_valid(items)),
  notes TEXT,
  performed_by TEXT NOT NULL,
  created_by TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  task_type_id TEXT NOT NULL REFERENCES task_types(id),
  quantity INTEGER NOT NULL,
  date TEXT NOT NULL,
  ticket_id TEXT REFERENCES tickets(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS box_fault_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  ref_key TEXT NOT NULL,
  central_name TEXT,
  cabin_number TEXT,
  box_number TEXT,
  tech_name TEXT,
  responded_at TEXT,
  ticket_id TEXT,
  ticket_number TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  repair_confirm TEXT,
  repair_confirm_by TEXT,
  repair_confirm_at TEXT,
  repair_confirm_note TEXT,
  reopened_ticket_number TEXT,
  reopened_by TEXT,
  reopened_at TEXT,
  UNIQUE (source, ref_key)
);
CREATE INDEX IF NOT EXISTS box_fault_tickets_ticket_idx ON box_fault_tickets(ticket_id);

INSERT INTO centrals (id, name, code, created_at) VALUES
  ('proof-central-1', 'مركز تجريبي أول', 'PROOF-001', '2026-10-18T08:00:00.000Z'),
  ('proof-central-2', 'مركز تجريبي ثانٍ', 'PROOF-002', '2026-10-18T08:01:00.000Z');
