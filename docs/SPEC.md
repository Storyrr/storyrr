# Storyrr: product spec, v1 (MVP)

Status: draft for the first implementation. Architecture and conventions: [../AGENTS.md](../AGENTS.md).

## 1. Problem

Movies and TV have Seerr: family members search, request, and it shows up in Plex. Books don't. In a homelab with **Chaptarr** (audiobooks + eBooks), **Audiobookshelf** (audiobook player) and **Kavita** (eBook/manga/comics reader), requesting a book means asking the admin, who adds it by hand in Chaptarr and picks the right folder. Existing tools cover only part of this:

- AudioBookRequest: audiobooks only.
- Stackarr: recommendation-first, eBook handoff currently broken with separate root folders.
- Seerr book support: not merged upstream; a fork exists without Chaptarr support.

## 2. Goal

One place where invited users **search and request audiobooks and eBooks (books, manga, comics)**, with Seerr-like approval and status tracking, where **admins decide where each item lands** (which Chaptarr root folder), so files end up in the right Kavita / Audiobookshelf library.

### Non-goals for v1

- Recommendations, reading/listening tracking, ratings, social features.
- Being a downloader or indexer client: Chaptarr and Audiobookshelf do the fetching.
- Movies/TV/music.
- Podcasts: free to follow in any podcast app, so requesting them adds little (a podcast request flow into Audiobookshelf was built, then removed; see git history).
- Native mobile app (responsive web only; PWA later).
- Email/push notifications (in-app status only in v1).

## 3. Users and roles

| Role      | Can                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Admin** | everything a user can + approve/deny requests, choose target folder and quality profile, manage users, manage settings |
| **User**  | search, request, see own requests and their status                                                                     |

Permissions (decided 2026-11-24, like Seerr): besides the **Admin** role (everything), each user has a list of permissions: Manage users, Manage settings, Manage requests (implies Advanced requests, View requests and auto-approval), Advanced requests (pick folder and profile), View requests, Request audiobooks / eBooks, Auto-approve audiobooks / eBooks, Manage issues (implies Report issues), Report issues, Manage blocklist. Users without their own list get the defaults from Settings → Users (request both formats, report issues). User managers who aren't admins can't change admins' accounts or grant the Admin role. Accounts are **invite-only**: no public sign-up.

## 4. Core flows

### 4.1 First run (setup wizard)

Shown when the database has no user.

1. Create the admin account (name, email, password).
2. Connect services, each with a **Test** button and a clear error on failure:
   - Chaptarr: URL + API key (required for audiobooks and eBooks).
   - Audiobookshelf: URL + API key (audiobook availability).
   - Kavita: URL + auth key (optional, eBook availability).
   - Metadata: Audible region (default `fr`), Hardcover token (optional).
3. Defaults: default target per format (from the live lists):
   - audiobook → a Chaptarr root folder with `folderType` 1 (audiobook) or 0 (mixed);
   - eBook → a Chaptarr root folder with `folderType` 2 (eBook) or 0 (mixed);
4. Done → home.

### 4.2 Search

- One search bar, with **tabs/filters: Audiobooks, Books** (default: All).
- Result cards: cover, title, author (narrator for audiobooks), year, series badge, and a **status badge**: _Available_, _Requested_, _Processing_, or a **Request** button.
- Owned detection: audiobooks by ASIN in Audiobookshelf; eBooks via Kavita (and Chaptarr files).
- Fast: debounce, cached metadata, no blocking on slow providers.

### 4.3 Media detail page

- Cover, title, authors, narrators, series (with position), description, language, duration/pages, publication date.
- Other formats of the same work when known (e.g. "Also available as eBook").
- Request button (or current status + who requested it).

### 4.3b Navigation and Discover (decided 2026-11-24)

