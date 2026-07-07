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

// ─── In-memory rate limiter (no extra packages) ───────────────────────────────
// Keyed by IP+identifier; max 10 attempts per 15-minute window.
const _rl = new Map();
function rateLimitCheck(key, max = 10, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const entry = _rl.get(key);
  if (entry && now < entry.reset) {
    if (entry.count >= max) return false;
    entry.count++;
    return true;
  }
  _rl.set(key, { count: 1, reset: now + windowMs });
  return true;
}
function rateLimitReset(key) { _rl.delete(key); }
// Prune stale entries every 30 minutes to avoid memory growth
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _rl) if (now >= v.reset) _rl.delete(k);
}, 30 * 60 * 1000);

// ─── App ──────────────────────────────────────────────────────────────────────

const app = express();
// H1: never fall back to wildcard — always restrict to known origins
const ALLOWED_ORIGINS = [
  "https://chamaflow-six.vercel.app",
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ...(process.env.NODE_ENV !== "production" ? ["http://localhost:5173", "http://localhost:4173"] : []),
];
app.use(cors({ origin: (origin, cb) => (!origin || ALLOWED_ORIGINS.includes(origin)) ? cb(null, true) : cb(new Error("Not allowed by CORS")), methods: ["GET","POST","PUT","DELETE","PATCH"], allowedHeaders: ["Content-Type","Authorization"] }));
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
    transcript      TEXT,
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

// Add transcript column if meetings table was created before this feature
try { db.exec("ALTER TABLE meetings ADD COLUMN transcript TEXT"); } catch {}
try { db.exec("ALTER TABLE meetings ADD COLUMN ai_summary TEXT"); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS meeting_endorsements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    member_id  INTEGER NOT NULL REFERENCES members(id),
    type       TEXT    NOT NULL CHECK(type IN ('propose','second')),
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(meeting_id, type),
    UNIQUE(meeting_id, member_id)
  );
  CREATE INDEX IF NOT EXISTS idx_endorse_meeting ON meeting_endorsements(meeting_id);
`);

// ─── Member phone/role migrations ────────────────────────────────────────────
{
  const phoneUpdates = [
    { name: "Cate Theuri",     phone: "+254722828313", role: "Member"    },
    { name: "David Munene",    phone: "+254722261215", role: "Member"    },
    { name: "Eliud Maina",     phone: "+254724787052", role: "Member"    },
    { name: "Evelyn Kagwiria", phone: "+254723683005", role: "Member"    },
    { name: "Felista Wandugi", phone: "+254703322333", role: "Member"    },
    { name: "Gladys Muigai",   phone: "0700000006",   role: "Member"    },
    { name: "Godfrey Kimani",  phone: "+254715797246", role: "Chairman"  },
    { name: "Hannah Njoki",    phone: "+254722878159", role: "Member"    },
    { name: "Jessie Nyaga",    phone: "+254722864778", role: "Member"    },
    { name: "John Mwaura",     phone: "+254722839581", role: "Member"    },
    { name: "Kellen Wanderi",  phone: "0700000011",   role: "Member"    },
    { name: "Leah Wangui",     phone: "+254722546049", role: "Member"    },
    { name: "Lydia Kibe",      phone: "+254725240643", role: "Secretary" },
    { name: "Lydia Wangechi",  phone: "+254722283488", role: "Member"    },
    { name: "Peris Njeri",     phone: "+254722385680", role: "Member"    },
    { name: "Peter Ndichu",    phone: "+254748210371", role: "Member"    },
    { name: "Rachel Mwaura",   phone: "+254722935721", role: "Member"    },
    { name: "Wilson Wainaina", phone: "+254723547560", role: "Member"    },
  ];
  const upd = db.prepare("UPDATE members SET phone=?, role=? WHERE name=?");
  for (const { name, phone, role } of phoneUpdates) upd.run(phone, role, name);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ok       = (res, data, status=200) => res.status(status).json({ ok:true, data });
const fail     = (res, msg, status=400)  => res.status(status).json({ ok:false, error:msg });
const notFound = (res, what)             => fail(res, `${what} not found`, 404);
const audit    = (actorId, action, target=null, details=null) => {
  try { db.prepare("INSERT INTO audit_log (actor_id,action,target,details) VALUES (?,?,?,?)").run(actorId, action, target, details ? JSON.stringify(details) : null); } catch {}
};

// ─── AI Meeting Summary ───────────────────────────────────────────────────────

async function generateMeetingSummary(meetingId, transcript) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY || !transcript) return;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{
          role: "user",
          content: `You are a Chama (savings group) meeting secretary. Summarize the following meeting transcript concisely. Return ONLY a JSON object with these exact keys:
{
  "summary": "2-4 sentence overview of what was discussed",
  "key_points": ["point 1", "point 2", ...],
  "action_items": ["action 1", "action 2", ...]
}

