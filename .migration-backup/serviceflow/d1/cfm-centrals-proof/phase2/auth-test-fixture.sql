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
