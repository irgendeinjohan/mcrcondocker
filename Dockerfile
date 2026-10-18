# syntax=docker/dockerfile:1.7
# Multi-Stage-Build, Multi-Arch (linux/amd64, linux/arm64).
# Keine nativen Node-Module → Build-Stufen laufen auf der Build-Plattform,
# nur die schlanke Laufzeitstufe ist plattformabhängig.

ARG NODE_VERSION=24

# --- 1) Frontend + Backend bauen -------------------------------------------
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.server.json tsconfig.web.json vite.config.ts ./
COPY src ./src
RUN npm run build

# --- 2) nur Laufzeit-Abhängigkeiten --------------------------------------------
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# --- 3) Laufzeit ---------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine
RUN apk add --no-cache su-exec tini \
  && mkdir -p /data \
  && chown node:node /data
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATA_DIR=/data
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/server/index.js"]
