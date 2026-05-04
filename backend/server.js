/**
 * ChamaFlow API Server
 * Express + better-sqlite3 + JWT auth
 */

require("dotenv").config();

const express   = require("express");
const Database  = require("better-sqlite3");
const bcrypt    = require("bcryptjs");
const jwt       = require("jsonwebtoken");
const cors      = require("cors");
const multer    = require("multer");
const path      = require("path");
const fs        = require("fs");
const { v4: uuidv4 } = require("uuid");

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT       = process.env.PORT       || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "chamaflow-dev-secret-change-in-production";
const JWT_EXPIRY = process.env.JWT_EXPIRY || "7d";
const DB_PATH    = process.env.DB_PATH    || path.join(__dirname, "chamaflow.db");
const UPLOADS    = path.join(__dirname, "uploads");

if (JWT_SECRET === "chamaflow-dev-secret-change-in-production" && process.env.NODE_ENV === "production") {
  console.error("❌  Set a real JWT_SECRET in .env for production!"); process.exit(1);
}
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

// ─── App ──────────────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || "*", methods: ["GET","POST","PUT","DELETE","PATCH"], allowedHeaders: ["Content-Type","Authorization"] }));
app.use(express.json());
app.use("/uploads", express.static(UPLOADS));

// ─── Database ─────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS members (
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
  CREATE TABLE IF NOT EXISTS contributions (
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
  CREATE TABLE IF NOT EXISTS meetings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    date            TEXT NOT NULL,
    location        TEXT NOT NULL,
    agenda          TEXT,
    status          TEXT NOT NULL DEFAULT 'Pending Approval',
    minutes_text    TEXT,
    total_collected REAL NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS meeting_attendance (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    member_id  INTEGER NOT NULL REFERENCES members(id),
    status     TEXT    NOT NULL DEFAULT 'present'
  );
  CREATE TABLE IF NOT EXISTS meeting_decisions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id  INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    decision    TEXT    NOT NULL,
    proposed_by INTEGER REFERENCES members(id),
    seconded_by INTEGER REFERENCES members(id)
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id   INTEGER REFERENCES members(id),
    action     TEXT    NOT NULL,
    target     TEXT,
    details    TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_contrib_member ON contributions(member_id);
  CREATE INDEX IF NOT EXISTS idx_contrib_type   ON contributions(type);
  CREATE INDEX IF NOT EXISTS idx_contrib_status ON contributions(status);
  CREATE INDEX IF NOT EXISTS idx_attend_meeting ON meeting_attendance(meeting_id);
  CREATE INDEX IF NOT EXISTS idx_members_phone  ON members(phone);
`);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ok       = (res, data, status=200) => res.status(status).json({ ok:true, data });
const fail     = (res, msg, status=400)  => res.status(status).json({ ok:false, error:msg });
const notFound = (res, what)             => fail(res, `${what} not found`, 404);
const audit    = (actorId, action, target=null, details=null) => {
  try { db.prepare("INSERT INTO audit_log (actor_id,action,target,details) VALUES (?,?,?,?)").run(actorId, action, target, details ? JSON.stringify(details) : null); } catch {}
};

// ─── Auth Middleware ──────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return fail(res, "Authentication required", 401);
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    const m  = db.prepare("SELECT id,active FROM members WHERE id=?").get(req.user.id);
    if (!m || !m.active) return fail(res, "Account not found or deactivated", 401);
    next();
  } catch (e) {
    return fail(res, e.name === "TokenExpiredError" ? "Session expired — please log in again" : "Invalid token", 401);
  }
}

function requireAdmin(req, res, next) {
  if (!["Chairman","Secretary"].includes(req.user.role)) return fail(res, "Admin access required", 403);
  next();
}

// ─── AUTH ROUTES (public) ─────────────────────────────────────────────────────

// POST /api/auth/login  { phone, pin } → { token, member, must_change_pin }
app.post("/api/auth/login", async (req, res) => {
  const { phone, pin } = req.body;
  if (!phone || !pin) return fail(res, "Phone and PIN are required");
  const cleanPhone = String(phone).replace(/[\s\-]/g, "");
  const member = db.prepare("SELECT * FROM members WHERE phone=?").get(cleanPhone);
  if (!member)         return fail(res, "Phone number not registered", 404);
  if (!member.active)  return fail(res, "Account deactivated — contact the Chairman", 403);
  if (!member.pin_hash)return fail(res, "PIN not set — contact the Secretary", 403);
  const valid = await bcrypt.compare(String(pin), member.pin_hash);
  if (!valid) return fail(res, "Incorrect PIN", 401);
  const token = jwt.sign({ id:member.id, name:member.name, role:member.role, phone:member.phone }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
  audit(member.id, "LOGIN");
  const { pin_hash: _, ...safe } = member;
  ok(res, { token, member: safe, must_change_pin: !!member.must_change_pin });
});

// POST /api/auth/change-pin  { current_pin, new_pin }  [auth required]
app.post("/api/auth/change-pin", requireAuth, async (req, res) => {
  const { current_pin, new_pin } = req.body;
  if (!current_pin || !new_pin) return fail(res, "current_pin and new_pin are required");
  if (!/^\d{4}$/.test(String(new_pin))) return fail(res, "PIN must be exactly 4 digits");
  const member = db.prepare("SELECT * FROM members WHERE id=?").get(req.user.id);
  if (!await bcrypt.compare(String(current_pin), member.pin_hash)) return fail(res, "Current PIN is incorrect", 401);
  db.prepare("UPDATE members SET pin_hash=?, must_change_pin=0 WHERE id=?").run(await bcrypt.hash(String(new_pin), 10), req.user.id);
  audit(req.user.id, "CHANGE_PIN");
  ok(res, { message: "PIN updated successfully" });
});

// POST /api/auth/reset-pin  { member_id }  [admin only]
app.post("/api/auth/reset-pin", requireAuth, requireAdmin, async (req, res) => {
  const { member_id } = req.body;
  if (!member_id) return fail(res, "member_id required");
  const target = db.prepare("SELECT * FROM members WHERE id=?").get(member_id);
  if (!target) return notFound(res, "Member");
  db.prepare("UPDATE members SET pin_hash=?, must_change_pin=1 WHERE id=?").run(await bcrypt.hash("1234", 10), member_id);
  audit(req.user.id, "RESET_PIN", `member:${member_id}`, { name: target.name });
  ok(res, { message: `PIN reset for ${target.name}. Default PIN is 1234.` });
});

// GET /api/auth/me  [auth required]
app.get("/api/auth/me", requireAuth, (req, res) => {
  const m = db.prepare("SELECT id,name,shares,role,active,phone,email,must_change_pin,created_at FROM members WHERE id=?").get(req.user.id);
  if (!m) return notFound(res, "Member");
  const savings = db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM contributions WHERE member_id=? AND type='Contribution' AND status='Confirmed'").get(req.user.id);
  ok(res, { ...m, total_savings: savings.t });
});

// Health (public)
app.get("/api/health", (_, res) => ok(res, { status:"ok", env: process.env.NODE_ENV||"development" }));

// ─── All routes below require auth ───────────────────────────────────────────
app.use("/api", requireAuth);

// ─── MEMBERS ─────────────────────────────────────────────────────────────────

app.get("/api/members", (req, res) => {
  const { active } = req.query;
  let sql="SELECT id,name,shares,role,active,phone,email,must_change_pin,created_at FROM members", args=[];
  if (active!==undefined) { sql+=" WHERE active=?"; args.push(active==="true"||active==="1"?1:0); }
  ok(res, db.prepare(sql+" ORDER BY name").all(...args));
});

app.get("/api/members/:id", (req, res) => {
  const m = db.prepare("SELECT id,name,shares,role,active,phone,email,created_at FROM members WHERE id=?").get(req.params.id);
  if (!m) return notFound(res, "Member");
  const s = db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM contributions WHERE member_id=? AND type='Contribution' AND status='Confirmed'").get(req.params.id);
  ok(res, { ...m, total_savings: s.t });
});

app.post("/api/members", requireAdmin, async (req, res) => {
  const { name, shares=1, role="Member", phone, email="", pin="1234" } = req.body;
  if (!name||!phone) return fail(res, "name and phone required");
  const cleanPhone = String(phone).replace(/[\s\-]/g,"");
  if (db.prepare("SELECT id FROM members WHERE phone=?").get(cleanPhone)) return fail(res, "Phone already registered");
  const r = db.prepare("INSERT INTO members (name,shares,role,phone,email,pin_hash,must_change_pin) VALUES (?,?,?,?,?,?,1)")
    .run(name, shares, role, cleanPhone, email, await bcrypt.hash(String(pin), 10));
  audit(req.user.id, "ADD_MEMBER", `member:${r.lastInsertRowid}`, { name, phone: cleanPhone });
  ok(res, db.prepare("SELECT id,name,shares,role,active,phone,email,must_change_pin,created_at FROM members WHERE id=?").get(r.lastInsertRowid), 201);
});

app.put("/api/members/:id", requireAdmin, (req, res) => {
  if (!db.prepare("SELECT id FROM members WHERE id=?").get(req.params.id)) return notFound(res,"Member");
  const { name, shares, role, phone, email, active } = req.body;
  db.prepare(`UPDATE members SET name=COALESCE(?,name),shares=COALESCE(?,shares),role=COALESCE(?,role),phone=COALESCE(?,phone),email=COALESCE(?,email),active=COALESCE(?,active) WHERE id=?`)
    .run(name, shares, role, phone?String(phone).replace(/[\s\-]/g,""):null, email, active!==undefined?(active?1:0):null, req.params.id);
  audit(req.user.id, "UPDATE_MEMBER", `member:${req.params.id}`);
  ok(res, db.prepare("SELECT id,name,shares,role,active,phone,email,created_at FROM members WHERE id=?").get(req.params.id));
});

app.delete("/api/members/:id", requireAdmin, (req, res) => {
  if (parseInt(req.params.id)===req.user.id) return fail(res,"Cannot deactivate your own account");
  const m = db.prepare("SELECT * FROM members WHERE id=?").get(req.params.id);
  if (!m) return notFound(res,"Member");
  db.prepare("UPDATE members SET active=0 WHERE id=?").run(req.params.id);
  audit(req.user.id,"DEACTIVATE_MEMBER",`member:${req.params.id}`,{name:m.name});
  ok(res,{message:"Member deactivated"});
});

// ─── CONTRIBUTIONS ────────────────────────────────────────────────────────────

app.get("/api/contributions", (req, res) => {
  const { memberId, type, year, month, status } = req.query;
  const effectiveId = req.user.role==="Member" ? req.user.id : memberId;
  let sql=`SELECT c.*,m.name AS member_name,r.name AS recorded_by_name FROM contributions c JOIN members m ON c.member_id=m.id LEFT JOIN members r ON c.recorded_by=r.id WHERE 1=1`, args=[];
  if (effectiveId) { sql+=" AND c.member_id=?"; args.push(effectiveId); }
  if (type)        { sql+=" AND c.type=?";      args.push(type); }
  if (year)        { sql+=" AND c.month LIKE ?"; args.push(`%${year}%`); }
  if (month)       { sql+=" AND c.month=?";     args.push(month); }
  if (status)      { sql+=" AND c.status=?";    args.push(status); }
  ok(res, db.prepare(sql+" ORDER BY c.created_at DESC").all(...args));
});

app.get("/api/contributions/:id", (req, res) => {
  const row = db.prepare("SELECT c.*,m.name AS member_name FROM contributions c JOIN members m ON c.member_id=m.id WHERE c.id=?").get(req.params.id);
  if (!row) return notFound(res,"Contribution");
  if (req.user.role==="Member"&&row.member_id!==req.user.id) return fail(res,"Access denied",403);
  ok(res,row);
});

app.post("/api/contributions", requireAdmin, (req, res) => {
  const {member_id,type="Contribution",month,amount,method="M-Pesa",ref="",status="Pending",notes=""} = req.body;
  if (!member_id||!month||!amount) return fail(res,"member_id, month, amount required");
  const MIN={Contribution:5000,Fine:500,Lateness:200};
  if (amount<(MIN[type]??0)) return fail(res,`Minimum for ${type} is KES ${MIN[type]}`);
  const r = db.prepare("INSERT INTO contributions (member_id,type,month,amount,method,ref,status,notes,recorded_by) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(member_id,type,month,amount,method,ref,status,notes,req.user.id);
  audit(req.user.id,"RECORD_CONTRIBUTION",`contribution:${r.lastInsertRowid}`,{member_id,type,month,amount,status});
  ok(res, db.prepare("SELECT * FROM contributions WHERE id=?").get(r.lastInsertRowid), 201);
});

app.put("/api/contributions/:id", requireAdmin, (req, res) => {
  if (!db.prepare("SELECT id FROM contributions WHERE id=?").get(req.params.id)) return notFound(res,"Contribution");
  const {status,ref,method,amount,proof_url,notes} = req.body;
  db.prepare("UPDATE contributions SET status=COALESCE(?,status),ref=COALESCE(?,ref),method=COALESCE(?,method),amount=COALESCE(?,amount),proof_url=COALESCE(?,proof_url),notes=COALESCE(?,notes) WHERE id=?")
    .run(status,ref,method,amount,proof_url,notes,req.params.id);
  audit(req.user.id,"UPDATE_CONTRIBUTION",`contribution:${req.params.id}`,{status});
  ok(res, db.prepare("SELECT * FROM contributions WHERE id=?").get(req.params.id));
});

app.delete("/api/contributions/:id", requireAdmin, (req, res) => {
  if (!db.prepare("SELECT id FROM contributions WHERE id=?").get(req.params.id)) return notFound(res,"Contribution");
  db.prepare("DELETE FROM contributions WHERE id=?").run(req.params.id);
  audit(req.user.id,"DELETE_CONTRIBUTION",`contribution:${req.params.id}`);
  ok(res,{message:"Deleted"});
});

const storage = multer.diskStorage({ destination:(_,__,cb)=>cb(null,UPLOADS), filename:(_,f,cb)=>cb(null,`${uuidv4()}${path.extname(f.originalname)}`) });
const upload  = multer({ storage, limits:{fileSize:5*1024*1024} });

app.post("/api/contributions/:id/upload", requireAdmin, upload.single("proof"), (req, res) => {
  if (!db.prepare("SELECT id FROM contributions WHERE id=?").get(req.params.id)) return notFound(res,"Contribution");
  if (!req.file) return fail(res,"No file uploaded");
  const proof_url=`/uploads/${req.file.filename}`;
  db.prepare("UPDATE contributions SET proof_url=? WHERE id=?").run(proof_url,req.params.id);
  ok(res,{proof_url});
});

// ─── MEETINGS ─────────────────────────────────────────────────────────────────

app.get("/api/meetings", (req, res) => {
  ok(res, db.prepare("SELECT * FROM meetings ORDER BY date DESC").all().map(m => ({
    ...m,
    attendance_count: db.prepare("SELECT COUNT(*) as c FROM meeting_attendance WHERE meeting_id=? AND status='present'").get(m.id).c,
    decisions: db.prepare("SELECT * FROM meeting_decisions WHERE meeting_id=?").all(m.id),
  })));
});

app.get("/api/meetings/:id", (req, res) => {
  const m = db.prepare("SELECT * FROM meetings WHERE id=?").get(req.params.id);
  if (!m) return notFound(res,"Meeting");
  ok(res,{
    ...m,
    attendance: db.prepare("SELECT ma.status,me.id,me.name,me.role FROM meeting_attendance ma JOIN members me ON ma.member_id=me.id WHERE ma.meeting_id=? ORDER BY me.name").all(req.params.id),
    decisions:  db.prepare("SELECT md.*,p.name AS proposed_by_name,s.name AS seconded_by_name FROM meeting_decisions md LEFT JOIN members p ON md.proposed_by=p.id LEFT JOIN members s ON md.seconded_by=s.id WHERE md.meeting_id=?").all(req.params.id),
  });
});

app.post("/api/meetings", requireAdmin, (req, res) => {
  const {date,location,agenda=""} = req.body;
  if (!date||!location) return fail(res,"date and location required");
  const r = db.prepare("INSERT INTO meetings (date,location,agenda) VALUES (?,?,?)").run(date,location,agenda);
  audit(req.user.id,"CREATE_MEETING",`meeting:${r.lastInsertRowid}`,{date,location});
  ok(res, db.prepare("SELECT * FROM meetings WHERE id=?").get(r.lastInsertRowid), 201);
});

app.put("/api/meetings/:id", requireAdmin, (req, res) => {
  if (!db.prepare("SELECT id FROM meetings WHERE id=?").get(req.params.id)) return notFound(res,"Meeting");
  const {date,location,agenda,status,minutes_text,total_collected} = req.body;
  db.prepare("UPDATE meetings SET date=COALESCE(?,date),location=COALESCE(?,location),agenda=COALESCE(?,agenda),status=COALESCE(?,status),minutes_text=COALESCE(?,minutes_text),total_collected=COALESCE(?,total_collected) WHERE id=?")
    .run(date,location,agenda,status,minutes_text,total_collected,req.params.id);
  audit(req.user.id,"UPDATE_MEETING",`meeting:${req.params.id}`,{status});
  ok(res, db.prepare("SELECT * FROM meetings WHERE id=?").get(req.params.id));
});

app.post("/api/meetings/:id/attendance", requireAdmin, (req, res) => {
  const {member_id,status="present"} = req.body;
  if (!member_id) return fail(res,"member_id required");
  const ex = db.prepare("SELECT id FROM meeting_attendance WHERE meeting_id=? AND member_id=?").get(req.params.id,member_id);
  ex ? db.prepare("UPDATE meeting_attendance SET status=? WHERE id=?").run(status,ex.id)
     : db.prepare("INSERT INTO meeting_attendance (meeting_id,member_id,status) VALUES (?,?,?)").run(req.params.id,member_id,status);
  ok(res,{message:"Attendance recorded"});
});

app.post("/api/meetings/:id/decisions", requireAdmin, (req, res) => {
  const {decision,proposed_by,seconded_by} = req.body;
  if (!decision) return fail(res,"decision text required");
  const r = db.prepare("INSERT INTO meeting_decisions (meeting_id,decision,proposed_by,seconded_by) VALUES (?,?,?,?)").run(req.params.id,decision,proposed_by||null,seconded_by||null);
  audit(req.user.id,"ADD_DECISION",`meeting:${req.params.id}`,{decision});
  ok(res, db.prepare("SELECT * FROM meeting_decisions WHERE id=?").get(r.lastInsertRowid), 201);
});

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

app.get("/api/dashboard/:memberId", (req, res) => {
  if (req.user.role==="Member"&&parseInt(req.params.memberId)!==req.user.id) return fail(res,"Access denied",403);
  const m = db.prepare("SELECT id,name,shares,role,active,phone,email FROM members WHERE id=?").get(req.params.memberId);
  if (!m) return notFound(res,"Member");
  const now=new Date(), currentMonth=now.toLocaleString("en-GB",{month:"long"})+" "+now.getFullYear();
  ok(res,{
    member: m,
    total_savings:       db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM contributions WHERE member_id=? AND type='Contribution' AND status='Confirmed'").get(req.params.memberId).t,
    monthly_expected:    m.shares*5000,
    monthly_paid:        db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM contributions WHERE member_id=? AND month=? AND type='Contribution' AND status='Confirmed'").get(req.params.memberId,currentMonth).t,
    contribution_status: db.prepare("SELECT COALESCE(SUM(amount),0) as t FROM contributions WHERE member_id=? AND month=? AND type='Contribution' AND status='Confirmed'").get(req.params.memberId,currentMonth).t >= m.shares*5000 ? "Paid" : "Pending",
    recent_contributions: db.prepare("SELECT * FROM contributions WHERE member_id=? ORDER BY created_at DESC LIMIT 5").all(req.params.memberId),
  });
});

// ─── SUMMARY ─────────────────────────────────────────────────────────────────

app.get("/api/summary", (req, res) => {
  const {month} = req.query;
  if (!month) return fail(res,"month query param required");
  const rows = db.prepare(`SELECT m.id,m.name,m.shares,(m.shares*5000) AS expected,COALESCE(SUM(CASE WHEN c.type='Contribution' AND c.status='Confirmed' THEN c.amount ELSE 0 END),0) AS paid_contrib,COALESCE(SUM(CASE WHEN c.type='Fine' AND c.status='Confirmed' THEN c.amount ELSE 0 END),0) AS paid_fines,COALESCE(SUM(CASE WHEN c.type='Lateness' AND c.status='Confirmed' THEN c.amount ELSE 0 END),0) AS paid_lateness FROM members m LEFT JOIN contributions c ON c.member_id=m.id AND c.month=? WHERE m.active=1 GROUP BY m.id ORDER BY m.name`).all(month);
  ok(res,{month,rows,totalExpected:rows.reduce((s,r)=>s+r.expected,0),totalPaid:rows.reduce((s,r)=>s+r.paid_contrib,0),totalFines:rows.reduce((s,r)=>s+r.paid_fines,0),totalLateness:rows.reduce((s,r)=>s+r.paid_lateness,0)});
});

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────

app.get("/api/audit", requireAdmin, (req, res) => {
  if (req.user.role!=="Chairman") return fail(res,"Chairman only",403);
  ok(res, db.prepare("SELECT al.*,m.name AS actor_name FROM audit_log al LEFT JOIN members m ON al.actor_id=m.id ORDER BY al.created_at DESC LIMIT 200").all());
});

// ─── 404 ──────────────────────────────────────────────────────────────────────

app.use((req, res) => fail(res,`${req.method} ${req.path} not found`,404));

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀  ChamaFlow API  →  http://localhost:${PORT}/api`);
  console.log(`🔐  JWT auth enabled  (expiry: ${JWT_EXPIRY})`);
  console.log(`📦  Database: ${DB_PATH}\n`);
});

module.exports = { app, db };
