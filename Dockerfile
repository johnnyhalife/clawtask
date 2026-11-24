# ── Build ─────────────────────────────────────────────────────────────────────
FROM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS runner

RUN apk add --no-cache sqlite

WORKDIR /app

ENV NODE_ENV=production
ENV HOME=/data
ENV PORT=3000

# Standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Schema needed at runtime (loaded from process.cwd()/src/db/schema.sql)
COPY --from=builder /app/src/db/schema.sql ./src/db/schema.sql

VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "server.js"]
