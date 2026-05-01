# Clawtask — Production Deployment

Self-hosted task tracker for AI agent workflows.
Target: `clawtask.swrks.sh` · container-hosted · Tailscale-accessible.

---

## Architecture

```
Tailscale / nginx (TLS termination)
         │
         └── clawtask container  (Next.js, port 3000)
                    │
                    ├── SQLite  (/data/clawtask.db — mounted volume)
                    ├── SSE     (real-time UI updates, in-process)
                    └── WebSocket outbound  ──▶  OpenClaw gateway (ws://mac-mini:2222)
```

No external database. No Redis. Single container.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `CLAWTASK_PUBLIC_URL` | **Yes in prod** | `http://localhost:3333` | Public-facing base URL. Injected into agent wake prompts so agents can call back. Set to `https://clawtask.swrks.sh`. |
| `NODE_ENV` | Yes | `development` | Set to `production` for the built image. |
| `PORT` | No | `3000` | Port Next.js listens on inside the container. |
| `HOME` | No | `/root` | Controls where the device keypair is stored (`$HOME/.clawtask/gateway-device-key.pem`). Override if running as non-root. |

> **Note:** The OpenClaw gateway URL (`ws://...`) is stored in the SQLite database (configurable via Settings → OpenClaw Adapter). It does NOT need to be an env var — the UI controls it at runtime.

---

## Data Volume

All persistent state lives at `/data/clawtask.db` inside the container.

Mount a named volume or host path:

```yaml
volumes:
  - clawtask_data:/data
```

Override the DB location by setting `DB_DIR` in `src/db/db.ts` or by symlinking. Currently hardcoded to `~/.clawtask/clawtask.db` — the recommended approach is to set `HOME=/data` so `~/.clawtask/clawtask.db` resolves to `/data/.clawtask/clawtask.db`.

---

## Dockerfile

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache python3 make g++

WORKDIR /app

ENV NODE_ENV=production
ENV HOME=/data
ENV PORT=3000

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Schema is loaded from process.cwd()/src/db/schema.sql at runtime
COPY --from=builder /app/src/db/schema.sql ./src/db/schema.sql

EXPOSE 3000

CMD ["node", "server.js"]
```

> **Prerequisite:** Enable Next.js standalone output. Add to `next.config.js`:
> ```js
> const nextConfig = {
>   output: 'standalone',
>   // ... rest of config
> };
> ```

---

## Docker Compose

```yaml
version: '3.9'

services:
  clawtask:
    image: clawtask:latest
    build:
      context: .
      dockerfile: Dockerfile
    container_name: clawtask
    restart: unless-stopped
    ports:
      - "3000:3000"          # expose to nginx/Tailscale only; do not bind to 0.0.0.0 publicly
    environment:
      NODE_ENV: production
      CLAWTASK_PUBLIC_URL: https://clawtask.swrks.sh
      HOME: /data
      PORT: "3000"
    volumes:
      - clawtask_data:/data
    networks:
      - clawtask_net

volumes:
  clawtask_data:

networks:
  clawtask_net:
    driver: bridge
```

---

## nginx (Tailscale TLS termination)

Clawtask uses **SSE** for real-time updates. nginx must be configured to disable buffering on the SSE endpoint.

```nginx
server {
    listen 443 ssl;
    server_name clawtask.swrks.sh;

    # TLS — handled by Tailscale cert or Let's Encrypt
    ssl_certificate     /etc/ssl/clawtask.swrks.sh.crt;
    ssl_certificate_key /etc/ssl/clawtask.swrks.sh.key;

    # SSE — must disable buffering
    location /api/v1/sse {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_buffering    off;
        proxy_cache        off;
        proxy_read_timeout 3600s;
        chunked_transfer_encoding on;
    }

    # Everything else
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}

# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name clawtask.swrks.sh;
    return 301 https://$host$request_uri;
}
```

---

## Tailscale Setup

Clawtask should be accessible only over Tailnet — no public internet exposure needed.

```bash
# On the host running the container:
tailscale up --advertise-routes=<container-subnet-if-needed>

# Or simply bind nginx to the Tailscale IP:
# listen <tailscale-ip>:443 ssl;
```

The OpenClaw gateway on the Mac Mini is already on Tailnet at `mac-mini.tail-xxxx.ts.net`. Set the gateway URL in Settings → OpenClaw Adapter to:
```
ws://mac-mini.tail-xxxx.ts.net:2222
```

---

## First-Run Checklist

1. **Build and start** the container.
2. Open `https://clawtask.swrks.sh` in browser.
3. Go to **Settings → General** — set App Name, your display name.
4. Go to **Settings → OpenClaw Adapter** — set the gateway URL to your Mac Mini's Tailscale address.
5. Go to **Settings → Agents** — register each OpenClaw agent (e.g. `main` → `clawdio`). Copy the API key once.
6. *(Optional)* Go to **Settings → External Systems** — register any external callers (e.g. Temporal, cron webhooks).
7. Create a test task, assign to an agent, verify it picks up and posts comments.

---

## Known Constraints

- **Single-user, no auth.** Designed for private Tailnet access. Do not expose publicly without adding auth middleware.
- **No horizontal scaling.** The SSE broadcaster and adapter singleton are in-process. One container only.
- **Stuck tasks.** If the container restarts mid-task, the task stays `in_progress`. Reset via Cancel or `PATCH /api/v1/tasks/:id` with `{ "status": "todo" }`. A recovery sweep on startup is on the roadmap.
- **Gateway reconnect.** The adapter reconnects automatically on WS drop, but any in-flight task is lost. Cancel and reassign.
- **SQLite WAL.** Volume must be on a filesystem that supports WAL mode (standard ext4/xfs fine; NFS may not be).

---

## Upgrading

```bash
docker pull clawtask:latest        # or rebuild
docker compose down
docker compose up -d
```

Data volume persists across upgrades. Schema migrations run automatically on startup.

---

## Backup

```bash
# Snapshot the SQLite DB (safe while running due to WAL)
docker exec clawtask sqlite3 /data/.clawtask/clawtask.db ".backup '/data/.clawtask/clawtask.backup.db'"
docker cp clawtask:/data/.clawtask/clawtask.backup.db ./clawtask-$(date +%Y%m%d).db
```

Or mount the volume to a backup container and run `sqlite3 .backup` on a cron.
