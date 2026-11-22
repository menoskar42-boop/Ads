CREATE TABLE IF NOT EXISTS wfm_customer_mobiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_number TEXT NOT NULL,
  mobile TEXT,
  alt_mobile TEXT,
  work_order_id TEXT,
  result TEXT NOT NULL CHECK (result IN ('done', 'no_mobile', 'not_found', 'failed')),
  message TEXT,
  requested_by TEXT,
  reported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS wfm_customer_mobiles_phone_reported_idx
  ON wfm_customer_mobiles(phone_number, reported_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS wfm_customer_mobiles_phone_result_reported_idx
  ON wfm_customer_mobiles(phone_number, result, reported_at DESC);
