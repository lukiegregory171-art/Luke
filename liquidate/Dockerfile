# LIQUIDATE — deployable image. Multi-stage: build everything, then ship only
# the bundled server (server/dist), the built client (client/dist), and prod
# dependencies (ws + better-sqlite3, fetched as prebuilds). The Node server
# serves the static client and the WebSocket game on the same port.
#
# Build from the liquidate/ directory:
#   docker build -t liquidate .
#   docker run -p 8080:8080 -v liquidate-data:/data liquidate
# Then open http://localhost:8080

# --- build stage -----------------------------------------------------------
FROM node:20 AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build

# --- runtime stage ---------------------------------------------------------
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV LIQUIDATE_DB=/data/liquidate.sqlite
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
RUN mkdir -p /data
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/dist/index.js"]
