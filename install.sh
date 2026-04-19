#!/usr/bin/env bash
# =============================================================================
# Melvai — Ubuntu Fresh Install Script
#
# Usage:
#   sudo bash install.sh [DOMAIN]
#
#   DOMAIN  Your public domain/IP (default: localhost).
#           Used for the Nginx server_name and CORS_ORIGIN.
#
# What this script does:
#   1.  Removes any conflicting Node / Ollama / Nginx installs.
#   2.  Installs Node.js 20 LTS, npm, Ollama, Nginx, PM2, toilet, lolcat.
#   3.  Pulls the llama3.2 base model and creates the custom Melvin model.
#   4.  Installs npm dependencies and builds the React frontend.
#   5.  Writes /etc/nginx/sites-available/melvai and enables it.
#   6.  Starts the API server with PM2 (persists across reboots).
#   7.  Prints a verification summary.
#
# Requirements:
#   - Ubuntu 20.04 / 22.04 / 24.04
#   - Run as root (sudo)
# =============================================================================

set -euo pipefail

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── .env helper: set_env KEY VALUE file ───────────────────────────────────────
# Replaces `KEY=...` in the target file (creates entry if absent).
set_env() {
  local key="$1" value="$2" file="$3"
  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

# ── Health-check retry loop ────────────────────────────────────────────────────
# wait_for_http URL [max_seconds]  — polls until HTTP 200 or timeout
wait_for_http() {
  local url="$1" max="${2:-30}" elapsed=0
  while (( elapsed < max )); do
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    if [[ "$status" == "200" ]]; then
      echo "$status"
      return 0
    fi
    sleep 2
    (( elapsed += 2 ))
  done
  echo "000"
  return 1
}

# ── Must be root ───────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  error "Please run as root: sudo bash install.sh [DOMAIN]"
  exit 1
fi

# ── Resolve paths ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$SCRIPT_DIR"
SERVER_DIR="$REPO_DIR/server"
WEB_DIR="$REPO_DIR/web"
MELVIN_DIR="$REPO_DIR/melvin"

DOMAIN="${1:-localhost}"
# Determine scheme — use https for real domains, http for bare IPs / localhost
if [[ "$DOMAIN" == "localhost" || "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  SCHEME="http"
else
  SCHEME="https"
fi
ORIGIN="${SCHEME}://${DOMAIN}"

info "═══════════════════════════════════════════════════════"
info " Melvai fresh install"
info " Repo    : $REPO_DIR"
info " Domain  : $DOMAIN"
info " Origin  : $ORIGIN"
info "═══════════════════════════════════════════════════════"

# ── 1. System update ───────────────────────────────────────────────────────────
info "Updating system packages …"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl wget gnupg2 ca-certificates lsb-release \
  build-essential git toilet lolcat
success "System packages up to date."

# ── 2. Clean previous Node.js installs ────────────────────────────────────────
info "Removing any existing Node.js / npm installs …"
apt-get remove -y -qq nodejs npm 2>/dev/null || true
apt-get autoremove -y -qq 2>/dev/null || true
rm -f /etc/apt/sources.list.d/nodesource.list
success "Old Node.js removed."

# ── 3. Install Node.js 20 LTS ─────────────────────────────────────────────────
info "Installing Node.js 20 LTS …"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
apt-get install -y -qq nodejs
NODE_VER=$(node --version)
NPM_VER=$(npm --version)
success "Node.js $NODE_VER / npm $NPM_VER installed."

# ── 4. Install / reinstall Ollama ─────────────────────────────────────────────
info "Installing Ollama …"
# Stop existing service if running
systemctl stop ollama 2>/dev/null || true
# The official installer is idempotent — safe to re-run
curl -fsSL https://ollama.com/install.sh | sh
systemctl enable ollama
systemctl start ollama
success "Ollama installed and service started."

# ── 5. Install Nginx ──────────────────────────────────────────────────────────
info "Installing Nginx …"
apt-get install -y -qq nginx
systemctl enable nginx
success "Nginx installed."

# ── 6. Install PM2 globally ───────────────────────────────────────────────────
info "Installing PM2 …"
npm install -g pm2 --loglevel=error
success "PM2 $(pm2 --version) installed."

# ── 7. Pull base model and create Melvin ──────────────────────────────────────
info "Pulling llama3.2 base model (this may take a while) …"
ollama pull llama3.2

info "Creating custom Melvin model …"
ollama create melvin -f "$MELVIN_DIR/Modelfile"
success "Melvin model ready."

# ── 8. Build the React frontend ───────────────────────────────────────────────
info "Installing web dependencies …"
cd "$WEB_DIR"
npm ci --loglevel=warn

info "Building React frontend …"
npm run build --if-present
success "Frontend built → $WEB_DIR/dist"

# ── 9. Configure API server environment ───────────────────────────────────────
info "Writing server/.env …"
cd "$SERVER_DIR"
cp .env.example .env
set_env "NODE_ENV"         "production"           .env
set_env "CORS_ORIGIN"      "${ORIGIN}"            .env
set_env "PORT"             "3000"                 .env
set_env "OLLAMA_BASE_URL"  "http://localhost:11434" .env
success "server/.env written."

# ── 10. Install server dependencies ───────────────────────────────────────────
info "Installing server dependencies …"
npm ci --loglevel=warn
success "Server dependencies installed."

# ── 11. Configure Nginx ───────────────────────────────────────────────────────
info "Writing Nginx config …"
NGINX_CONF=/etc/nginx/sites-available/melvai

cat > "$NGINX_CONF" <<NGINX_EOF
# Melvai — managed by install.sh

# Redirect HTTP → HTTPS (only when a real domain is used)
$(if [[ "$SCHEME" == "https" ]]; then
cat <<'REDIR'
server {
    listen 80;
    listen [::]:80;
    server_name DOMAIN_PLACEHOLDER;
    return 301 https://\$host\$request_uri;
}
REDIR
fi)

server {
$(if [[ "$SCHEME" == "https" ]]; then
echo "    listen 443 ssl http2;"
echo "    listen [::]:443 ssl http2;"
echo ""
echo "    # Replace the paths below with your actual certificate files."
echo "    # Certbot / Let's Encrypt will update these automatically."
echo "    ssl_certificate     /etc/ssl/certs/melvai-fullchain.pem;"
echo "    ssl_certificate_key /etc/ssl/private/melvai-privkey.pem;"
echo "    ssl_protocols       TLSv1.2 TLSv1.3;"
echo "    ssl_ciphers         HIGH:!aNULL:!MD5;"
else
echo "    listen 80;"
echo "    listen [::]:80;"
fi)

    server_name ${DOMAIN};

    # Security headers
    add_header X-Frame-Options          "SAMEORIGIN"  always;
    add_header X-Content-Type-Options   "nosniff"     always;
    add_header X-XSS-Protection         "1; mode=block" always;
    add_header Referrer-Policy          "strict-origin-when-cross-origin" always;

    # Proxy everything to Node API + React SPA
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket / streaming support
        proxy_set_header Upgrade    \$http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # Generous timeouts for streaming model responses
        proxy_read_timeout  600s;
        proxy_send_timeout  600s;
        send_timeout        600s;
    }
}
NGINX_EOF

# Fix the REDIR placeholder (sed can't handle shell conditionals cleanly above)
sed -i "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" "$NGINX_CONF"

# Enable site, disable default
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/melvai
rm -f /etc/nginx/sites-enabled/default

# Test Nginx config
if nginx -t 2>&1; then
  systemctl restart nginx
  success "Nginx configured and restarted."
else
  error "Nginx config test failed — check /etc/nginx/sites-available/melvai"
  exit 1
fi

# ── 12. Create dedicated service user and start API with PM2 ─────────────────
info "Setting up 'melvai' service user …"
if ! id melvai &>/dev/null; then
  useradd --system --create-home --shell /bin/bash melvai
  success "Created system user 'melvai'."
else
  success "System user 'melvai' already exists."
fi

# Give the melvai user ownership of the repo so it can read built assets
chown -R melvai:melvai "$REPO_DIR"

info "Starting Melvai API server with PM2 under 'melvai' user …"
# PM2 environment file path for the service user
PM2_HOME="/home/melvai/.pm2"

# Stop existing instance if any, then start fresh
sudo -u melvai PM2_HOME="$PM2_HOME" pm2 delete melvai-api 2>/dev/null || true
sudo -u melvai PM2_HOME="$PM2_HOME" pm2 start "$SERVER_DIR/index.js" \
  --name melvai-api \
  --interpreter node \
  --cwd "$SERVER_DIR"

sudo -u melvai PM2_HOME="$PM2_HOME" pm2 save

# Generate and install the systemd startup unit for the melvai user
PM2_STARTUP=$(sudo -u melvai PM2_HOME="$PM2_HOME" pm2 startup systemd -u melvai --hp /home/melvai 2>&1 | grep "sudo env" | tail -1)
if [[ -n "$PM2_STARTUP" ]]; then
  eval "$PM2_STARTUP" || true
fi
success "PM2 started under 'melvai' user and saved (persists on reboot)."

# ── 13. Firewall (ufw) ────────────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
  info "Configuring ufw firewall …"
  ufw allow OpenSSH  >/dev/null
  ufw allow 'Nginx Full' >/dev/null
  # Block external access to Ollama and Node — localhost traffic is unaffected
  ufw deny from any to any port 11434 >/dev/null 2>&1 || true
  ufw deny from any to any port 3000  >/dev/null 2>&1 || true
  ufw --force enable >/dev/null
  success "ufw configured (SSH + Nginx open; Ollama/Node external access blocked)."
fi

# ── 14. Verify ────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN} Melvai install complete!${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
echo ""

# Health check — retry for up to 30 s while Node initialises
info "Waiting for API server to become ready …"
HTTP_STATUS=$(wait_for_http "http://127.0.0.1:3000/api/health" 30 || echo "000")
if [[ "$HTTP_STATUS" == "200" ]]; then
  success "API health check: HTTP $HTTP_STATUS ✓"
else
  warn "API health check returned HTTP $HTTP_STATUS — check: pm2 logs melvai-api"
fi

info "Waiting for Ollama to become ready …"
OLLAMA_STATUS=$(wait_for_http "http://127.0.0.1:11434/api/tags" 30 || echo "000")
if [[ "$OLLAMA_STATUS" == "200" ]]; then
  success "Ollama health check: HTTP $OLLAMA_STATUS ✓"
else
  warn "Ollama not responding yet — check: systemctl status ollama"
fi

echo ""
echo -e " Website  : ${CYAN}${ORIGIN}${NC}"
echo -e " API      : ${CYAN}${ORIGIN}/api/health${NC}"
echo -e " PM2 logs : ${CYAN}pm2 logs melvai-api${NC}"
echo -e " Models   : ${CYAN}ollama list${NC}"
echo ""
if [[ "$SCHEME" == "https" ]]; then
  echo -e "${YELLOW}[TLS]${NC} For HTTPS, install certificates and update:"
  echo -e "      /etc/nginx/sites-available/melvai"
  echo -e "      Then: sudo nginx -t && sudo systemctl reload nginx"
  echo -e "      Tip:  sudo apt install certbot python3-certbot-nginx"
  echo -e "            sudo certbot --nginx -d ${DOMAIN}"
  echo ""
fi
