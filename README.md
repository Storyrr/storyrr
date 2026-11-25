<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
    <img alt="Storyrr" src="docs/assets/logo-light.svg" width="360">
  </picture>
</p>

A self-hosted request manager for **audiobooks and eBooks (including manga and comics)**, in the spirit of Seerr, for the book side of a homelab. Invited users search, request and follow their requests; admins approve them and choose where each item lands. Storyrr hands requests to [Chaptarr](https://github.com/Chaptarr/chaptarr) and checks availability in [Audiobookshelf](https://www.audiobookshelf.org/), [Kavita](https://www.kavitareader.com/), [Komga](https://komga.org/) and [Jellyfin](https://jellyfin.org/).

- **Search and discover** audiobooks (Audible's catalog) and eBooks, manga and comics ([Hardcover](https://hardcover.app/)), with series, authors, genres and readers' ratings.
- **Requests with approval:** per-user permissions and limits, auto-approval, a blocklist, and the target Chaptarr folder chosen per request.
- **Availability** from your media servers' libraries and Chaptarr's imports, with issues to report a wrong edition or language.
- **Sign in with a media server** (Audiobookshelf, Kavita, Komga, Jellyfin) or import its users; accounts are invite-only.
- **Notifications** by email, Discord, Slack, Telegram, ntfy, Gotify, Pushover, Pushbullet, webhook and Web Push.
- English, French, German and Spanish; installable as an app on phones.

> **Status: pre-release.** The v1 features work; expect changes until 1.0. See the [v1 spec](docs/SPEC.md).

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

Then open the URL: the first visit runs the setup wizard, which creates the administrator account. Connect Chaptarr, your media servers and a Hardcover token in Settings afterwards. There is no public sign-up; the administrator creates or imports the other accounts.

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
| `bun run db:generate` | Generate a migration from `src/server/db/schema/`                    |

Contributor and agent guidelines (stack, architecture, conventions, commit format): [AGENTS.md](AGENTS.md).
