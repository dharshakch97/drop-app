const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const Database = require('better-sqlite3');

const dbPath = path.join(app.getPath('userData'), 'drop-app.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'snippet',
    title TEXT,
    content TEXT,
    tags TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
    title, content, tags, content='entries', content_rowid='rowid'
  );

  CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
    INSERT INTO entries_fts(rowid, title, content, tags)
    VALUES (new.rowid, new.title, new.content, new.tags);
  END;

  CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
    INSERT INTO entries_fts(entries_fts, rowid, title, content, tags)
    VALUES ('delete', old.rowid, old.title, old.content, old.tags);
  END;

  CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
    INSERT INTO entries_fts(entries_fts, rowid, title, content, tags)
    VALUES ('delete', old.rowid, old.title, old.content, old.tags);
    INSERT INTO entries_fts(rowid, title, content, tags)
    VALUES (new.rowid, new.title, new.content, new.tags);
  END;
`);

function createEntry({ type = 'snippet', title = '', content, tags = '' }) {
    const id = crypto.randomUUID();
    const now = Date.now();
    db.prepare(`
    INSERT INTO entries (id, type, title, content, tags, pinned, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  `).run(id, type, title, content, tags, now, now);
    return getEntry(id);
}

function getEntry(id) {
    return db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
}

function listEntries({ search = '' } = {}) {
    if (search.trim()) {
        return db.prepare(`
      SELECT entries.* FROM entries_fts
      JOIN entries ON entries.rowid = entries_fts.rowid
      WHERE entries_fts MATCH ?
      ORDER BY entries.pinned DESC, entries.created_at DESC
    `).all(search.trim() + '*');
    }
    return db.prepare(`
    SELECT * FROM entries ORDER BY pinned DESC, created_at DESC
  `).all();
}

function togglePin(id) {
    const entry = getEntry(id);
    if (!entry) return null;
    db.prepare('UPDATE entries SET pinned = ?, updated_at = ? WHERE id = ?')
        .run(entry.pinned ? 0 : 1, Date.now(), id);
    return getEntry(id);
}

function deleteEntry(id) {
    db.prepare('DELETE FROM entries WHERE id = ?').run(id);
    return true;
}

module.exports = { createEntry, getEntry, listEntries, togglePin, deleteEntry };