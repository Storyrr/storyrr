# Storyrr

A self-hosted request manager for **audiobooks, eBooks (including manga and comics) and podcasts**, in the spirit of Seerr, for the book side of a homelab. Invited users search, request and follow their requests; admins approve them and choose where each item lands. Storyrr hands requests to Chaptarr (audiobooks, eBooks) and [Audiobookshelf](https://www.audiobookshelf.org/) (podcasts), and checks availability in Audiobookshelf and [Kavita](https://www.kavitareader.com/).

> **Status: early development.** The first-run wizard, accounts and the app skeleton work; search and requests are being built. See the [v1 spec](docs/SPEC.md) for the roadmap.

## Run with Docker

```yaml
# compose.yaml
services:
  storyrr:
    image: ghcr.io/storyrr/storyrr:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      BETTER_AUTH_URL: https://storyrr.example.com # the URL you open Storyrr at
      BETTER_AUTH_SECRET: change-me # at least 32 random characters: openssl rand -hex 32
    volumes:
      - ./data:/data
```

Then open the URL: the first visit runs the setup wizard, which creates the administrator account. There is no public sign-up; the administrator creates the other accounts.

The SQLite database lives in `/data` (keep it on a volume); migrations run automatically at startup. `GET /api/health` reports the app version and database state, and the image uses it as its healthcheck.

### Environment

| Variable             | Required | Default            | Description                                                                       |
| -------------------- | -------- | ------------------ | --------------------------------------------------------------------------------- |
| `BETTER_AUTH_URL`    | yes      |                    | Public base URL of the app (used for sign-in redirects and cookies).              |
| `BETTER_AUTH_SECRET` | yes      |                    | At least 32 random characters. Signs sessions; also encrypts stored service keys. |
| `DATABASE_URL`       | no       | `/data/storyrr.db` | SQLite database file.                                                             |
| `PORT`               | no       | `3000`             | HTTP port inside the container.                                                   |

Behind a reverse proxy or Cloudflare Tunnel, set `BETTER_AUTH_URL` to the public `https://` URL: cookies are then marked secure.

## Development

Requirements: [Node.js](https://nodejs.org/) 22.12+ (runs the app) and [Bun](https://bun.sh/) (package manager and script runner).

```bash
bun install
cp .env.example .env.local   # then fill in BETTER_AUTH_SECRET
bun run dev                  # http://localhost:3000
```

| Script                | What it does                                                         |
| --------------------- | -------------------------------------------------------------------- |
| `bun run dev`         | Dev server with hot reload                                           |
| `bun run build`       | Production build into `.output/` (`bun run start` serves it on Node) |
| `bun run check`       | Message compile, format check, type-aware lint, tests (CI runs this) |
| `bun run format`      | Format with oxfmt                                                    |
| `bun run test`        | Vitest (use this, not `bun test`)                                    |
| `bun run db:generate` | Generate a migration from `src/server/db/schema.ts`                  |

Contributor and agent guidelines (stack, architecture, conventions, commit format): [AGENTS.md](AGENTS.md).
