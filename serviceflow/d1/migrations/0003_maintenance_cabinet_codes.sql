CREATE TABLE IF NOT EXISTS maintenance_cabinet_codes (
  id INTEGER PRIMARY KEY,
  exchange_name TEXT NOT NULL,
  cabinet_number TEXT NOT NULL,
  exchange_code TEXT,
  decent_life TEXT,
  area_technician TEXT,
  worker_code TEXT,
  cabinet_code TEXT,
  UNIQUE (exchange_name, cabinet_number)
);
