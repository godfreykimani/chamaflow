/**
 * ChamaFlow Database Seeder
 * Adds pin_hash + must_change_pin to every member
 * Default PIN: 1234  (members must change on first login)
 */

require("dotenv").config();
const Database = require("better-sqlite3");
const bcrypt   = require("bcryptjs");
const path     = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "chamaflow.db");
const db      = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

console.log("🌱  Seeding ChamaFlow database…\n");

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  DROP TABLE IF EXISTS meeting_decisions;
  DROP TABLE IF EXISTS meeting_attendance;
  DROP TABLE IF EXISTS meetings;
  DROP TABLE IF EXISTS contributions;
  DROP TABLE IF EXISTS audit_log;
  DROP TABLE IF EXISTS members;

  CREATE TABLE members (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    shares          INTEGER NOT NULL DEFAULT 1,
    role            TEXT    NOT NULL DEFAULT 'Member',
    active          INTEGER NOT NULL DEFAULT 1,
    phone           TEXT    UNIQUE NOT NULL,
    email           TEXT,
    pin_hash        TEXT,
    must_change_pin INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE contributions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id   INTEGER NOT NULL REFERENCES members(id),
    type        TEXT    NOT NULL DEFAULT 'Contribution',
    month       TEXT    NOT NULL,
    amount      REAL    NOT NULL,
    method      TEXT    NOT NULL DEFAULT 'M-Pesa',
    ref         TEXT,
    status      TEXT    NOT NULL DEFAULT 'Pending',
    proof_url   TEXT,
    notes       TEXT,
    recorded_by INTEGER REFERENCES members(id),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE meetings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    date            TEXT NOT NULL,
    location        TEXT NOT NULL,
    agenda          TEXT,
    status          TEXT NOT NULL DEFAULT 'Pending Approval',
    minutes_text    TEXT,
    total_collected REAL NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE meeting_attendance (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    member_id  INTEGER NOT NULL REFERENCES members(id),
    status     TEXT    NOT NULL DEFAULT 'present'
  );
  CREATE TABLE meeting_decisions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id  INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    decision    TEXT    NOT NULL,
    proposed_by INTEGER REFERENCES members(id),
    seconded_by INTEGER REFERENCES members(id)
  );
  CREATE TABLE audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id   INTEGER REFERENCES members(id),
    action     TEXT    NOT NULL,
    target     TEXT,
    details    TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_contrib_member ON contributions(member_id);
  CREATE INDEX idx_contrib_type   ON contributions(type);
  CREATE INDEX idx_contrib_status ON contributions(status);
  CREATE INDEX idx_attend_meeting ON meeting_attendance(meeting_id);
  CREATE INDEX idx_members_phone  ON members(phone);
