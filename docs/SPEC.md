# Storyrr: product spec, v1 (MVP)

Status: draft for the first implementation. Architecture and conventions: [../AGENTS.md](../AGENTS.md).

## 1. Problem

Movies and TV have Seerr: family members search, request, and it shows up in Plex. Books don't. In a homelab with **Chaptarr** (audiobooks + eBooks), **Audiobookshelf** (audiobook & podcast player) and **Kavita** (eBook/manga/comics reader), requesting a book means asking the admin, who adds it by hand in Chaptarr and picks the right folder. Podcasts are added by hand in Audiobookshelf. Existing tools cover only part of this:

- AudioBookRequest: audiobooks only.
- Stackarr: recommendation-first, eBook handoff currently broken with separate root folders, no podcasts.
- Seerr book support: not merged upstream; a fork exists without Chaptarr support.

## 2. Goal

One place where invited users **search and request audiobooks, eBooks (books, manga, comics) and podcasts**, with Seerr-like approval and status tracking, where **admins decide where each item lands** (which Chaptarr root folder / Audiobookshelf library), so files end up in the right Kavita / Audiobookshelf library.

### Non-goals for v1

- Recommendations, reading/listening tracking, ratings, social features.
- Being a downloader or indexer client: Chaptarr and Audiobookshelf do the fetching.
- Movies/TV/music.
- Native mobile app (responsive web only; PWA later).
- Email/push notifications (in-app status only in v1).

## 3. Users and roles

| Role      | Can                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Admin** | everything a user can + approve/deny requests, choose target folder and quality profile, manage users, manage settings |
| **User**  | search, request, see own requests and their status                                                                     |

Per-user flag **Auto-approve** (admins are always auto-approved). Accounts are **invite-only**: no public sign-up.

## 4. Core flows

### 4.1 First run (setup wizard)

Shown when the database has no user.

1. Create the admin account (name, email, password).
2. Connect services, each with a **Test** button and a clear error on failure:
   - Chaptarr: URL + API key (required for audiobooks and eBooks).
   - Audiobookshelf: URL + API key (required for podcasts and audiobook availability).
   - Kavita: URL + auth key (optional, eBook availability).
   - Metadata: Audible region (default `fr`), Hardcover token (optional).
3. Defaults: default target per format (from the live lists):
   - audiobook → a Chaptarr root folder with `folderType` 1 or 3;
   - eBook → a Chaptarr root folder with `folderType` 2 or 3;
   - podcast → an Audiobookshelf podcast library (+ folder).
4. Done → home.

### 4.2 Search

- One search bar, with **tabs/filters: Audiobooks, Books, Podcasts** (default: All).
- Result cards: cover, title, author (narrator for audiobooks, publisher for podcasts), year, series badge, and a **status badge**: _Available_, _Requested_, _Processing_, or a **Request** button.
- Owned detection: audiobooks by ASIN in Audiobookshelf; eBooks via Kavita (and Chaptarr files); podcasts by feed URL in Audiobookshelf.
- Fast: debounce, cached metadata, no blocking on slow providers.

### 4.3 Media detail page

- Cover, title, authors, narrators, series (with position), description, language, duration/pages, publication date.
- Other formats of the same work when known (e.g. "Also available as eBook").
- Request button (or current status + who requested it).

### 4.4 Request modal (Seerr-like)

- **Format** (audiobook / eBook) when the work exists in both.
- **Admins only, "Advanced options"** (collapsed by default):
  - **Target folder:** select listing only compatible targets, preselected with the default for the format. E.g. eBook → Books / Manga / Comics; audiobook → Audiobooks / Podcasts-type folders; podcast → podcast library.
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
  - podcast → Audiobookshelf: create the podcast from its feed in the chosen library/folder, auto-download on.
- Status: `pending → approved → submitted → available`; failures go to `failed` with the upstream reason and a **Retry** action.
- Availability updates from: Chaptarr webhook (import events), a periodic job (every ~15 min) checking Chaptarr files / Audiobookshelf / Kavita, and a manual "Check now".
- Every transition is recorded (who, when, from → to, message) and shown in the request history.

### 4.7 Requests page (user view)

- My requests with status, filters (all / pending / processing / available / failed), cancel while pending.

### 4.8 Users (admin)

- List, create/invite (email + temporary password; invite links later), set role, toggle auto-approve, disable/remove.
- Optional link to an Audiobookshelf user (future: "already listened").

### 4.9 Settings (admin)

