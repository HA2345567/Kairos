# Reproducible Kairos build/runtime image.
# The Bun version is pinned in both this image tag and .bun-version.
FROM oven/bun:1.4.2 AS base

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates openssl busybox \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

FROM base AS dependencies

COPY package.json bun.lock ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN bun install --frozen-lockfile

FROM dependencies AS build

COPY . .
ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}
RUN bun run build

FROM base AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    KAIROS_SERVICE=backend

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/frontend/dist ./frontend/dist
# Bun bundles PGlite's runtime URLs relative to the backend bundle. Keep the
# WASM/data assets beside index.js so the offline/test-mode image can boot too.
COPY --from=dependencies /app/node_modules/@electric-sql/pglite/dist/pglite.data ./backend/dist/pglite.data
COPY --from=dependencies /app/node_modules/@electric-sql/pglite/dist/pglite.wasm ./backend/dist/pglite.wasm

RUN mkdir --parents /app/backend/data

EXPOSE 3001 8080

# Default: API service. Set KAIROS_SERVICE=frontend to serve the built SPA
# with the system busybox server on port 8080 instead.
CMD ["sh", "-c", "if [ \"$KAIROS_SERVICE\" = \"frontend\" ]; then exec busybox httpd -f -p 8080 -h /app/frontend/dist; else exec bun /app/backend/dist/index.js; fi"]
