# ChamaFlow Deployment Info

Generated: Mon May  4 10:09:46 EAT 2026

## URLs
- **App (share this):** https://chamaflow.vercel.app
- **API:**              https://chamaflow-api.up.railway.app/api
- **GitHub:**          https://github.com/godfreykimani/chamaflow

## Dashboards
- Railway: https://railway.app/dashboard
- Vercel:  https://vercel.com/dashboard

## Login Credentials (default PIN: 1234)
| Role      | Phone      |
|-----------|-----------|
| Chairman  | 0712345678 |
| Secretary | 0723456789 |
| Member 3  | 0734567890 |

All 26 members are in the database. Each must set a new PIN on first login.

## Useful commands
```bash
# View backend logs
cd backend && railway logs

# Re-seed database (WARNING: wipes all data)
cd backend && railway run node seed.js

# Redeploy backend after code changes
cd backend && railway up

# Redeploy frontend after code changes
cd frontend && vercel --prod
```
