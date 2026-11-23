# AGENTS.md

**Storyrr**: a self-hosted request manager for **audiobooks, eBooks (incl. manga/comics) and podcasts**, in the spirit of Seerr (Overseerr/Jellyseerr) but for the book side of a homelab. Users search, request, and see when it's available; admins approve and choose where it lands.

Product spec: [docs/SPEC.md](docs/SPEC.md). GitHub: `Storyrr/storyrr`.

This file is the single source of agent instructions for every tool: `CLAUDE.md` is a symlink to it. TanStack Intent manages the block delimited by `intent-skills` comments in the _Agent skills_ section: edit around it, not inside it.

## Language

- Code, comments, commits, docs, issues: **English**.
- UI is English-first but **i18n-ready from day one**: no hard-coded user-facing string anywhere, everything goes through the message catalog (see i18n below). French is the first translation planned.

## Stack (decided)

| Concern                   | Choice                                                                                                                                                                               | Notes                                                                                                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework                 | **TanStack Start** (React 19) + TanStack Router (file routes)                                                                                                                        | Pages, SSR, server functions, server routes                                                                                                                                                                                                                                   |
| Runtime                   | **Node.js** (≥ 22) in dev and production                                                                                                                                             | `better-sqlite3` is a native Node addon and is **not supported by Bun**. Never run the app with `bun --bun`.                                                                                                                                                                  |
| Package manager / scripts | **Bun** (`bun install`, `bun run <script>`, `bunx`)                                                                                                                                  | Scripts invoke Node-based tools (Vite, drizzle-kit, Vitest)                                                                                                                                                                                                                   |
| Build / server            | Vite + **Nitro** (`nitro/vite`), Node server output                                                                                                                                  | `bun run build` → `node .output/server/index.mjs`                                                                                                                                                                                                                             |
| Client data               | **TanStack Query** (v5) with the official Router/Start SSR integration (`@tanstack/react-router-ssr-query`)                                                                          | Server functions as `queryFn`/`mutationFn`; loaders prefetch with `ensureQueryData`; components use `useSuspenseQuery`                                                                                                                                                        |
| DB                        | **SQLite** via **Drizzle ORM 1.0 RC** (`drizzle-orm/better-sqlite3`) + `drizzle-kit` migrations (`./drizzle`)                                                                        | One file in the data volume. Drizzle 1.0 is still RC: check its changelog when the lockfile moves to a newer RC. Load the Drizzle skill.                                                                                                                                      |
| Auth                      | **better-auth** (1.7) + Drizzle adapter (`better-auth/adapters/drizzle`), `admin` plugin (`better-auth/plugins`), `tanstackStartCookies` (`better-auth/tanstack-start`, last plugin) | Invite-only; generic OIDC later                                                                                                                                                                                                                                               |
| Validation                | **Valibot** (v1, Standard Schema)                                                                                                                                                    | Server function inputs, env, external API responses, forms. Chosen over zod for client bundle size (zod still sits in `node_modules` as a better-auth dependency: never import it). Drizzle table schemas → Valibot via the separate `drizzle-valibot` package if needed.     |
| UI components             | **shadcn/ui** with the official **React Aria** base (`shadcn init --base aria`, preset `aria-nova`, Lucide icons, Geist font)                                                        | Components copied into `src/components/ui/` and added with `bunx --bun shadcn@latest add <name>`. Class merging via shadcn's `cn` package (re-exported by `#/lib/utils`). No Radix.                                                                                           |
| Styling                   | **Tailwind CSS** v4                                                                                                                                                                  | Dark-first, mobile-friendly; design tokens via CSS variables (shadcn theming)                                                                                                                                                                                                 |
| Forms                     | **TanStack Form** + Valibot                                                                                                                                                          | Same Valibot schemas as the server functions they submit to (Standard Schema validators)                                                                                                                                                                                      |
| i18n                      | **Paraglide JS** (inlang)                                                                                                                                                            | TanStack maintains a Start + Paraglide example (`examples/react/start-i18n-paraglide`)                                                                                                                                                                                        |
| Tests                     | **Vitest** (unit/integration, runs on Node so the real SQLite driver works); Playwright later for E2E                                                                                | Integrations tested against fakes + recorded fixtures                                                                                                                                                                                                                         |
| Lint / format             | **oxlint** (type-aware: `typeAware` + `typeCheck`, via `oxlint-tsgolint`) + **oxfmt** (Oxc)                                                                                          | oxlint also reports TypeScript errors, so there is no separate `tsc` step (the `typescript` package stays for editors). Pin exact versions (oxfmt and tsgolint are pre-1.0). Agent skill folders (`.claude/`, `.agents/`) are excluded from lint, format and `tsconfig.json`. |
| Releases / delivery       | **release-please** (GitHub Action) + Docker image on GHCR                                                                                                                            | Versions, `CHANGELOG.md` and GitHub Release notes generated from the Conventional Commits; image built when a release is created                                                                                                                                              |

