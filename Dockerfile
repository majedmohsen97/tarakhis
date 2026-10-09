# One container serves the API, the gate-pass verification page and the web version of the app.
# Build:  docker build -t tarakhis .
# Run:    docker run -p 4000:4000 -v tarakhis-data:/data -e JWT_SECRET=... -e PUBLIC_URL=https://... tarakhis

# 1) Build the web app (Expo export)
FROM node:24-slim AS web
ENV CI=1 EXPO_NO_TELEMETRY=1
WORKDIR /app/mobile
COPY mobile/package.json mobile/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY mobile/ ./
RUN npx expo export -p web --output-dir dist

# 2) API server
FROM node:24-slim
ENV NODE_ENV=production \
    PORT=4000 \
    DATA_DIR=/data \
    WEB_DIST=/app/web
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/ ./
COPY --from=web /app/mobile/dist /app/web
# Database, uploaded documents, signing keys and daily backups live here — mount a persistent disk.
# (Runs as root because hosted disks such as Render's are mounted root-owned.)
RUN mkdir -p /data
VOLUME /data
EXPOSE 4000
CMD ["node", "src/index.js"]
