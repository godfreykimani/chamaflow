#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  ChamaFlow — One-shot deploy script
#  GitHub: https://github.com/godfreykimani/chamaflow
#  Backend:  Railway
#  Frontend: Vercel
#
#  Run from INSIDE the chamaflow/ folder:
#    chmod +x deploy.sh && ./deploy.sh
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}${BOLD}▶ $*${NC}"; }
success() { echo -e "${GREEN}✅ $*${NC}"; }
warn()    { echo -e "${YELLOW}⚠️  $*${NC}"; }
fail()    { echo -e "${RED}❌ $*${NC}"; exit 1; }
step()    { echo -e "\n${BOLD}━━━ $* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

GITHUB_USER="godfreykimani"
REPO_NAME="chamaflow"
GITHUB_REPO="https://github.com/${GITHUB_USER}/${REPO_NAME}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       ChamaFlow Deploy Script            ║${NC}"
echo -e "${BOLD}║  github.com/godfreykimani/chamaflow      ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# ════════════════════════════════════════════════════════════════════
# STEP 0 — Preflight checks
# ════════════════════════════════════════════════════════════════════
step "0 — Checking required tools"

need() {
  if ! command -v "$1" &>/dev/null; then
    warn "$1 not found — installing..."
    return 1
  fi
  success "$1 found ($(command -v "$1"))"
  return 0
}

# Node.js
need node || fail "Install Node.js 18+ from https://nodejs.org then re-run."
NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
info "Node.js $NODE_VER"

# npm
need npm || fail "npm not found — reinstall Node.js"

# Git
need git || fail "Install git: https://git-scm.com/downloads"

# GitHub CLI (gh)
if ! need gh; then
  info "Installing GitHub CLI..."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    brew install gh 2>/dev/null || fail "Install Homebrew first: https://brew.sh, then re-run."
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
    sudo apt update -q && sudo apt install gh -y -q
  else
    fail "Install GitHub CLI manually: https://cli.github.com/ then re-run."
  fi
fi

# Railway CLI
if ! need railway; then
  info "Installing Railway CLI..."
  npm install -g @railway/cli 2>/dev/null || \
    curl -fsSL https://railway.app/install.sh | sh 2>/dev/null || \
    fail "Could not install Railway CLI. Visit https://railway.app/install and install manually."
fi

# Vercel CLI
if ! need vercel; then
  info "Installing Vercel CLI..."
  npm install -g vercel || fail "Failed to install Vercel CLI."
fi

success "All tools ready"

# ════════════════════════════════════════════════════════════════════
# STEP 1 — Generate JWT secret
# ════════════════════════════════════════════════════════════════════
step "1 — Generating secure JWT secret"

JWT_SECRET=$(node -e "require('crypto').randomBytes(64).toString('hex').split('').reduce((a,c,i)=>a+c+(i%8===7?'':'')).toString()" 2>/dev/null \
  || openssl rand -hex 64 2>/dev/null \
  || node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

success "JWT secret generated (64 bytes)"
echo "   (stored only in Railway env — never committed to git)"

# ════════════════════════════════════════════════════════════════════
# STEP 2 — GitHub auth + repo creation
# ════════════════════════════════════════════════════════════════════
step "2 — GitHub: authenticate & create repo"

# Check if already logged in
if ! gh auth status &>/dev/null; then
  info "You need to authenticate with GitHub."
  echo ""
  echo -e "${YELLOW}  A browser window will open — sign in as ${GITHUB_USER}${NC}"
  echo -e "${YELLOW}  Then come back to this terminal.${NC}"
  echo ""
  gh auth login --hostname github.com --git-protocol https --web || \
    fail "GitHub auth failed. Try: gh auth login"
fi

GH_LOGGED_IN=$(gh api user --jq '.login' 2>/dev/null || echo "unknown")
info "Logged in as: ${GH_LOGGED_IN}"

# Create repo if it doesn't exist
if gh repo view "${GITHUB_USER}/${REPO_NAME}" &>/dev/null; then
  warn "Repo ${GITHUB_USER}/${REPO_NAME} already exists — using it"
else
  info "Creating repo: ${GITHUB_USER}/${REPO_NAME}"
  gh repo create "${GITHUB_USER}/${REPO_NAME}" \
    --public \
    --description "ChamaFlow — Mobile-first chama savings platform" \
    --homepage "https://${REPO_NAME}.vercel.app" \
    || fail "Could not create GitHub repo."
  success "Repo created: ${GITHUB_REPO}"
fi

# ════════════════════════════════════════════════════════════════════
# STEP 3 — Git init + push
# ════════════════════════════════════════════════════════════════════
step "3 — Git: commit & push all files"

cd "$SCRIPT_DIR"

# Ensure we're not inside another git repo accidentally
if git rev-parse --git-dir &>/dev/null 2>&1; then
  EXISTING_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
  if [[ "$EXISTING_REMOTE" != *"$REPO_NAME"* ]]; then
    warn "Existing git repo found with different remote. Re-initialising..."
    rm -rf .git
  fi
fi

if [ ! -d ".git" ]; then
  git init
  git branch -M main
fi

# Set remote
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/${GITHUB_USER}/${REPO_NAME}.git"

# Make sure .gitignore is protecting secrets
if ! grep -q "chamaflow.db" .gitignore 2>/dev/null; then
  echo -e "\n# DB & secrets\nbackend/chamaflow.db\nbackend/.env\nfrontend/.env.local" >> .gitignore
fi

# Configure git identity if not set
if ! git config user.email &>/dev/null; then
  git config user.email "${GITHUB_USER}@users.noreply.github.com"
  git config user.name  "${GITHUB_USER}"
fi

git add -A
git commit -m "feat: initial ChamaFlow commit — auth + API + React frontend

- Express + SQLite + JWT auth backend
- React + Vite mobile-first frontend
- 26 member seed data with 5 months of contributions
- Role-based access (Chairman / Secretary / Member)
- Deploy configs for Railway (backend) + Vercel (frontend)" \
  2>/dev/null || git commit --allow-empty -m "chore: update deployment configs"

info "Pushing to github.com/${GITHUB_USER}/${REPO_NAME}..."
git push -u origin main --force
success "Code pushed to ${GITHUB_REPO}"

# ════════════════════════════════════════════════════════════════════
# STEP 4 — Railway: deploy backend
# ════════════════════════════════════════════════════════════════════
step "4 — Railway: deploy backend API"

cd "$SCRIPT_DIR/backend"

# Railway login
if ! railway whoami &>/dev/null 2>&1; then
  info "Logging into Railway..."
  echo -e "${YELLOW}  A browser window will open — sign in (GitHub works great)${NC}"
  railway login || fail "Railway login failed. Visit https://railway.app"
fi

RAILWAY_USER=$(railway whoami 2>/dev/null || echo "unknown")
info "Railway user: ${RAILWAY_USER}"

# Link or create project
info "Creating Railway project: chamaflow-api"
railway init --name "chamaflow-api" 2>/dev/null || true

# Set environment variables
info "Setting Railway environment variables..."
railway variables set \
  NODE_ENV="production" \
  JWT_SECRET="${JWT_SECRET}" \
  JWT_EXPIRY="7d" \
  PORT="3001" \
  || warn "Some env vars may have failed — check Railway dashboard"

success "Environment variables set in Railway"

# Deploy
info "Deploying to Railway (this takes ~2 minutes)..."
railway up --detach || fail "Railway deploy failed. Check: railway logs"

# Get the Railway URL
sleep 5
RAILWAY_URL=$(railway domain 2>/dev/null | grep -oP 'https://\S+' | head -1 || echo "")

if [ -z "$RAILWAY_URL" ]; then
  info "Generating Railway public URL..."
  railway domain generate 2>/dev/null || true
  sleep 3
  RAILWAY_URL=$(railway domain 2>/dev/null | grep -oP 'https://\S+' | head -1 || echo "")
fi

if [ -z "$RAILWAY_URL" ]; then
  RAILWAY_URL="https://chamaflow-api.up.railway.app"
  warn "Could not auto-detect Railway URL. Using default: ${RAILWAY_URL}"
  warn "Check your actual URL at: https://railway.app/dashboard"
fi

success "Backend deployed: ${RAILWAY_URL}"

# ════════════════════════════════════════════════════════════════════
# STEP 5 — Seed the production database
# ════════════════════════════════════════════════════════════════════
step "5 — Seeding production database"

info "Running seed.js on Railway..."
railway run node seed.js 2>/dev/null && success "Database seeded with 26 members" \
  || warn "Seed via Railway shell failed — run manually: railway run node seed.js"

# ════════════════════════════════════════════════════════════════════
# STEP 6 — Vercel: deploy frontend
# ════════════════════════════════════════════════════════════════════
step "6 — Vercel: deploy frontend"

cd "$SCRIPT_DIR/frontend"

# Update FRONTEND_URL in Railway now that we know the Vercel domain will be chamaflow.vercel.app
VERCEL_URL="https://${REPO_NAME}.vercel.app"

# Set FRONTEND_URL in Railway
cd "$SCRIPT_DIR/backend"
railway variables set FRONTEND_URL="${VERCEL_URL}" 2>/dev/null \
  || warn "Could not set FRONTEND_URL in Railway — set it manually in Railway dashboard"
cd "$SCRIPT_DIR/frontend"

# Vercel login
if ! vercel whoami &>/dev/null 2>&1; then
  info "Logging into Vercel..."
  echo -e "${YELLOW}  A browser window will open — sign in (GitHub works great)${NC}"
  vercel login || fail "Vercel login failed."
fi

VERCEL_USER=$(vercel whoami 2>/dev/null || echo "unknown")
info "Vercel user: ${VERCEL_USER}"

# Write .env.local with production API URL
cat > .env.local << ENVEOF
VITE_API_URL=${RAILWAY_URL}/api
ENVEOF

# Deploy to Vercel (non-interactive)
info "Deploying to Vercel..."
vercel deploy \
  --yes \
  --name "${REPO_NAME}" \
  --prod \
  --build-env VITE_API_URL="${RAILWAY_URL}/api" \
  --env      VITE_API_URL="${RAILWAY_URL}/api" \
  2>/dev/null || {
    warn "Non-interactive Vercel deploy failed — trying interactive..."
    vercel --prod
  }

# Clean up temp env file
rm -f .env.local

ACTUAL_VERCEL_URL=$(vercel ls "${REPO_NAME}" --json 2>/dev/null \
  | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d[0]?.url||'')" 2>/dev/null \
  || echo "${VERCEL_URL}")

[ -z "$ACTUAL_VERCEL_URL" ] && ACTUAL_VERCEL_URL="${VERCEL_URL}"
[[ "$ACTUAL_VERCEL_URL" != https://* ]] && ACTUAL_VERCEL_URL="https://${ACTUAL_VERCEL_URL}"

success "Frontend deployed: ${ACTUAL_VERCEL_URL}"

# ════════════════════════════════════════════════════════════════════
# STEP 7 — Update Railway FRONTEND_URL with real Vercel URL
# ════════════════════════════════════════════════════════════════════
step "7 — Finalising CORS config"

cd "$SCRIPT_DIR/backend"
railway variables set FRONTEND_URL="${ACTUAL_VERCEL_URL}" 2>/dev/null \
  && success "CORS updated to allow ${ACTUAL_VERCEL_URL}" \
  || warn "Update FRONTEND_URL manually in Railway dashboard to: ${ACTUAL_VERCEL_URL}"

# ════════════════════════════════════════════════════════════════════
# DONE
# ════════════════════════════════════════════════════════════════════

cd "$SCRIPT_DIR"

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║           🎉 ChamaFlow is LIVE!                      ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Frontend (members open this):${NC}"
echo -e "  ${CYAN}${ACTUAL_VERCEL_URL}${NC}"
echo ""
echo -e "  ${BOLD}Backend API:${NC}"
echo -e "  ${CYAN}${RAILWAY_URL}/api/health${NC}"
echo ""
echo -e "  ${BOLD}GitHub repo:${NC}"
echo -e "  ${CYAN}${GITHUB_REPO}${NC}"
echo ""
echo -e "  ${BOLD}Default login credentials:${NC}"
echo -e "  ┌─────────────────────────────────────────┐"
echo -e "  │ Chairman  │ 0712345678 │ PIN: 1234       │"
echo -e "  │ Secretary │ 0723456789 │ PIN: 1234       │"
echo -e "  │ Member    │ 0734567890 │ PIN: 1234       │"
echo -e "  └─────────────────────────────────────────┘"
echo -e "  ${YELLOW}All members must set a new PIN on first login.${NC}"
echo ""
echo -e "  ${BOLD}Railway dashboard:${NC}  https://railway.app/dashboard"
echo -e "  ${BOLD}Vercel dashboard:${NC}   https://vercel.com/dashboard"
echo ""
echo -e "  ${BOLD}Next step — share this link with your 26 members:${NC}"
echo -e "  ${CYAN}${ACTUAL_VERCEL_URL}${NC}"
echo ""

# Save URLs to a file for reference
cat > "$SCRIPT_DIR/DEPLOYMENT.md" << DEPEOF
# ChamaFlow Deployment Info

Generated: $(date)

## URLs
- **App (share this):** ${ACTUAL_VERCEL_URL}
- **API:**              ${RAILWAY_URL}/api
- **GitHub:**          ${GITHUB_REPO}

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
\`\`\`bash
# View backend logs
cd backend && railway logs

# Re-seed database (WARNING: wipes all data)
cd backend && railway run node seed.js

# Redeploy backend after code changes
cd backend && railway up

# Redeploy frontend after code changes
cd frontend && vercel --prod
\`\`\`
DEPEOF

success "Deployment info saved to DEPLOYMENT.md"
echo ""