Transcript:
${transcript.slice(0, 8000)}`,
        }],
        temperature: 0.3,
        max_tokens: 600,
      }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]);
    db.prepare("UPDATE meetings SET ai_summary=? WHERE id=?").run(JSON.stringify(parsed), meetingId);
    console.log("[AI Summary] generated for meeting", meetingId);
  } catch (e) {
    console.warn("[AI Summary] failed:", e.message);
  }
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

function toE164(phone) {
  const p = String(phone).replace(/[\s\-+]/g, "");
  if (p.startsWith("07") || p.startsWith("01")) return "254" + p.slice(1);
  if (p.startsWith("254")) return p;
  return p;
}

async function sendWhatsAppOnboarding(phone, name) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token         = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !token) return;
  const appUrl = process.env.APP_URL || "https://chamaflow-six.vercel.app";
  const res = await fetch(
    `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toE164(phone),
        type: "template",
        template: {
          name: "member_onboarding",
          language: { code: "en" },
          components: [{
            type: "body",
            parameters: [
              { type: "text", text: name },
              { type: "text", text: appUrl },
              { type: "text", text: phone },
            ],
          }],
        },
      }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.warn("[WhatsApp] send failed:", JSON.stringify(data));
  else console.log("[WhatsApp] sent to", toE164(phone), "→", data?.messages?.[0]?.id);
}

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
  // L6: re-check role from DB so revoked admins lose access immediately
  const m = db.prepare("SELECT role FROM members WHERE id=?").get(req.user.id);
  if (!m || !["Chairman","Secretary"].includes(m.role)) return fail(res, "Admin access required", 403);
  next();
}

// ─── AUTH ROUTES (public) ─────────────────────────────────────────────────────

