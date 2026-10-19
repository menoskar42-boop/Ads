CREATE TABLE IF NOT EXISTS maintenance_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  box_id INTEGER NOT NULL REFERENCES maintenance_boxes(id) ON DELETE CASCADE,
  inspection_id INTEGER REFERENCES maintenance_inspections(id) ON DELETE CASCADE,
  photo_type TEXT NOT NULL CHECK (photo_type IN ('before', 'after')),
  filename TEXT NOT NULL,
  uploaded_by INTEGER,
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  taken_at TEXT,
  latitude REAL,
  longitude REAL,
  media_type TEXT NOT NULL DEFAULT 'photo' CHECK (media_type IN ('photo', 'video')),
  storage_key TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS maintenance_photos_filename_idx
  ON maintenance_photos(filename);
CREATE INDEX IF NOT EXISTS maintenance_photos_inspection_idx
  ON maintenance_photos(inspection_id, photo_type, uploaded_at);
CREATE INDEX IF NOT EXISTS maintenance_photos_box_idx
  ON maintenance_photos(box_id, photo_type, uploaded_at);