**No TanStack DB in v1 (deliberate).** It is a client-side reactive store (live queries over local collections, sync engines), still beta/RC. Storyrr's data is small and server-owned; TanStack Query covers caching, polling and optimistic updates. If a live-updating view is needed later, TanStack DB can be added on top of TanStack Query collections for that view only.

**No Elysia (deliberate).** TanStack Start covers everything v1 needs: server functions for the UI, server routes for webhooks / health / auth. Business logic lives in framework-agnostic modules (`src/server/**`), so a public REST API (e.g. Elysia mounted on a `/api/v1/$` server route) can be added later without moving code.

### Verify against installed versions before relying on them

Docs disagree or move fast on these (checked 2026-11-23); the installed package wins:

- Server function validation: `@tanstack/react-start` 1.169 exposes `createServerFn(...).validator(schema)` (no `.inputValidator`, despite better-auth's TanStack page).
- better-auth schema: generate the auth tables into our Drizzle schema with the better-auth CLI (package `auth`, same version as `better-auth`: `bunx auth@<version> generate --config src/server/auth/index.ts --output src/server/db/schema/auth.ts`), then migrate with **drizzle-kit only** (one migration history). The 1.7 CLI still emits Drizzle 0.x `relations()`, which Drizzle 1.0 removed: delete them from the output and keep relations in `src/server/db/relations.ts` (`defineRelations`). The adapter (`better-auth/adapters/drizzle`) gets the tables through its `schema` option and needs no relations unless `experimental.joins` is enabled.
- Disabling public email/password sign-up: `emailAndPassword.disableSignUp: true` (confirmed in better-auth 1.7). Admins create accounts through the `admin` plugin (`auth.api.createUser`).

## Agent skills (read before coding)

Libraries ship agent skills inside `node_modules` (TanStack Start/Router/Query/Form… use the **TanStack Intent** format). They are the up-to-date reference: **follow them over memory** when they disagree.

- Setup (done; first run is interactive, so a human runs it):
  ```bash
  bun add -D -E @tanstack/intent             # kept in devDependencies (the hooks and the block below use the installed CLI)
  bunx @tanstack/intent@latest install        # choose the packages/skills to allow (done: all); writes package.json#intent and the block below
  bunx @tanstack/intent@latest hooks install  # Claude Code hook: load the matching skill before editing
  ```
- Load the most specific skill for the task before editing (e.g. server functions, server routes, middleware, SSR, data loading, auth guards). The Claude Code hook in `.claude/settings.json` enforces it.

<!-- intent-skills:start -->

## Skill Loading

Use the repository’s installed Intent. If it is unavailable, report the missing dependency instead of downloading a replacement.
Before editing files for a substantial task:

- Run `bunx --no-install --package @tanstack/intent intent list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `bunx --no-install --package @tanstack/intent intent load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

<!-- intent-skills:end -->

- Other skills are installed with the `skills` CLI and pinned in `skills-lock.json` (committed): shadcn/ui (`bunx --bun skills add shadcn/ui`), Valibot (`open-circle/agent-skills`), Drizzle (shipped in `drizzle-kit`). Re-run `skills add` to update, and load the matching skill before working with that library.

## Architecture

Layout (`src/integrations/` from the template keeps only client-side providers such as the Query provider):

```
src/
├── routes/                 # TanStack file routes (pages + server routes)
│   ├── __root.tsx          # <html lang={getLocale()}>, layout, providers
│   ├── api/auth/$.ts       # better-auth handler (GET/POST → auth.handler(request))
│   ├── api/webhooks/chaptarr.ts
│   ├── api/health.ts
│   └── …pages (search, media/$type/$id, requests, settings, users, setup)
├── server/                 # framework-agnostic business logic, server-only
│   ├── env.ts              # Valibot-validated env (getEnv())
│   ├── db/                 # schema/ (auth.ts generated by better-auth, one file per app domain), relations.ts, client.ts (createDatabase: opens + migrates), index.ts (app instance)
│   ├── auth/               # better-auth: config.ts (createAuth factory), index.ts (app instance), middleware.ts (requireUser / requireAdmin)
│   ├── settings/           # typed settings (defineSetting + Valibot), secrets sealed with AES-256-GCM (key: HKDF of BETTER_AUTH_SECRET)
│   ├── setup.ts            # first-run wizard (creates the first admin)
│   ├── services/           # one client per external service: chaptarr, audiobookshelf, kavita, audible, hardcover, itunes
│   ├── sources/            # one module per media type: search/details/request/availability
│   ├── requests/           # request lifecycle: transitions.ts (createRequest, transitionRequest), policies; the status vocabulary and transition table are client-safe in src/lib/requests.ts
│   └── jobs/               # scheduler + jobs (availability sync, cache refresh)
├── functions/              # *.functions.ts: createServerFn wrappers called by the UI
├── integrations/           # client-side providers (TanStack Query, …) from the template
├── components/             # app components; ui/ = shadcn-style React Aria primitives
├── lib/                    # client-safe helpers: cn, auth client, queries/ (query keys + queryOptions), schemas/ (Valibot, shared by forms and server functions)
└── paraglide/              # generated, git-ignored
messages/                   # en.json (source), fr.json …
```

Rules:

- Import alias: **`#/`** (package.json `imports`, e.g. `#/server/db`). Don't introduce a second alias.
- **UI never talks to external services directly.** Pages call server functions → server functions call `src/server/**`. Server-only modules live under `src/server/` (or use the `*.server.ts` suffix) so they can't leak into the client bundle.
- **Every server function that touches private data checks the session itself** (route `beforeLoad` guards are not enough). Attach the `requireUser` / `requireAdmin` function middleware (`#/server/auth/middleware`). The root route loads `authState` (setup done? current user) into the router context for guards; pages needing a user live under the `_authed` layout route.
- **Background jobs:** TanStack Start has no documented startup/cron hook. Start an in-process scheduler (e.g. `croner`) from the custom server entry `src/server.ts` (singleton guard, so dev HMR doesn't start it twice). Jobs must be idempotent and safe to run concurrently with webhooks.
- **Media sources share one interface** so adding a type never touches the request flow:
  ```ts
  interface MediaSource {
    type: "audiobook" | "ebook" | "podcast";
    search(query: string, opts): Promise<MediaResult[]>;
    getDetails(externalId: string): Promise<MediaDetails>;
    getRequestTargets(): Promise<RequestTarget[]>; // root folders/libraries the admin can pick
    submit(request: RequestRecord): Promise<SubmitResult>; // hand to Chaptarr / Audiobookshelf
    checkAvailability(requests: RequestRecord[]): Promise<AvailabilityUpdate[]>;
  }
  ```
- External API clients validate responses with Valibot and never throw raw fetch errors at the UI: map them to typed results (`ok`, `retryable`, `auth_failed`, `not_found`, `rejected` with the upstream message).

## Integrations: hard-won pitfalls

These come from running Chaptarr, Audiobookshelf and Kavita together in production. Read before touching an integration.

### Unverified payload shapes

There is no Chaptarr / Audiobookshelf instance in development. Clients are built from the references below plus the Readarr v1 / ABS API docs, with hand-written fixtures in `src/server/services/<service>/fixtures/`. Every field or endpoint not confirmed against a real instance carries an `// UNVERIFIED:` comment saying what was assumed; when a real response proves it, replace the fixture with a sanitized recording (no hostnames, keys, personal paths or library contents) and remove the comment.

### Chaptarr (audiobooks + eBooks, Readarr v1 API shape)

- Auth: `X-Api-Key` header. The API key can change after Chaptarr's first-run setup: surface 401s clearly ("re-check the API key"), never as a generic failure.
- **Always send the write scope** on author writes: `POST /api/v1/author?mediaType=ebook|audiobook` and `PUT /api/v1/author/{id}?mediaType=…`. Chaptarr maps legacy single-format fields (`rootFolderPath`, `qualityProfileId`, `metadataProfileId`) onto that scope; without it, an eBook add is treated as audiobook and fails with _"Default audiobook root folder '/books' is not compatible with audiobook imports"_.
- Prefer the **per-media fields** (`audiobookRootFolderPath`, `ebookRootFolderPath`, `audiobookQualityProfileId`, `ebookMetadataProfileId`, `audiobookMonitorExisting`, …) over the legacy ones.
- Root folders: `GET /api/v1/rootfolder`, each has `folderType` (**1 = audiobook, 2 = eBook, 3 = mixed**) and per-media defaults. Only offer folders compatible with the requested format.
- Never monitor a whole author for a one-book request: add the author with "monitor existing: none/selected", then monitor and search only the requested book (`PUT /api/v1/book/monitor`, `POST /api/v1/command {"name":"BookSearch","bookIds":[…]}`).
- Audiobook lookup by ASIN: `GET /api/v1/book/lookup?term=az:<ASIN>&mediaType=audiobook`.
- Chaptarr may pick a foreign-language edition if its metadata profile allows all languages: show the edition/language it resolved, don't assume.
- Webhook (Settings → Connect → Webhook, POST): token in the URL query, compared in constant time; on import events, run the availability check for the affected request instead of trusting the payload.
- Reference implementation for payload shapes: Stackarr `stackarr/chaptarr.py` (MIT), including the media-scope fix (katalyst88/stackarr#6).

### Audiobookshelf (audiobook availability, podcasts)

- Use an **API key** (Settings → API Keys, admin user) for server-to-server calls. Do **not** store user session tokens: on recent versions (2.26+) they expire quickly and break background calls with 401.
- In Docker the server listens on **port 80 inside the container**, whatever port is published on the host.
- **Ownership must be matched by ASIN.** Titles/authors in libraries are often wrong (narrator as author, "T01-…" folder-derived titles). Fall back to normalized title+author only when no ASIN exists, and treat that as "probably owned".
- ABS proxies metadata providers (`/api/search/books?title=&author=&provider=audible.fr`) and podcast search: reuse instead of re-implementing where convenient.
- Podcasts: requesting = creating the podcast in a podcast library from its RSS feed with auto-download enabled. Confirm the exact create endpoint/body against the installed ABS version.
- The library's "metadata provider" setting matters (Google Books by default, Audible is far better for audiobooks).

### Kavita (eBook availability)

- Use a dedicated **Auth Key** (Settings → Account → Auth Keys / OPDS → + New), authenticate with `POST /api/Plugin/authenticate?apiKey=…&pluginName=Storyrr` to get a JWT, then query libraries/series.
- Kavita libraries map 1:1 to Chaptarr eBook root folders (Books, Manga, Comics): use that to compute availability per folder.

### Metadata

- Audiobooks: **Audible's catalog API**, called directly (`https://api.audible.<tld>/1.0/catalog/products`, no key; region configurable, default `fr`) for search and details. Decided over ABS's provider proxy so search works without Audiobookshelf; Audnexus only looks up by ASIN, so it can't search. The API is undocumented: validate every response with Valibot and degrade to "no results" with a logged reason. ASIN is the primary key.
- eBooks: Hardcover (GraphQL, personal token) and/or Open Library (no key). ISBN/Hardcover id as keys.
- Podcasts: iTunes Search API (`media=podcast`), feed URL as key.
- Cache metadata in SQLite with a TTL; never block a page on a slow provider (show cached + refresh in background).

## Conventions

- TypeScript `strict` (already on), no `any` at module boundaries. Env parsed once with Valibot (`getEnv()`), fail fast with a clear message.
- Data fetching: one query-key factory per domain (`requestKeys.list(filters)`, `mediaKeys.detail(type, id)`, …); every mutation invalidates the keys it affects; optimistic updates for approve/deny/cancel with rollback on error; request statuses poll (`refetchInterval`) only while something is in flight.
- Server modules export factories that take their dependencies (`createDatabase(file)`, `createAuth(db, env)`, services taking `db`/`auth`) next to the app singletons in `index.ts`, so tests run against an in-memory database (`createDatabase(":memory:")`) without env.
- Server-only code never imported from components. Secrets never reach the client or logs; logs redact tokens and API keys.
- DB: every schema change is a drizzle-kit migration committed with the code (`./drizzle`); migrations run automatically at startup. `db:push` is for throwaway local experiments only.
- Request status is a **state machine** (`pending → approved → submitted → available`, plus `denied`, `failed`, `cancelled`); all transitions go through one module, with a history row per transition.
- i18n: user-facing text only through Paraglide messages (`m.some_key()`), keys in `messages/en.json` first. Dates, numbers, durations via `Intl`. No string concatenation for sentences.
  - Import messages from `#/paraglide/messages.js` and the runtime (`getLocale`, `setLocale`) from `#/paraglide/runtime.js`. `src/paraglide/` is generated by the Vite plugin in dev/build and by `bun run i18n:compile` (run by `check`, so lint sees fresh types).
  - No locale in URLs: strategy `cookie → preferredLanguage → baseLocale` (set in both `vite.config.ts` and the `i18n:compile` script; keep them in sync). A per-user locale is applied by setting the Paraglide cookie.
  - Add a locale to `project.inlang/settings.json` `locales` together with its `messages/<locale>.json`. The inlang message-format plugin is loaded from jsDelivr (pinned version), so compiling needs network access.
- UI: compose from the shared components in `src/components/ui/` (shadcn, React Aria base); add new ones with the shadcn CLI instead of hand-writing primitives, and load the shadcn skill (`bunx --bun skills add shadcn/ui`) before UI work. Don't hand-edit vendored components unless needed; lint exceptions for them live in `.oxlintrc.json` overrides. Forms always use TanStack Form with the Valibot schema of the target server function; show server-side validation errors on the matching fields.
- Accessibility: rely on React Aria for focus management, keyboard interaction and ARIA; every input labelled; contrast checked in both themes.
- Before pushing: `bun run check` must pass. It compiles the Paraglide messages, then runs `oxfmt --check`, `oxlint --deny-warnings` (lint + type check) and `vitest run`. Format with `bun run format` (oxfmt), never by hand-aligning code.
- Tests: Vitest (`vitest.config.ts`, separate from the app's Vite config), files next to the code as `*.test.ts`. Run with `bun run test`, **never `bun test`** (Bun's own runner can't load `better-sqlite3`). Prefer pure functions that take their inputs (e.g. `parseEnv(source)`) over tests that patch globals.
- Config lives in the repo (`.oxlintrc.json`, oxfmt config): fix the code rather than disabling a rule; any disabled rule gets a comment explaining why.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), in English: `<type>(<optional scope>): <description>`, then an optional body and an optional footer, each after a blank line.

- **Types:** `feat` (add, change or remove a user-facing feature), `fix` (bug fix), `refactor` (restructure without behavior change), `perf` (performance-only refactor), `style` (formatting only), `test`, `docs` (documentation only), `build` (tooling, dependencies, version), `ops` (CI/CD, Docker, deployment), `chore` (anything else: initial commit, `.gitignore`, …).
- **Scopes** (optional, never an issue number): `requests`, `search`, `media`, `auth`, `users`, `settings`, `jobs`, `db`, `ui`, `i18n`, `chaptarr`, `audiobookshelf`, `kavita`, `metadata`, `podcasts`, `deps`.
- **Description:** imperative present tense ("add", not "added"/"adds"; read it as "this commit will …"), lowercase first letter, no trailing period, concise.
- **Body:** the motivation and how behavior differs from before, imperative tense.
- **Footer:** issue references (`Closes #12`) and breaking changes.
- **Breaking changes:** `!` before the `:` (`feat(api)!: remove status endpoint`) plus a `BREAKING CHANGE: <what changes and how to migrate>` footer when the description isn't enough. Changing a DB schema in a way that needs manual migration, an env variable, or a public route counts.
- Merge and revert commits keep git's default messages. The initial commit is `chore: init`.
- **Versioning** (SemVer, computed by release-please from the commits): a breaking change bumps the major, a `feat` the minor, anything else the patch. Before 1.0, a breaking change only bumps the minor (`bump-minor-pre-major`). Commit messages are the release notes: write them for users. If PRs are squash-merged, the PR title must follow the same format.
- One logical change per commit; `bun run check` passes on every commit.

Examples: `feat(requests): let admins pick the target root folder`, `fix(chaptarr): send the media write scope on author updates`, `build(deps): bump drizzle-orm to 1.0.0-rc.7`, `ops: publish the Docker image on tags`.

## Releases

Managed by [release-please](https://github.com/googleapis/release-please) in `.github/workflows/release.yml`; `.github/workflows/ci.yml` runs `bun run check` and a Docker build on every PR and push to `main`:

- On every push to `main`, release-please opens or updates a **release PR** with the next version, the `CHANGELOG.md` update and the `version` bump in `package.json`. Merging it creates the `vX.Y.Z` tag and the GitHub Release with generated notes. Never bump versions or edit `CHANGELOG.md` by hand.
- Config in the repo: `release-please-config.json` (release type `node`, `bump-minor-pre-major: true`, changelog sections: Features, Bug Fixes, Performance, Reverts visible; refactor/docs/test/build/ops/style/chore hidden) and `.release-please-manifest.json` (current version).
- **Pitfall:** a tag or release created with the default `GITHUB_TOKEN` does **not** trigger other workflows. Build and push the Docker image **in the same workflow**, in a job that runs only when the release-please step reports `release_created` (or use a GitHub App token). A separate `on: push: tags` workflow would never run.
- Repository settings it needs: Settings → Actions → General → Workflow permissions → **Allow GitHub Actions to create and approve pull requests**. Release PRs opened with `GITHUB_TOKEN` don't trigger CI either: their content (version + changelog) is generated, the code was already checked on `main`.
- Image tags: `X.Y.Z`, `X.Y`, `latest` on GHCR (`ghcr.io/storyrr/storyrr`), for `linux/amd64` and `linux/arm64`. The app shows its version (from `package.json`) in Settings → About.

## Deployment

- Single Docker image (`ghcr.io/storyrr/storyrr`), multi-stage build (Bun to install/build, **Node** to run `.output/server/index.mjs`), runs as non-root, `/data` volume (SQLite DB + cache), `PORT` env, `GET /api/health` for the healthcheck. `better-sqlite3` is native: build it in the same base image family as the runtime.
- Config: bootstrap values via env (base URL, auth secret, data dir); service connections are edited in the UI (stored encrypted at rest with a key derived from the auth secret).
- Must work behind a reverse proxy / Cloudflare Tunnel: honor `X-Forwarded-*`, configurable base URL, secure cookies when served over HTTPS.
- Typical homelab: same Docker network as Chaptarr / Audiobookshelf / Kavita, reached by container name and _internal_ port.
