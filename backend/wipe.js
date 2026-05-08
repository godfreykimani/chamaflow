/**
 * ChamaFlow Data Wipe
 * Clears all contributions, meetings (+ attendance/decisions/endorsements).
 * Members are preserved.
 * Blocked in production unless --confirm flag is passed.
 */

require("dotenv").config();
const Database = require("better-sqlite3");
const path = require("path");

if (!process.argv.includes("--confirm")) {
  console.error("❌  Pass --confirm to wipe data: node wipe.js --confirm");
  process.exit(1);
}

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "chamaflow.db");
const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");

console.log("DB:", DB_PATH);

const members = db.prepare("SELECT COUNT(*) as c FROM members").get().c;
console.log(`Members (will be kept): ${members}`);

db.exec(`
  DELETE FROM meeting_endorsements;
  DELETE FROM meeting_decisions;
  DELETE FROM meeting_attendance;
  DELETE FROM meetings;
  DELETE FROM contributions;
  DELETE FROM audit_log;
  UPDATE sqlite_sequence SET seq = 0 WHERE name IN ('contributions','meetings','meeting_attendance','meeting_decisions','meeting_endorsements','audit_log');
`);

console.log("✅  All contributions, meetings, and audit log cleared.");
console.log(`    Members preserved: ${db.prepare("SELECT COUNT(*) as c FROM members").get().c}`);
db.close();