- Services (same forms as the wizard, with Test).
- Defaults per format, request policy (podcasts require approval: on by default).
- Jobs: last run, next run, run now.
- About: version, health of each connection.

## 5. Data model (initial)

Auth tables are generated by better-auth (user, session, account, verification) plus the admin plugin fields (`role`, `banned`, …). App tables:

| Table             | Key fields                                                                                                                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `media`           | id, `type` (audiobook/ebook/podcast), `source` (audible/hardcover/openlibrary/itunes), `external_id` (ASIN / ISBN / provider id / feed URL), title, authors (json), narrators (json), series (json), language, cover_url, metadata (json), fetched_at |
| `request`         | id, media_id, user_id, `format`, `status`, `target` (json: service + root folder / library id), quality_profile_id, `backend_ref` (Chaptarr author/book id, ABS item id), last_error, created_at, updated_at                                          |
| `request_event`   | id, request_id, actor (user id / "system" / "webhook"), from_status, to_status, message, created_at                                                                                                                                                   |
| `user_preference` | user_id, auto_approve, locale, abs_user_id                                                                                                                                                                                                            |
| `setting`         | key, value (json; secrets encrypted)                                                                                                                                                                                                                  |
| `availability`    | media_id, backend, present (bool), checked_at, detail                                                                                                                                                                                                 |

Uniqueness: one _active_ request per (media, format, target); a second requester is attached as a watcher (shown in the UI) instead of creating a duplicate.

## 6. Integrations (summary)

| Service                  | Used for                                                  | Auth           | Key endpoints (verify on install)                                                                                                                                            |
| ------------------------ | --------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chaptarr                 | submit audiobooks/eBooks, folders, profiles, availability | `X-Api-Key`    | `/api/v1/rootfolder`, `/qualityprofile`, `/metadataprofile`, `/author/lookup`, `/book/lookup`, `POST/PUT /author?mediaType=`, `/book/monitor`, `/command`, `/queue`, webhook |
| Audiobookshelf           | podcasts, audiobook ownership, metadata proxy             | Bearer API key | `/api/libraries`, `/api/libraries/:id/items`, `/api/search/books`, podcast search + create                                                                                   |
| Kavita                   | eBook ownership                                           | Auth key → JWT | `/api/Plugin/authenticate`, library/series search                                                                                                                            |
| Audible / Audnexus       | audiobook metadata                                        | none           | via ABS proxy or Audnexus                                                                                                                                                    |
| Hardcover / Open Library | eBook metadata                                            | token / none   | GraphQL / `search.json`                                                                                                                                                      |
| iTunes Search            | podcast directory                                         | none           | `https://itunes.apple.com/search?media=podcast&term=`                                                                                                                        |

See CLAUDE.md "Integrations: hard-won pitfalls" before implementing any of them.

## 7. Non-functional

- Single container, SQLite, < 200 MB RAM idle. Starts in seconds, migrates automatically.
- Works behind a reverse proxy / Cloudflare Tunnel; secure cookies over HTTPS; CSRF protection on mutations.
- Secrets encrypted at rest, redacted in logs and API responses.
- Responsive: usable on a phone (search + request + approve).
- i18n: English source, French translation as soon as the UI stabilizes; locale per user, fallback to the browser's.
- Observability: structured logs, `/api/health` with per-service status, job run history in Settings.

## 8. Milestones

1. **Skeleton:** TanStack Start + Bun + Drizzle + better-auth (invite-only, admin plugin) + Paraglide + Tailwind; Docker image + CI; health route; setup wizard (admin account only).
2. **Audiobooks end-to-end:** Audible search, detail page, request modal (with admin target folder), approval, Chaptarr submit (write scope!), availability via ABS (ASIN) + Chaptarr webhook.
3. **eBooks:** Hardcover/Open Library search, Chaptarr eBook submit to Books/Manga/Comics folders, availability via Kavita.
4. **Podcasts:** iTunes search, ABS podcast creation in the chosen library, availability by feed URL.
5. **Polish:** users admin, settings + job history, retry/cancel, French translation, PWA manifest.

Later: OIDC login (better-auth `genericOAuth`, with implicit sign-up disabled), notifications (email / ntfy / Discord), recommendations, public REST API.

## 9. Open questions

- Do podcast requests always need admin approval? (Default: yes.)
- Should users see each other's requests (Seerr does, for admins only)?
- Edition preference: let admins pin a language per format (e.g. French only) and show it in search?
