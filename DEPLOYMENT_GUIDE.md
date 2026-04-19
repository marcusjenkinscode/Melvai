# Melvai Deployment Guide

This guide explains how to deploy **Melvai.com** (React + Vue frontend) and the **Melvin AI** terminal-style agent backed by local/remote **Ollama** models.

## 1. Architecture Overview

Melvai has three deployable parts:

1. **Web App (React + Vue)**
   - React and Vue UI modules delivered from a single site build.
   - Includes terminal-like UI, interactive menus, flow guidance, and ASCII banner rendering.
2. **API Layer**
   - Receives browser commands and orchestrates agent actions.
   - Proxies or securely forwards model requests to Ollama.
3. **Model Runtime (Ollama)**
   - Hosts configured models (for example `llama3`, `mistral`, etc.).
   - Can run on the same host as API (small environments) or on dedicated GPU hosts.

Recommended production flow:

```text
Browser (React/Vue) -> API Service -> Ollama Runtime -> API -> Browser
```

## 2. Prerequisites

- Linux server(s) for API/web hosting (Ubuntu 22.04+ recommended)
- Optional GPU server for Ollama model inference
- Docker + Docker Compose (recommended for consistent deployments)
- Domain + DNS access for `melvai.com`
- TLS certificate management (Let's Encrypt or cloud-managed certs)

## 3. Environment Variables

Define environment variables before build/deploy.

### Web App

- `APP_ENV` (`development|staging|production`)
- `API_BASE_URL` (public base URL for API)
- `TERMINAL_FEATURES_ENABLED` (`true|false`)
- `ASCII_BANNER_STYLE` (example: `toilet-lolcat`)

### API Service

- `PORT` (example: `8080`)
- `NODE_ENV` (`production`)
- `CORS_ORIGIN` (example: `https://melvai.com`)
- `OLLAMA_BASE_URL` (example: `http://ollama:11434`)
- `OLLAMA_DEFAULT_MODEL` (example: `llama3`)
- `OLLAMA_MODEL_ALLOWLIST` (comma-separated models)
- `API_RATE_LIMIT_PER_MINUTE` (example: `60`)
- `SESSION_SECRET` (strong random secret)

### Ollama Host

- `OLLAMA_HOST` (example: `0.0.0.0:11434`)
- `OLLAMA_KEEP_ALIVE` (example: `30m`)

## 4. Local Development Deployment

1. Install dependencies for each app/service package in the repository.
2. Install Ollama on your local machine:
   - https://ollama.com/download
3. Pull required models:
   ```bash
   ollama pull llama3
   ollama pull mistral
   ```
4. Start Ollama:
   ```bash
   ollama serve
   ```
5. Start API service with development environment variables.
6. Start React/Vue web app in development mode.
7. Validate:
   - Website loads terminal UI and interactive menus.
   - ASCII banners render correctly.
   - Commands invoke API and receive model responses.

## 5. Production Deployment (Docker Compose Example)

> Use this as a baseline template; adjust image names/paths to match the repo structure.

```yaml
version: "3.9"
services:
  web:
    image: ghcr.io/<org>/melvai-web:latest
    restart: unless-stopped
    environment:
      APP_ENV: production
      API_BASE_URL: https://api.melvai.com
      TERMINAL_FEATURES_ENABLED: "true"
      ASCII_BANNER_STYLE: toilet-lolcat
    ports:
      - "3000:3000"
    depends_on:
      - api

  api:
    image: ghcr.io/<org>/melvai-api:latest
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 8080
      CORS_ORIGIN: https://melvai.com
      OLLAMA_BASE_URL: http://ollama:11434
      OLLAMA_DEFAULT_MODEL: llama3
      OLLAMA_MODEL_ALLOWLIST: llama3,mistral
      API_RATE_LIMIT_PER_MINUTE: 60
      SESSION_SECRET: REPLACE_WITH_STRONG_SECRET
    ports:
      - "8080:8080"
    depends_on:
      - ollama

  ollama:
    image: ollama/ollama:latest
    restart: unless-stopped
    volumes:
      - ollama_data:/root/.ollama
    ports:
      - "11434:11434"

volumes:
  ollama_data:
```

Deployment steps:

1. Build and publish web/API images.
2. Copy compose file and `.env` to server.
3. Start services:
   ```bash
   docker compose pull
   docker compose up -d
   ```
4. Pull required models in container/host:
   ```bash
   docker exec -it <ollama-container> ollama pull llama3
   ```
5. Configure reverse proxy (Nginx/Caddy/Cloud LB) for:
   - `melvai.com` -> web service
   - `api.melvai.com` -> API service

## 6. Reverse Proxy + TLS

- Enforce HTTPS for all traffic.
- Enable HSTS.
- Restrict API CORS to trusted domains.
- Set request body/timeout limits for streaming model responses.
- Ensure WebSocket/streaming support if terminal output streams token-by-token.

## 7. Security Checklist

- Keep Ollama private to internal network where possible.
- Never expose unrestricted model execution endpoints publicly.
- Add API authentication for privileged terminal commands.
- Add rate limiting and abuse detection.
- Sanitize/validate user commands before model/tool execution.
- Store secrets in a secret manager (not plain files in repo).

## 8. Observability & Operations

- Centralize logs for web, API, and Ollama.
- Track key metrics:
  - Request latency
  - Token generation time
  - Error rate
  - Concurrent sessions
- Add health checks:
  - `/health` on API
  - model availability checks on Ollama
- Set alerts for high latency, crash loops, and disk usage.

## 9. Rollout Strategy

1. Deploy to **staging** first.
2. Run smoke tests:
   - home page load
   - terminal command execution
   - model switch via interactive menu
   - banner rendering and next-flow prompts
3. Deploy to production with canary/gradual rollout.
4. Monitor metrics and logs for regressions.
5. Roll back to previous images if needed.

## 10. Post-Deployment Verification

- Confirm `melvai.com` and `api.melvai.com` are healthy.
- Validate command workflows in terminal UI.
- Validate banner styles and interactive next-step guidance.
- Confirm selected Ollama models are available and responding.
- Verify no critical errors in logs after first traffic spike.

## 11. Quick Troubleshooting

- **Model not found**: pull the model on Ollama host and update allowlist.
- **CORS blocked**: align `CORS_ORIGIN` with deployed web domain.
- **Slow responses**: move Ollama to GPU host or reduce model size.
- **Web/API cannot connect**: verify `API_BASE_URL` and proxy routing.
- **Terminal UI freeze**: confirm streaming endpoint timeouts are not too aggressive.

---

For every release, update this guide if infrastructure, domains, model strategy, or service topology changes.
