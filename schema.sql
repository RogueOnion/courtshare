-- CourtShare D1 schema
-- Run: wrangler d1 execute courtshare --file schema.sql

CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- share_links: one row per shareable court invite
CREATE TABLE IF NOT EXISTS share_links (
  token       TEXT PRIMARY KEY,
  booking_ref TEXT NOT NULL,
  encoded_ref TEXT NOT NULL,
  club_id     INTEGER NOT NULL,
  court_name  TEXT,
  club_name   TEXT,
  date        TEXT NOT NULL,   -- YYYY-MM-DD
  start_time  TEXT NOT NULL,   -- HH:MM
  duration    INTEGER,
  sport_name  TEXT,
  max_players INTEGER DEFAULT 4,
  note        TEXT,            -- optional message from the owner
  created_at  TEXT DEFAULT (datetime('now')),
  expires_at  TEXT             -- datetime('YYYY-MM-DD HH:MM:SS')
);

-- join_log: who joined which court (contact IDs, names)
CREATE TABLE IF NOT EXISTS join_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  token             TEXT NOT NULL,
  joiner_name       TEXT,
  joiner_contact_id TEXT NOT NULL,
  joined_at         TEXT DEFAULT (datetime('now'))
);
