require("dotenv").config();
const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "chamaflow.db");
const db = new Database(DB_PATH);

console.log("DB:", DB_PATH);

const months = db.prepare(
  "SELECT month, COUNT(*) as c FROM contributions GROUP BY month ORDER BY month"
).all();
console.log("\nContributions by month:");
months.forEach(r => console.log(`  ${r.month}: ${r.c} records`));

const total = db.prepare("SELECT COUNT(*) as c FROM contributions").get();
console.log(`\nTotal contributions: ${total.c}`);

const recent = db.prepare(
  "SELECT id, month, amount, status, created_at FROM contributions ORDER BY id DESC LIMIT 10"
).all();
console.log("\nLast 10 contributions:");
recent.forEach(r => console.log(`  #${r.id} ${r.month} KES${r.amount} [${r.status}] @ ${r.created_at}`));

const auditRecent = db.prepare(
  "SELECT id, action, target, details, created_at FROM audit_log ORDER BY id DESC LIMIT 20"
).all();
console.log("\nLast 20 audit entries:");
auditRecent.forEach(r => console.log(`  #${r.id} [${r.created_at}] ${r.action} ${r.target||''} ${r.details||''}`));

const seqRow = db.prepare("SELECT seq FROM sqlite_sequence WHERE name='contributions'").get();
console.log(`\ncontributions auto-increment seq: ${seqRow ? seqRow.seq : "N/A"}`);

db.close();
