/**
 * D1 database helpers.
 */

export async function getConfig(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare('SELECT value FROM config WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setConfig(db: D1Database, key: string, value: string): Promise<void> {
  await db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').bind(key, value).run();
}

export interface ShareLink {
  token: string;
  booking_ref: string;
  encoded_ref: string;
  club_id: number;
  court_name: string | null;
  club_name: string | null;
  date: string;
  start_time: string;
  duration: number | null;
  sport_name: string | null;
  max_players: number;
  note: string | null;
  created_at: string;
  expires_at: string | null;
}

export async function createShareLink(db: D1Database, link: Omit<ShareLink, 'created_at'>): Promise<void> {
  await db.prepare(`
    INSERT OR REPLACE INTO share_links
      (token, booking_ref, encoded_ref, club_id, court_name, club_name,
       date, start_time, duration, sport_name, max_players, note, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    link.token, link.booking_ref, link.encoded_ref, link.club_id,
    link.court_name, link.club_name, link.date, link.start_time,
    link.duration, link.sport_name, link.max_players, link.note, link.expires_at
  ).run();
}

export async function getShareLink(db: D1Database, token: string): Promise<ShareLink | null> {
  return db.prepare('SELECT * FROM share_links WHERE token = ?')
    .bind(token)
    .first<ShareLink>();
}

export async function listShareLinks(db: D1Database): Promise<ShareLink[]> {
  const result = await db.prepare(
    "SELECT * FROM share_links WHERE date >= date('now') ORDER BY date ASC, start_time ASC"
  ).all<ShareLink>();
  return result.results;
}

export async function deleteShareLink(db: D1Database, token: string): Promise<void> {
  await db.prepare('DELETE FROM share_links WHERE token = ?').bind(token).run();
}

export async function recordJoin(db: D1Database, token: string, name: string, contactId: string): Promise<void> {
  await db.prepare(
    'INSERT INTO join_log (token, joiner_name, joiner_contact_id) VALUES (?, ?, ?)'
  ).bind(token, name, contactId).run();
}

export async function getJoinCount(db: D1Database, token: string): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) as n FROM join_log WHERE token = ?')
    .bind(token).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function getJoiners(db: D1Database, token: string): Promise<Array<{ joiner_name: string; joiner_contact_id: string; joined_at: string }>> {
  const result = await db.prepare(
    'SELECT joiner_name, joiner_contact_id, joined_at FROM join_log WHERE token = ? ORDER BY joined_at ASC'
  ).bind(token).all<{ joiner_name: string; joiner_contact_id: string; joined_at: string }>();
  return result.results;
}

export async function alreadyJoined(db: D1Database, token: string, contactId: string): Promise<boolean> {
  const row = await db.prepare(
    'SELECT 1 FROM join_log WHERE token = ? AND joiner_contact_id = ?'
  ).bind(token, contactId).first();
  return !!row;
}