`);

// ─── Hash the default PIN ─────────────────────────────────────────────────────

const DEFAULT_PIN  = "1234";
const pinHash      = await (async () => bcrypt.hash(DEFAULT_PIN, 10))();

// ─── Members ─────────────────────────────────────────────────────────────────

// [name, shares, role, active, phone, email]
const MEMBERS = [
  ["Amara Ochieng",   1, "Chairman",  1, "0712345678", "amara@chamaflow.co.ke"],
  ["Beatrice Wanjiku",1, "Secretary", 1, "0723456789", "beatrice@chamaflow.co.ke"],
  ["Charles Kamau",   2, "Member",    1, "0734567890", "charles@email.com"],
  ["Diana Njeri",     1, "Member",    1, "0745678901", "diana@email.com"],
  ["Edwin Mwangi",    1, "Member",    1, "0756789012", "edwin@email.com"],
  ["Faith Akinyi",    1, "Member",    1, "0767890123", "faith@email.com"],
  ["George Otieno",   2, "Member",    1, "0778901234", "george@email.com"],
  ["Hannah Muthoni",  1, "Member",    1, "0789012345", "hannah@email.com"],
  ["Isaac Kimani",    1, "Member",    1, "0790123456", "isaac@email.com"],
  ["Jane Wairimu",    1, "Member",    1, "0701234567", "jane@email.com"],
  ["Kevin Omondi",    1, "Member",    1, "0712345679", "kevin@email.com"],
  ["Linda Chebet",    1, "Member",    1, "0723456780", "linda@email.com"],
  ["Michael Gitau",   2, "Member",    1, "0734567891", "michael@email.com"],
  ["Nancy Wangari",   1, "Member",    1, "0745678902", "nancy@email.com"],
  ["Oscar Mutua",     1, "Member",    1, "0756789013", "oscar@email.com"],
  ["Pamela Adhiambo", 1, "Member",    1, "0767890124", "pamela@email.com"],
  ["Quincy Njoroge",  1, "Member",    1, "0778901235", "quincy@email.com"],
  ["Rose Auma",       1, "Member",    1, "0789012346", "rose@email.com"],
  ["Samuel Koech",    2, "Member",    1, "0790123457", "samuel@email.com"],
  ["Tabitha Waweru",  1, "Member",    1, "0701234568", "tabitha@email.com"],
  ["Uchenna Obi",     1, "Member",    1, "0712345670", "uchenna@email.com"],
  ["Veronica Karimi", 1, "Member",    1, "0723456781", "veronica@email.com"],
  ["Walter Odhiambo", 1, "Member",    1, "0734567892", "walter@email.com"],
  ["Xenia Ndirangu",  1, "Member",    0, "0745678903", "xenia@email.com"],  // inactive
  ["Yusuf Hassan",    1, "Member",    1, "0756789014", "yusuf@email.com"],
  ["Zipporah Maina",  1, "Member",    1, "0767890125", "zipporah@email.com"],
];

const insertMember = db.prepare(
  "INSERT INTO members (name,shares,role,active,phone,email,pin_hash,must_change_pin) VALUES (?,?,?,?,?,?,?,1)"
);

const seedMembers = db.transaction(() => {
  for (const [name, shares, role, active, phone, email] of MEMBERS) {
    insertMember.run(name, shares, role, active, phone, email, pinHash);
  }
});
seedMembers();
console.log(`✅  ${MEMBERS.length} members inserted  (default PIN: ${DEFAULT_PIN})`);

// ─── Contributions ────────────────────────────────────────────────────────────

const insertContrib = db.prepare(
  "INSERT INTO contributions (member_id,type,month,amount,method,ref,status,recorded_by,created_at) VALUES (?,?,?,?,?,?,?,1,?)"
);

const mpRef  = (i) => `Q${String.fromCharCode(65+(i%26))}${String.fromCharCode(66+(i%26))}${100000+i}`;
const MONTHS = ["January 2025","February 2025","March 2025","April 2025","May 2025"];

const seedContributions = db.transaction(() => {
  let idx = 0;
  for (let mid = 1; mid <= MEMBERS.length; mid++) {
    const [, shares, , active] = MEMBERS[mid - 1];
    if (!active) continue;
    const amount = shares * 5000;
    MONTHS.forEach((month, mi) => {
      const confirmed = mi < 4 || mid % 4 === 0;
      const method    = mid % 3 === 0 ? "Bank Slip" : "M-Pesa";
      const ref       = method === "M-Pesa" ? mpRef(idx) : `BS-2025-${String(idx).padStart(3,"0")}`;
      const ts        = `2025-0${mi+1}-0${(mid%8)+1}T0${(mid%9)+8}:${String((mid*7)%60).padStart(2,"0")}:00`;
      insertContrib.run(mid, "Contribution", month, amount, method, ref, confirmed?"Confirmed":"Pending", ts);
      idx++;
    });
    // Sprinkle fines & lateness
    if (mid % 5 === 2) insertContrib.run(mid,"Fine","January 2025",500,"M-Pesa",mpRef(idx++),"Confirmed","2025-01-12T10:00:00");
    if (mid % 4 === 3) insertContrib.run(mid,"Lateness","February 2025",200,"M-Pesa",mpRef(idx++),"Confirmed","2025-02-08T09:15:00");
    if (mid % 7 === 0) insertContrib.run(mid,"Fine","March 2025",500,"M-Pesa",mpRef(idx++),"Confirmed","2025-03-08T11:30:00");
    if (mid % 6 === 1) insertContrib.run(mid,"Lateness","April 2025",200,"M-Pesa",mpRef(idx++),"Confirmed","2025-04-12T09:30:00");
    if (mid % 9 === 2) insertContrib.run(mid,"Fine","April 2025",500,"M-Pesa",mpRef(idx++),"Pending","2025-04-12T11:00:00");
  }
});
seedContributions();
console.log(`✅  ${db.prepare("SELECT COUNT(*) as c FROM contributions").get().c} contributions inserted`);

// ─── Meetings ─────────────────────────────────────────────────────────────────

const insertMeeting = db.prepare("INSERT INTO meetings (date,location,agenda,status,total_collected) VALUES (?,?,?,?,?)");

const MEETINGS_DATA = [
  ["February 8, 2025",  "Villa Rosa Kempinski",   "Annual planning & elections",       "Approved",         130000],
  ["March 8, 2025",     "Nairobi Serena Hotel",   "Investment proposals & welfare",    "Approved",         118000],
  ["April 12, 2025",    "Sarova Stanley, Nairobi","Q1 financial review",               "Approved",         126000],
  ["May 10, 2025",      "Panari Hotel, Nairobi",  "Monthly review & welfare",          "Approved",         122000],
  ["June 14, 2025",     "Panari Hotel, Nairobi",  "Mid-year review & investments",     "Pending Approval",       0],
];

const MEETING_IDS = [];
const seedMeetings = db.transaction(() => {
  for (const row of MEETINGS_DATA) MEETING_IDS.push(insertMeeting.run(...row).lastInsertRowid);
});
seedMeetings();
console.log(`✅  ${MEETING_IDS.length} meetings inserted`);

// ─── Attendance ───────────────────────────────────────────────────────────────

const insertAtt = db.prepare("INSERT INTO meeting_attendance (meeting_id,member_id,status) VALUES (?,?,?)");
const allActive = MEMBERS.map((_,i)=>i+1).filter(i=>MEMBERS[i-1][3]===1); // active member IDs

const seedAttendance = db.transaction(() => {
  // meeting 0 (Feb): all present
  for (const m of allActive) insertAtt.run(MEETING_IDS[0], m, "present");
  // meeting 1 (Mar): 17,11 absent with apology
  for (const m of allActive) insertAtt.run(MEETING_IDS[1], m, [17,11].includes(m)?"apology":"present");
  // meeting 2 (Apr): 19 absent without apology
  for (const m of allActive) insertAtt.run(MEETING_IDS[2], m, m===19?"absent":"present");
  // meeting 3 (May): 6 apology, 14 absent
  for (const m of allActive) insertAtt.run(MEETING_IDS[3], m, m===6?"apology":m===14?"absent":"present");
});
seedAttendance();

// ─── Decisions ────────────────────────────────────────────────────────────────

const insertDec = db.prepare("INSERT INTO meeting_decisions (meeting_id,decision,proposed_by,seconded_by) VALUES (?,?,?,?)");
const seedDecisions = db.transaction(() => {
  insertDec.run(MEETING_IDS[0],"Approved annual budget of KES 1,560,000 for 2025",1,2);
  insertDec.run(MEETING_IDS[0],"Elected Amara Ochieng as Chairman for 2025–2026",3,7);
  insertDec.run(MEETING_IDS[1],"Approved T-Bill investment of KES 500,000",3,7);
  insertDec.run(MEETING_IDS[1],"Welfare disbursement of KES 10,000 for Quincy Njoroge",2,4);
  insertDec.run(MEETING_IDS[2],"Q1 surplus of KES 24,000 rolled into investment pool",7,13);
  insertDec.run(MEETING_IDS[2],"Meeting venue policy: rotate quarterly between 3 hotels",2,1);
  insertDec.run(MEETING_IDS[3],"Recruit 2 new members by July 2025",3,19);
  insertDec.run(MEETING_IDS[3],"Monthly contribution reminder sent by 1st of each month",1,2);
});
seedDecisions();
console.log(`✅  Meeting attendance & decisions inserted`);

// ─── Summary ─────────────────────────────────────────────────────────────────

const totalPaid = db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM contributions WHERE status='Confirmed'").get().t;
console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Members:         ${db.prepare("SELECT COUNT(*) as c FROM members").get().c}
  Contributions:   ${db.prepare("SELECT COUNT(*) as c FROM contributions").get().c}
  Meetings:        ${db.prepare("SELECT COUNT(*) as c FROM meetings").get().c}
  Total confirmed: KES ${totalPaid.toLocaleString()}
  Default PIN:     ${DEFAULT_PIN}  (all members must change on first login)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅  Database ready. Run: node server.js
`);
db.close();
