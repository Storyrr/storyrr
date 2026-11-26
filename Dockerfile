# syntax=docker/dockerfile:1

# Build and runtime share the same Node image (glibc): better-sqlite3 ships
# prebuilt N-API binaries and Nitro copies them with the server, so the
# runtime must be able to load the build's. Bun is only the package manager /
# script runner.
ARG NODE_VERSION=24
ARG BUN_VERSION=1.3

# The build runs on the builder's own platform, never emulated: its output is
# the same for every platform (JavaScript, plus better-sqlite3's prebuilt
# binaries for all of them), so only the small runtime stage is per platform.
FROM --platform=$BUILDPLATFORM oven/bun:${BUN_VERSION}-slim AS bun

FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# Compiles the Paraglide messages (fetches the pinned inlang plugin), then builds.
RUN bun run build && mkdir /data

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=6066 \
    DATABASE_URL=/data/storyrr.db
WORKDIR /app
# Nitro's output carries its traced dependencies, including better-sqlite3's binary.
COPY --from=build /app/.output ./.output
# Applied automatically at startup.
COPY --from=build /app/drizzle ./drizzle
# The data folder, owned by the runtime user. Copied rather than created with RUN,
# so no command runs in this stage and other platforms build without emulation.
COPY --from=build --chown=node:node /data /data
USER node
VOLUME /data
EXPOSE 6066
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", ".output/server/index.mjs"]
