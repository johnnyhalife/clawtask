# ── Build ─────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

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
