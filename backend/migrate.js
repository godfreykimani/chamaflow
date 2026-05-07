require("dotenv").config();
const Database = require("better-sqlite3");
const path     = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "chamaflow.db");
const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");

console.log("DB:", DB_PATH);

// Create missing tables
db.exec(`
  CREATE TABLE IF NOT EXISTS meeting_endorsements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    member_id  INTEGER NOT NULL REFERENCES members(id),
    type       TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(meeting_id, type),
    UNIQUE(meeting_id, member_id)
  )
`);
try { db.exec("CREATE INDEX IF NOT EXISTS idx_endorse_meeting ON meeting_endorsements(meeting_id)"); } catch {}

// Ensure transcript column exists
try { db.exec("ALTER TABLE meetings ADD COLUMN transcript TEXT"); } catch {}

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log("Tables:", tables.map(t => t.name).join(", "));
console.log("Members:", db.prepare("SELECT COUNT(*) as c FROM members").get().c);
db.close();
console.log("✅  Migration done");
