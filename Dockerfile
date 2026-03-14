# syntax=docker/dockerfile:1

# ── Stage 1: build the Vite client ───────────────────────────────────────────
FROM node:20-alpine AS client
WORKDIR /app

COPY package*.json ./
COPY area-tactics/ ./area-tactics/
COPY server/package.json ./server/
COPY src/ ./src/
COPY public/ ./public/
COPY scripts/ ./scripts/
COPY MANUAL.md index.html vite.config.ts ./

RUN npm ci
# VITE_SERVER_URL is intentionally left unset here — the server injects the
# real URL at runtime via its /config.js route (SERVER_URL env var).
RUN npm run build


# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Build tools needed for native addons (better-sqlite3)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY area-tactics/ ./area-tactics/
COPY server/ ./server/

RUN npm ci --omit=dev

# Copy the built client into the directory the server will serve statically
COPY --from=client /app/dist ./public

EXPOSE 3000

ENV STATIC_DIR=/app/public
# Set SERVER_URL at container runtime to control what URL the client connects to.
# Defaults to same-origin (window.location.origin) when left empty.
ENV SERVER_URL=

CMD ["node", "--import", "tsx/esm", "server/src/index.ts"]