- Seerr-like layout: a sidebar with **Découvrir (Discover), Livres (eBooks), Livres audio (Audiobooks), Demandes (Requests), Blocages (Blocklist, admins), Problèmes (Issues), Utilisateurs (Users, admins), Paramètres (Settings, admins)**, a search bar at the top, the account menu at the top right. On phones the sidebar becomes a drawer.
- **Discover** shows horizontal rows: **Trending** (Audible bestsellers in the configured region, Hardcover's trending books), **Recent requests** (with status), **Recently added** (requests that became available).
- **Books** / **Audiobooks** pages: search and browse that type only.

### 4.3c Blocklist (decided 2026-11-24)

- Admins block a book or audiobook (from its page or a request) with an optional reason. Blocked items show as _Blocked_ in search and can't be requested. The Blocklist page lists them and unblocks.

### 4.3d Issues (decided 2026-11-24)

- Any user reports a problem on an available item: wrong language, wrong edition, missing or broken content, bad audio, other; with a comment. Admins and the reporter discuss it in comments; admins resolve or reopen it. The Issues page lists open issues first (users see their own, admins all).

### 4.4 Request modal (Seerr-like)

- **Format** (audiobook / eBook) when the work exists in both.
- **Admins only, "Advanced options"** (collapsed by default):
  - **Target folder:** select listing only compatible targets, preselected with the default for the format. E.g. eBook → Books / Manga / Comics; audiobook → Audiobooks.
  - **Quality profile** (Chaptarr) for books/audiobooks.
  - **Request as** another user (optional, later).
- Info line: "This request will be approved automatically" when the user is auto-approved.
- Non-admins request into the default target.

### 4.5 Approval

- Requests page, admin view: pending first. Each row: cover, title, format, requester, date, target folder.
- **Approve** (with the option to change target folder / quality profile first) or **Deny** (optional reason shown to the requester).
- Bulk approve.

### 4.6 Submission and status tracking

- On approval, submit to the backend:
  - audiobook/eBook → Chaptarr: ensure the author exists for that media type (with the write scope), monitor + search only the requested book, in the chosen root folder;
- Status: `pending → approved → submitted → available`; failures go to `failed` with the upstream reason and a **Retry** action.
- Availability updates from: Chaptarr webhook (import events), a periodic job (every ~15 min) checking Chaptarr files / Audiobookshelf / Kavita, and a manual "Check now".
- Every transition is recorded (who, when, from → to, message) and shown in the request history.

### 4.7 Requests page (user view)

- My requests with status, filters (all / pending / processing / available / failed), cancel while pending.

### 4.8 Users (admin)

- List, create/invite (email + temporary password; invite links later), set role, toggle auto-approve, disable/remove.
- Per-user request limits overriding the global ones (decided 2026-11-24).
- Seerr-like table (decided 2026-11-24): user (avatar, name, email), requests, role, joined; search, sortable columns, pages. **Edit** opens that user's settings (the same General / Password / Permissions tabs as one's own): admins change their name, email and language, set a new password, and edit role, auto-approval, ban and request limits there. Admins can't demote, ban or delete themselves.
- Optional link to an Audiobookshelf user (future: "already listened").

### 4.8b Account menu and profile (decided 2026-11-24)

