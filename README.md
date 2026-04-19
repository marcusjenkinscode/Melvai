# Melvai
Melvai.com website Melvin AI which will be a customisable agent using ollama based models through a terminal based system in site using commands that are easy to use with interactive menus and toilet and lolcat style ASCI banners throughout and interactive features showing next flow in the website.

## Quick Install (Ubuntu Server)

Clone the repo and run the one-liner installer as root.  Pass your public domain
(or IP) as the first argument — the script configures Nginx, Ollama, and the
Node API server automatically.

```bash
git clone https://github.com/marcusjenkinscode/Melvai.git
cd Melvai
sudo bash install.sh yourdomain.com
```

What `install.sh` does:
1. Cleans any conflicting Node.js / Ollama / Nginx installs.
2. Installs Node.js 20 LTS, Ollama, Nginx, PM2, `toilet`, and `lolcat`.
3. Pulls the `llama3.2` base model and creates the custom **Melvin** model.
4. Installs npm dependencies and builds the React frontend.
5. Writes `server/.env` with your domain and production settings.
6. Configures Nginx as a reverse proxy (port 80 → Node on 3000).
7. Starts the API server with PM2 (auto-restarts on reboot).
8. Restricts the firewall so Ollama and Node are internal-only.

After the script finishes, the site is live at `http://yourdomain.com` and the
Melvin AI terminal is connected and ready.  If you have a domain and want HTTPS:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

See `DEPLOYMENT_GUIDE.md` for the full development and production deployment guide.
