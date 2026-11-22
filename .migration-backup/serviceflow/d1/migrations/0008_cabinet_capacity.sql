-- Local-proof schema for FCC cabinet capacities.
-- uploaded_by_id remains a PostgreSQL-owned user reference; no D1 user FK.
CREATE TABLE IF NOT EXISTS cabinet_capacity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  central_name TEXT,
  exch_code TEXT,
  exch_name TEXT,
  cabin_number TEXT,
  cabinet_type TEXT,
  primary_capacity INTEGER,
  secondary_capacity INTEGER,
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  uploaded_by_id INTEGER
);

CREATE INDEX IF NOT EXISTS cabinet_capacity_central_cabin_idx
  ON cabinet_capacity (central_name, cabin_number);
