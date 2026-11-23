# syntax=docker/dockerfile:1

# Build and runtime share the same Node image so the native better-sqlite3
# addon is compiled for the Node ABI that runs it. Bun is only the package
# manager / script runner.
ARG NODE_VERSION=24
ARG BUN_VERSION=1.3

FROM oven/bun:${BUN_VERSION}-slim AS bun

FROM node:${NODE_VERSION}-bookworm-slim AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# Compiles the Paraglide messages (fetches the pinned inlang plugin), then builds.
RUN bun run build

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=/data/storyrr.db
WORKDIR /app
# Nitro's output carries its traced dependencies, including better-sqlite3's binary.
COPY --from=build /app/.output ./.output
# Applied automatically at startup.
COPY --from=build /app/drizzle ./drizzle
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", ".output/server/index.mjs"]
