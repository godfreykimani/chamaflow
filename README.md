# ChamaFlow

Mobile-first chama savings platform — React + Express + SQLite + JWT auth.

```
chamaflow/
├── backend/
│   ├── server.js        REST API with JWT auth
│   ├── seed.js          Seeds DB with 26 members + 5 months of data
│   ├── package.json
│   ├── .env.example     Copy to .env before running
│   ├── railway.toml     Railway deployment config
│   ├── render.yaml      Render deployment config
│   └── Procfile
└── frontend/
    ├── src/
    │   ├── App.jsx       Full app (auth wrapper + all pages)
    │   ├── LoginPage.jsx Phone + PIN keypad login screen
    │   ├── ChangePinPage.jsx  Forced PIN change on first login
    │   └── api.js        All API calls (token management built-in)
    ├── vercel.json       Vercel deployment config
    ├── vite.config.js
    └── package.json
```

---

## Local Setup (5 minutes)

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env          # edit JWT_SECRET at minimum
node seed.js                  # seeds chamaflow.db
npm start                     # → http://localhost:3001
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                   # → http://localhost:5173
```

### 3. Login

| Role      | Phone        | PIN  |
|-----------|-------------|------|
| Chairman  | 0712345678  | 1234 |
| Secretary | 0723456789  | 1234 |
| Member    | 0734567890  | 1234 |

All members are prompted to change their PIN on first login.

---

## Deploy to Production

### Option A — Railway (backend) + Vercel (frontend) ← recommended

**Backend → Railway**

1. Push the `backend/` folder to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Set environment variables in Railway dashboard:
   ```
   JWT_SECRET   = <run: openssl rand -hex 64>
   NODE_ENV     = production
   FRONTEND_URL = https://your-app.vercel.app
   ```
4. Railway auto-detects Node.js and deploys. Note the `.up.railway.app` URL.
5. Run seed via Railway shell: `node seed.js`

**Frontend → Vercel**

1. Push the `frontend/` folder to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import
3. Set environment variable:
   ```
   VITE_API_URL = https://your-api.up.railway.app/api
   ```
4. Deploy. Done.

---

### Option B — Render (backend + persistent disk)

Render gives you a persistent disk for SQLite — best for keeping data across deploys.

1. Push to GitHub
2. New Web Service on [render.com](https://render.com) → connect repo
3. `render.yaml` is already configured — Render auto-reads it
4. Set `FRONTEND_URL` and `JWT_SECRET` in Render dashboard
5. Database stored at `/data/chamaflow.db` (persists across restarts)
6. SSH in and run `node seed.js` once

---

## Auth Flow

```
POST /api/auth/login         { phone, pin }  → { token, member, must_change_pin }
POST /api/auth/change-pin    { current_pin, new_pin }  [auth required]
POST /api/auth/reset-pin     { member_id }   [admin only] → resets to "1234"
GET  /api/auth/me                             [auth required]
```

- Token expiry: **7 days** (configurable via `JWT_EXPIRY` env var)
- Forced PIN change: every new member gets `must_change_pin=1` until they update
- A 401 from any endpoint automatically signs the user out in the frontend
- All actions are written to the `audit_log` table

## Role Permissions

| Endpoint                        | Member | Secretary | Chairman |
|---------------------------------|--------|-----------|----------|
| GET /api/dashboard/:id (own)    | ✓      | ✓         | ✓        |
| GET /api/contributions (own)    | ✓      | All       | All      |
| POST /api/contributions         | ✗      | ✓         | ✓        |
| GET /api/members                | ✓      | ✓         | ✓        |
| POST/PUT/DELETE /api/members    | ✗      | ✓         | ✓        |
| GET /api/meetings               | ✓      | ✓         | ✓        |
| POST /api/meetings              | ✗      | ✓         | ✓        |
| GET /api/audit                  | ✗      | ✗         | ✓        |
| POST /api/auth/reset-pin        | ✗      | ✓         | ✓        |

---

## What's Next

| Phase | Feature                  | Effort |
|-------|--------------------------|--------|
| 3     | M-Pesa STK Push (Daraja) | 2–3 days |
| 4     | SMS reminders (Africa's Talking) | 1 day |
| 5     | Real AI transcription (Whisper) | 1 day |
| 6     | Annual reports + PDF export | 1 day |