- The avatar at the top right opens a Seerr-like menu: name and email, then Profile, Requests, Settings, Sign out.
- **Profile:** avatar, name, email, role, member since; request counts (total, audiobooks, eBooks, available) and recent requests.
- **Settings** (the user's own, tabs): **General** (display name, email read-only, display language: browser default or a fixed locale, stored per user and applied on any device), **Password** (current + new; signs out other sessions), **Permissions** (read-only: role, auto-approval, request limits left). Linked accounts and notifications come with those features.

### 4.9 Settings (admin)

Seerr-like tabs (decided 2026-11-24), label column on the left, control on the right:

- **General:** application URL (read-only, from `BETTER_AUTH_URL`).
- **Metadata:** provider status (Audible, Hardcover) with a Test button, then the Audible region and the Hardcover token.
- **About:** version (and whether a newer GitHub release exists, checked hourly), total titles and requests, data directory, time zone; help links; the latest releases with their notes.
- **Users:** auto-approve new users by default; global request limits per format ("Unlimited" or N requests every D days). Denied and cancelled requests give their slot back; joining an active request is free; admins are never limited.
- **Services:** one Chaptarr server (decided: Chaptarr serves both formats), shown as a card (address, default folder and profile per format) with Edit (connection + defaults per format, in a dialog) and Delete, or an "Add a Chaptarr server" box; the webhook URL below.
- **Audiobookshelf / Kavita** (Seerr's Plex tab): connection, then the server's libraries as toggles (which ones count for availability; stored as exclusions so new libraries count) and "Sync libraries".
- Later: jobs (last run, next run, run now), health of each connection.

## 5. Data model (initial)

Auth tables are generated by better-auth (user, session, account, verification) plus the admin plugin fields (`role`, `banned`, …). App tables:

| Table             | Key fields                                                                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `media`           | id, `type` (audiobook/ebook), `source` (audible/hardcover), `external_id` (ASIN / Hardcover id), title, authors (json), narrators (json), series (json), language, cover_url, metadata (json), fetched_at                    |
| `request`         | id, media_id, user_id, `format`, `status`, `target` (json: service + root folder / library id), quality_profile_id, `backend_ref` (Chaptarr author/book id, ABS item id), last_error, created_at, updated_at                 |
| `request_event`   | id, request_id, actor (user id / "system" / "webhook"), from_status, to_status, message, created_at                                                                                                                          |
| `user_preference` | user_id, auto_approve, locale, abs_user_id                                                                                                                                                                                   |
| `setting`         | key, value (json; secrets encrypted)                                                                                                                                                                                         |
| `library_item`    | backend, item_id, library_id, external_id (ASIN), title, author, synced_at: what the media servers already hold, refreshed by the library sync job and matched by ASIN (replaces the planned per-media `availability` table) |

Uniqueness: one _active_ request per (media, format, target); a second requester is attached as a watcher (shown in the UI) instead of creating a duplicate.

## 6. Integrations (summary)

| Service                  | Used for                                                  | Auth           | Key endpoints (verify on install)                                                                                                                                            |
| ------------------------ | --------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chaptarr                 | submit audiobooks/eBooks, folders, profiles, availability | `X-Api-Key`    | `/api/v1/rootfolder`, `/qualityprofile`, `/metadataprofile`, `/author/lookup`, `/book/lookup`, `POST/PUT /author?mediaType=`, `/book/monitor`, `/command`, `/queue`, webhook |
| Audiobookshelf           | audiobook ownership, metadata proxy                       | Bearer API key | `/api/libraries`, `/api/libraries/:id/items`, `/api/search/books`                                                                                                            |
| Kavita                   | eBook ownership                                           | Auth key → JWT | `/api/Plugin/authenticate`, library/series search                                                                                                                            |
| Audible / Audnexus       | audiobook metadata                                        | none           | via ABS proxy or Audnexus                                                                                                                                                    |
| Hardcover / Open Library | eBook metadata                                            | token / none   | GraphQL / `search.json`                                                                                                                                                      |

See CLAUDE.md "Integrations: hard-won pitfalls" before implementing any of them.

## 7. Non-functional

- Single container, SQLite, < 200 MB RAM idle. Starts in seconds, migrates automatically.
- Works behind a reverse proxy / Cloudflare Tunnel; secure cookies over HTTPS; CSRF protection on mutations.
- Secrets encrypted at rest, redacted in logs and API responses.
- Responsive: usable on a phone (search + request + approve).
- i18n: English source, French translation as soon as the UI stabilizes; locale per user, fallback to the browser's.
- Link previews and search engines (decided 2026-11-24): Open Graph / Twitter card tags with a 1200×630 card per locale (`public/og-image.<locale>.png`, absolute URLs from `BETTER_AUTH_URL`) and a translated description; `robots: noindex, nofollow`, since an instance is private and invite-only. Pages behind sign-in have no per-title previews (bots can't sign in, and titles would leak).
- Observability: structured logs, `/api/health` with per-service status, job run history in Settings.

## 8. Milestones

1. **Skeleton:** TanStack Start + Bun + Drizzle + better-auth (invite-only, admin plugin) + Paraglide + Tailwind; CI (`bun run check`) + release-please + Docker image published on release (see AGENTS.md › Releases); health route; setup wizard (admin account only).
2. **Audiobooks end-to-end:** Settings → Services (Chaptarr, Audiobookshelf, Audible region, default audiobook target, with Test) and the same forms as an optional wizard step; Audible search, detail page, request modal (with admin target folder), approval, Chaptarr submit (write scope!), availability via ABS (ASIN) + Chaptarr webhook.
3. **eBooks:** Hardcover/Open Library search, Chaptarr eBook submit to Books/Manga/Comics folders, availability via Kavita.
4. ~~Podcasts~~: dropped (2026-11-24), see non-goals.
5. **Polish:** Seerr-like layout, Discover, blocklist, issues, users admin, settings + job history, retry/cancel, PWA manifest. (French translation: done early, with a language switcher in the account menu.)

Later: OIDC login (better-auth `genericOAuth`, with implicit sign-up disabled), notifications (email / ntfy / Discord), recommendations, public REST API.

## 9. Open questions

- Should users see each other's requests (Seerr does, for admins only)?
- Edition preference: let admins pin a language per format (e.g. French only) and show it in search?
