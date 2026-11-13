# syntax=docker/dockerfile:1
FROM node:24-alpine3.24 AS build
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
 # pnpm does not filter optional deps by libc: drop sharp's glibc and wasm builds (Alpine uses linuxmusl-*).
 && find /out/node_modules/.pnpm -maxdepth 1 -type d \( -name '@img+sharp-linux-*' -o -name '@img+sharp-libvips-linux-*' -o -name '@img+sharp-*wasm32*' \) -exec rm -rf {} + \
 && find /out/node_modules -type f \( -name '*.d.ts' -o -name '*.d.cts' -o -name '*.d.mts' -o -name '*.map' \) -delete

# Plain Alpine plus the node binary: node:24-slim (~230 MB) and node:24-alpine with npm,
# yarn and corepack leave no room for sharp under the 200 MB budget. Same Alpine as the build stage.
FROM alpine:3.24
COPY --from=build /usr/local/bin/node /usr/local/bin/node
RUN apk add --no-cache libstdc++ \
 && addgroup -g 1000 node && adduser -u 1000 -G node -s /bin/sh -D node
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
