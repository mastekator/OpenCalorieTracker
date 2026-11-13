# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /src
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm -r build \
 # Production deps are installed here, for the target platform (native modules, ADR-0002).
 # --legacy: pnpm 10 deploy without inject-workspace-packages.
 && pnpm --filter @oct/server deploy --prod --legacy /out \
 # Keep the image under 200 MB: drop SQLite sources, prebuilds for other platforms and typings.
 && for d in $(find /out/node_modules -type d -path '*/node_modules/better-sqlite3'); do \
      rm -rf "$d/deps" "$d/src" && find "$d/prebuilds" -type f ! -name 'linuxmusl-*' -delete; \
    done \
 && find /out/node_modules -type f \( -name '*.d.ts' -o -name '*.d.cts' -o -name '*.d.mts' -o -name '*.map' \) -delete

# Alpine, not slim: node:24-slim is ~230 MB unpacked, over the 200 MB budget.
FROM node:24-alpine
ENV NODE_ENV=production \
    DATA_DIR=/data \
    WEB_DIST=/app/web \
    PORT=3000
WORKDIR /app/server
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
COPY --from=build /src/apps/web/dist /app/web
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/index.js"]