// POST /api/auth/login  { phone, pin } → { token, member, must_change_pin }
app.post("/api/auth/login", async (req, res) => {
  const { phone, pin } = req.body;
  if (!phone || !pin) return fail(res, "Phone and PIN are required");
  const cleanPhone = String(phone).replace(/[\s\-]/g, "");
  const rlKey = `login:${req.ip}:${cleanPhone}`;
  if (!rateLimitCheck(rlKey)) return fail(res, "Too many attempts — try again in 15 minutes", 429);
  const member = db.prepare("SELECT * FROM members WHERE phone=?").get(cleanPhone);
  if (!member)         return fail(res, "Phone number not registered", 404);
  if (!member.active)  return fail(res, "Account deactivated — contact the Chairman", 403);
  if (!member.pin_hash)return fail(res, "PIN not set — contact the Secretary", 403);
  const valid = await bcrypt.compare(String(pin), member.pin_hash);
  if (!valid) return fail(res, "Incorrect PIN", 401);
  rateLimitReset(rlKey); // clear on success
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
  const rlKey = `changepin:${req.user.id}`;
  if (!rateLimitCheck(rlKey, 10)) return fail(res, "Too many attempts — try again in 15 minutes", 429);
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

// ─── One-time phone update hook (public but key-gated) ───────────────────────
{
  const PHONE_UPDATE_KEY = process.env.PHONE_UPDATE_KEY || "";
  app.post("/api/internal/apply-phones", (req, res) => {
    if (!PHONE_UPDATE_KEY || req.headers["x-update-key"] !== PHONE_UPDATE_KEY) return fail(res, "Forbidden", 403);
    const phoneUpdates = [
      { name: "Cate Theuri",     phone: "+254722828313" },
      { name: "David Munene",    phone: "+254722261215" },
      { name: "Eliud Maina",     phone: "+254724787052" },
      { name: "Evelyn Kagwiria", phone: "+254723683005" },
      { name: "Felista Wandugi", phone: "+254703322333" },
      { name: "Gladys Muigai",   phone: "0700000006"   },
      { name: "Godfrey Kimani",  phone: "+254715797246", role: "Chairman"  },
      { name: "Hannah Njoki",    phone: "+254722878159" },
      { name: "Jessie Nyaga",    phone: "+254722864778" },
      { name: "John Mwaura",     phone: "+254722839581" },
      { name: "Kellen Wanderi",  phone: "0700000011"   },
      { name: "Leah Wangui",     phone: "+254722546049" },
      { name: "Lydia Kibe",      phone: "+254725240643", role: "Secretary" },
      { name: "Lydia Wangechi",  phone: "+254722283488" },
      { name: "Peris Njeri",     phone: "+254722385680" },
      { name: "Peter Ndichu",    phone: "+254748210371" },
      { name: "Rachel Mwaura",   phone: "+254722935721" },
      { name: "Wilson Wainaina", phone: "+254723547560" },
    ];
    const upd = db.prepare("UPDATE members SET phone=COALESCE(?,phone), role=COALESCE(?,role) WHERE name=?");
    let count = 0;
    for (const { name, phone, role = null } of phoneUpdates) {
      const r = upd.run(phone, role, name);
      if (r.changes) count++;
    }
    const members = db.prepare("SELECT id,name,phone,role FROM members ORDER BY id").all();
    ok(res, { updated: count, members });
  });
}

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
  sendWhatsAppOnboarding(cleanPhone, name).catch(e => console.warn("[WhatsApp]", e.message));
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

app.post("/api/contributions/bulk", requireAdmin, (req, res) => {
  const { month, entries } = req.body;
  if (!month || !Array.isArray(entries) || entries.length === 0)
    return fail(res, "month and entries[] required");

  const insert = db.prepare(
    "INSERT INTO contributions (member_id,type,month,amount,method,ref,status,recorded_by) VALUES (?,?,?,?,?,?,?,?)"
  );

  const results = [];
  const skipped = [];
  const checkDup = db.prepare(
    "SELECT id FROM contributions WHERE member_id=? AND month=? AND type=?"
  );
  const bulkTx = db.transaction(() => {
    for (const e of entries) {
      const { member_id, type = "Contribution", amount, method = "M-Pesa", ref = "", status = "Pending" } = e;
      const parsed = parseFloat(amount);
      if (!member_id || !amount || parsed <= 0 || isNaN(parsed)) continue;
      if (checkDup.get(member_id, month, type)) { skipped.push(member_id); continue; }
      const r = insert.run(member_id, type, month, parsed, method, ref, status, req.user.id);
      results.push(r.lastInsertRowid);
    }
  });
  bulkTx();
  audit(req.user.id, "BULK_IMPORT", `contributions`, { month, count: results.length, skipped: skipped.length });
  ok(res, { inserted: results.length, skipped: skipped.length, ids: results }, 201);
});

const storage = multer.diskStorage({ destination:(_,__,cb)=>cb(null,UPLOADS), filename:(_,f,cb)=>cb(null,`${uuidv4()}${path.extname(f.originalname)}`) });
const upload  = multer({ storage, limits:{fileSize:5*1024*1024} });

const audioStorage = multer.diskStorage({ destination:(_,__,cb)=>cb(null,UPLOADS), filename:(_,f,cb)=>cb(null,`audio-${uuidv4()}${path.extname(f.originalname)||".webm"}`) });
const audioUpload  = multer({ storage:audioStorage, limits:{fileSize:50*1024*1024} });

app.post("/api/contributions/:id/upload", requireAdmin, upload.single("proof"), (req, res) => {
  if (!db.prepare("SELECT id FROM contributions WHERE id=?").get(req.params.id)) return notFound(res,"Contribution");
  if (!req.file) return fail(res,"No file uploaded");
  const proof_url=`/uploads/${req.file.filename}`;
  db.prepare("UPDATE contributions SET proof_url=? WHERE id=?").run(proof_url,req.params.id);
  ok(res,{proof_url});
});

// ─── MEETINGS ─────────────────────────────────────────────────────────────────

const getEndorsementsStmt = db.prepare("SELECT me.type, me.member_id, mb.name as member_name FROM meeting_endorsements me JOIN members mb ON me.member_id=mb.id WHERE me.meeting_id=?");

app.get("/api/meetings", (req, res) => {
  ok(res, db.prepare("SELECT * FROM meetings ORDER BY date DESC").all().map(m => {
    const endorsements = getEndorsementsStmt.all(m.id);
    const proposer = endorsements.find(e => e.type === "propose");
    const seconder = endorsements.find(e => e.type === "second");
    return {
      ...m,
      attendance_count: db.prepare("SELECT COUNT(*) as c FROM meeting_attendance WHERE meeting_id=? AND status='present'").get(m.id).c,
      decisions: db.prepare("SELECT * FROM meeting_decisions WHERE meeting_id=?").all(m.id),
      proposer_name: proposer?.member_name || null,
      proposer_id:   proposer?.member_id   || null,
      seconder_name: seconder?.member_name || null,
      seconder_id:   seconder?.member_id   || null,
    };
  }));
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

// GET /api/meetings/:id/minutes — attendance + contribution stats for the panel
app.get("/api/meetings/:id/minutes", requireAuth, (req, res) => {
  const m = db.prepare("SELECT * FROM meetings WHERE id=?").get(req.params.id);
  if (!m) return notFound(res, "Meeting");

  // Derive contribution month string ("January 2025") from meeting.date
  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  let month = null;
  const dateStr = String(m.date);
  const yearMatch = dateStr.match(/\d{4}/);
  const foundMonth = MONTH_NAMES.find(mn => dateStr.includes(mn));
  if (foundMonth && yearMatch) {
    month = `${foundMonth} ${yearMatch[0]}`;
  } else if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const d = new Date(dateStr);
    month = MONTH_NAMES[d.getUTCMonth()] + " " + d.getUTCFullYear();
  }

  const attendance = db.prepare(
    "SELECT ma.status, me.id, me.name, me.shares, me.role FROM meeting_attendance ma JOIN members me ON ma.member_id=me.id WHERE ma.meeting_id=? ORDER BY me.name"
  ).all(req.params.id);

  const totalActive = db.prepare("SELECT COUNT(*) as c FROM members WHERE active=1").get().c;
  const present  = attendance.filter(a => a.status === "present");
  const apology  = attendance.filter(a => a.status === "apology");
  const recorded = attendance.length;

  let contributions = [];
  if (month) {
    contributions = db.prepare(
      "SELECT c.type, c.amount, c.status, me.name as member_name FROM contributions c JOIN members me ON c.member_id=me.id WHERE c.month=? ORDER BY c.type, me.name"
    ).all(month);
  }

  const confirmed  = contributions.filter(c => c.status === "Confirmed");
  const totalCollected  = confirmed.reduce((s, c) => s + c.amount, 0);
  const totalContribs   = contributions.filter(c => c.type === "Contribution").reduce((s, c) => s + c.amount, 0);
  const totalFines      = contributions.filter(c => c.type === "Fine").reduce((s, c) => s + c.amount, 0);
  const totalLateness   = contributions.filter(c => c.type === "Lateness").reduce((s, c) => s + c.amount, 0);

  ok(res, {
    month,
    ai_summary: m.ai_summary ? JSON.parse(m.ai_summary) : null,
    attendance: {
      present, apology,
      present_count:  present.length,
      apology_count:  apology.length,
      absent_count:   Math.max(0, totalActive - recorded),
      total_members:  totalActive,
    },
    contributions: {
      items: contributions,
      total_collected: totalCollected,
      total_contributions: totalContribs,
      total_fines: totalFines,
      total_lateness: totalLateness,
    },
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
  const meetingId = req.params.id;
  const {member_id, status="present"} = req.body;
  if (!member_id) return fail(res,"member_id required");

  const meeting = db.prepare("SELECT * FROM meetings WHERE id=?").get(meetingId);
  if (!meeting) return notFound(res,"Meeting");

  // Upsert attendance
  const ex = db.prepare("SELECT id,status FROM meeting_attendance WHERE meeting_id=? AND member_id=?").get(meetingId,member_id);
  const prevStatus = ex?.status ?? "present";
  ex ? db.prepare("UPDATE meeting_attendance SET status=? WHERE id=?").run(status,ex.id)
     : db.prepare("INSERT INTO meeting_attendance (meeting_id,member_id,status) VALUES (?,?,?)").run(meetingId,member_id,status);

  // ── Auto-fine logic ─────────────────────────────────────────────────────────
  const FINE_NOTE_PREFIX = `auto-fine:meeting:${meetingId}`;
  const fineType   = status === "absent" ? "Fine" : status === "apology" ? "Lateness" : null;
  const fineAmount = status === "absent" ? 500 : status === "apology" ? 200 : null;

  // Determine meeting month string for the fine record
  const meetingDate = new Date(meeting.date);
  const fineMonth   = isNaN(meetingDate)
    ? meeting.date                  // fallback: use raw date string
    : meetingDate.toLocaleString("en-GB",{month:"long"}) + " " + meetingDate.getFullYear();

  let autoFine = null;

  if (fineType) {
    // Check for existing auto-fine for this member+meeting
    const existingFine = db.prepare(
      "SELECT id FROM contributions WHERE member_id=? AND notes=? AND type IN ('Fine','Lateness')"
    ).get(member_id, FINE_NOTE_PREFIX);

    if (!existingFine) {
      const r = db.prepare(
        "INSERT INTO contributions (member_id,type,month,amount,method,status,notes,recorded_by) VALUES (?,?,?,?,'Auto','Pending',?,?)"
      ).run(member_id, fineType, fineMonth, fineAmount, FINE_NOTE_PREFIX, req.user.id);
      audit(req.user.id,"AUTO_FINE",`contribution:${r.lastInsertRowid}`,{member_id,type:fineType,amount:fineAmount,meeting_id:meetingId});
      autoFine = { id: r.lastInsertRowid, type: fineType, amount: fineAmount };
    }
  } else if (prevStatus !== "present") {
    // Changed back to present — remove the auto-fine if it's still Pending
    const existingFine = db.prepare(
      "SELECT id FROM contributions WHERE member_id=? AND notes=? AND type IN ('Fine','Lateness') AND status='Pending'"
    ).get(member_id, FINE_NOTE_PREFIX);
    if (existingFine) {
      db.prepare("DELETE FROM contributions WHERE id=?").run(existingFine.id);
      audit(req.user.id,"REMOVE_AUTO_FINE",`contribution:${existingFine.id}`,{member_id,meeting_id:meetingId});
    }
  }

  ok(res, { message: "Attendance recorded", autoFine });
});

app.post("/api/meetings/:id/decisions", requireAdmin, (req, res) => {
  const {decision,proposed_by,seconded_by} = req.body;
  if (!decision) return fail(res,"decision text required");
  const r = db.prepare("INSERT INTO meeting_decisions (meeting_id,decision,proposed_by,seconded_by) VALUES (?,?,?,?)").run(req.params.id,decision,proposed_by||null,seconded_by||null);
  audit(req.user.id,"ADD_DECISION",`meeting:${req.params.id}`,{decision});
  ok(res, db.prepare("SELECT * FROM meeting_decisions WHERE id=?").get(r.lastInsertRowid), 201);
});

app.delete("/api/meetings/:id", requireAdmin, (req, res) => {
  const m = db.prepare("SELECT * FROM meetings WHERE id=?").get(req.params.id);
  if (!m) return notFound(res, "Meeting");
  db.prepare("DELETE FROM meetings WHERE id=?").run(req.params.id);
  audit(req.user.id, "DELETE_MEETING", `meeting:${req.params.id}`, { date: m.date });
  ok(res, { message: "Meeting deleted" });
});

// POST /api/meetings/:id/transcript — Chairman/Secretary only, audio → Whisper → save
// Query param: ?provider=groq (default) | huggingface
app.post("/api/meetings/:id/transcript", requireAdmin, audioUpload.single("audio"), async (req, res) => {
  const meeting = db.prepare("SELECT id FROM meetings WHERE id=?").get(req.params.id);
  if (!meeting) return notFound(res, "Meeting");
  if (!req.file) return fail(res, "No audio file uploaded");

  const provider = req.query.provider === "huggingface" ? "huggingface" : "groq";

  try {
    const audioData = fs.readFileSync(req.file.path);
    const blob = new Blob([audioData], { type: req.file.mimetype || "audio/webm" });
    let transcript;

    if (provider === "huggingface") {
      const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;
      if (!HF_API_KEY) { fs.unlink(req.file.path, ()=>{}); return fail(res, "HUGGINGFACE_API_KEY not configured on server"); }

      const hfRes = await fetch(
        "https://api-inference.huggingface.co/models/openai/whisper-large-v3-turbo",
        { method: "POST", headers: { Authorization: `Bearer ${HF_API_KEY}`, "Content-Type": req.file.mimetype || "audio/webm" }, body: audioData }
      );
      fs.unlink(req.file.path, () => {});
      if (!hfRes.ok) { const t = await hfRes.text(); return fail(res, `HuggingFace API error: ${t}`); }
      transcript = (await hfRes.json()).text;

    } else {
      const GROQ_API_KEY = process.env.GROQ_API_KEY;
      if (!GROQ_API_KEY) { fs.unlink(req.file.path, ()=>{}); return fail(res, "GROQ_API_KEY not configured on server"); }

      const form = new FormData();
      form.append("file", blob, req.file.originalname || "recording.webm");
      form.append("model", "whisper-large-v3");

      const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions",
        { method: "POST", headers: { Authorization: `Bearer ${GROQ_API_KEY}` }, body: form }
      );
      fs.unlink(req.file.path, () => {});
      if (!groqRes.ok) { const t = await groqRes.text(); return fail(res, `Groq API error: ${t}`); }
      transcript = (await groqRes.json()).text;
    }

    db.prepare("UPDATE meetings SET transcript=? WHERE id=?").run(transcript, req.params.id);
    audit(req.user.id, "TRANSCRIBE_MEETING", `meeting:${req.params.id}`, { provider });
    ok(res, { transcript, provider });
    generateMeetingSummary(req.params.id, transcript).catch(e => console.warn("[AI Summary]", e.message));
  } catch (e) {
    console.error("[Transcription error]", e.cause || e.message, e.stack?.split("\n")[1]);
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    return fail(res, e.message || "Transcription failed");
  }
});

// POST /api/meetings/:id/endorse — any member, propose or second the transcript
app.post("/api/meetings/:id/endorse", (req, res) => {
  const { type } = req.body;
  if (!["propose","second"].includes(type)) return fail(res, "type must be 'propose' or 'second'");

  const meeting = db.prepare("SELECT id, transcript FROM meetings WHERE id=?").get(req.params.id);
  if (!meeting) return notFound(res, "Meeting");
  if (!meeting.transcript) return fail(res, "This meeting has no transcript yet");

  try {
    db.prepare("INSERT INTO meeting_endorsements (meeting_id, member_id, type) VALUES (?,?,?)")
      .run(req.params.id, req.user.id, type);
    audit(req.user.id, "ENDORSE_MEETING", `meeting:${req.params.id}`, { type });
    ok(res, { message: `Meeting ${type === "propose" ? "proposed" : "seconded"} successfully` });
  } catch (e) {
    if (e.message?.includes("UNIQUE constraint")) {
      return fail(res, e.message.includes("meeting_id, type")
        ? `This meeting already has a ${type === "propose" ? "proposer" : "seconder"}`
        : "You have already endorsed this meeting");
    }
    return fail(res, e.message || "Failed to endorse");
  }
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

// ─── ANNUAL REPORT ────────────────────────────────────────────────────────────

app.get("/api/report/annual", requireAuth, (req, res) => {
  const year = req.query.year || new Date().getFullYear();

  // Per-member contribution totals for the year
  const members = db.prepare(`
    SELECT
      m.id, m.name, m.shares,
      (m.shares * 5000 * 12) AS expected_annual,
      COALESCE(SUM(CASE WHEN c.type='Contribution' AND c.status='Confirmed' THEN c.amount END),0) AS contributions,
      COALESCE(SUM(CASE WHEN c.type='Fine'         AND c.status='Confirmed' THEN c.amount END),0) AS fines,
      COALESCE(SUM(CASE WHEN c.type='Lateness'     AND c.status='Confirmed' THEN c.amount END),0) AS lateness
    FROM members m
    LEFT JOIN contributions c ON c.member_id=m.id AND c.month LIKE ?
    WHERE m.active=1
    GROUP BY m.id
    ORDER BY contributions DESC
  `).all(`% ${year}`);

  // Attendance per member across all meetings in the year
  const attendance = db.prepare(`
    SELECT ma.member_id,
      COUNT(*) AS meetings_total,
      SUM(CASE WHEN ma.status='present' THEN 1 ELSE 0 END) AS present,
      SUM(CASE WHEN ma.status='apology' THEN 1 ELSE 0 END) AS apology,
      SUM(CASE WHEN ma.status='absent'  THEN 1 ELSE 0 END) AS absent
    FROM meeting_attendance ma
    JOIN meetings mt ON mt.id=ma.meeting_id AND mt.date LIKE ?
    GROUP BY ma.member_id
  `).all(`% ${year}`);

  const attMap = Object.fromEntries(attendance.map(a => [a.member_id, a]));
  const membersWithAtt = members.map(m => ({ ...m, ...(attMap[m.id] || { meetings_total:0, present:0, apology:0, absent:0 }) }));

  // Monthly totals
  const monthly = db.prepare(`
    SELECT month,
      COALESCE(SUM(CASE WHEN type='Contribution' AND status='Confirmed' THEN amount END),0) AS contributions,
      COALESCE(SUM(CASE WHEN type='Fine'         AND status='Confirmed' THEN amount END),0) AS fines,
      COALESCE(SUM(CASE WHEN type='Lateness'     AND status='Confirmed' THEN amount END),0) AS lateness
    FROM contributions
    WHERE month LIKE ?
    GROUP BY month
    ORDER BY month
  `).all(`% ${year}`);

  // Meeting summary
  const meetings = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='Approved' THEN 1 ELSE 0 END) AS approved,
      SUM(CASE WHEN status='Pending Approval' THEN 1 ELSE 0 END) AS pending
    FROM meetings WHERE date LIKE ?
  `).get(`% ${year}`);

  // Grand totals
  const totals = {
    contributions: membersWithAtt.reduce((s,m)=>s+m.contributions,0),
    fines:         membersWithAtt.reduce((s,m)=>s+m.fines,0),
    lateness:      membersWithAtt.reduce((s,m)=>s+m.lateness,0),
    expected:      membersWithAtt.reduce((s,m)=>s+m.expected_annual,0),
  };
  totals.grand = totals.contributions + totals.fines + totals.lateness;

  ok(res, { year, members: membersWithAtt, monthly, meetings, totals });
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
