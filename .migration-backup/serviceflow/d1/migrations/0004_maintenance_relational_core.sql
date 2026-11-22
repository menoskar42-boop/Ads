CREATE TABLE IF NOT EXISTS maintenance_exchanges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS maintenance_cabinets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exchange_id INTEGER NOT NULL REFERENCES maintenance_exchanges(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  UNIQUE (exchange_id, number)
);

CREATE TABLE IF NOT EXISTS maintenance_boxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cabinet_id INTEGER NOT NULL REFERENCES maintenance_cabinets(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_inspection'
    CHECK (status IN ('pending_inspection','inspected','needs_maintenance','in_progress','pending_approval','completed')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  latitude REAL,
  longitude REAL,
  UNIQUE (cabinet_id, number)
);

CREATE TABLE IF NOT EXISTS maintenance_inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  box_id INTEGER NOT NULL REFERENCES maintenance_boxes(id),
  inspector_id INTEGER NOT NULL,
  date TEXT DEFAULT CURRENT_DATE,
  general_notes TEXT DEFAULT '',
  is_archived INTEGER DEFAULT 0,
  latitude REAL,
  longitude REAL,
  opened_by_name TEXT,
  origin TEXT,
  origin_ref TEXT,
  auto_created INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS maintenance_inspection_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id INTEGER NOT NULL REFERENCES maintenance_inspections(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('good_bad','yes_no')),
  value TEXT NOT NULL,
  notes TEXT DEFAULT '',
  extra_type TEXT,
  extra_distance REAL,
  UNIQUE (inspection_id, item_key)
);

CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id INTEGER NOT NULL REFERENCES maintenance_inspections(id),
  technician_id INTEGER,
  notes TEXT DEFAULT '',
  started_at TEXT,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','pending_approval','completed')),
  rejection_reason TEXT,
  prelim_confirmed_at TEXT,
  prelim_confirmed_by INTEGER
);

CREATE TABLE IF NOT EXISTS maintenance_item_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES maintenance_tasks(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  is_done INTEGER DEFAULT 0,
  done_at TEXT,
  done_by INTEGER,
  UNIQUE (task_id, item_key)
);

CREATE TABLE IF NOT EXISTS maintenance_box_line_numbers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id INTEGER NOT NULL REFERENCES maintenance_inspections(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  notes TEXT DEFAULT '',
  source TEXT NOT NULL DEFAULT 'service_flow',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS maintenance_boxes_cabinet_idx ON maintenance_boxes(cabinet_id);
CREATE INDEX IF NOT EXISTS maintenance_inspections_box_idx ON maintenance_inspections(box_id);
CREATE INDEX IF NOT EXISTS maintenance_tasks_inspection_idx ON maintenance_tasks(inspection_id);
CREATE INDEX IF NOT EXISTS maintenance_box_line_numbers_insp_idx ON maintenance_box_line_numbers(inspection_id);
