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

- Recommendations, reading/listening tracking, users' own ratings, social features (the providers' reader ratings are shown).
- Being a downloader or indexer client: Chaptarr and Audiobookshelf do the fetching.
- Movies/TV/music.
- Podcasts: free to follow in any podcast app, so requesting them adds little (a podcast request flow into Audiobookshelf was built, then removed; see git history).
- Native mobile app (responsive web, installable as a PWA: see 4.10).

## 3. Users and roles

| Role      | Can                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Admin** | everything a user can + approve/deny requests, choose target folder and quality profile, manage users, manage settings |
| **User**  | search, request, see own requests and their status                                                                     |

Permissions (decided 2026-11-24, like Seerr): besides the **Admin** role (everything), each user has a list of permissions: Manage users, Manage settings, Manage requests (implies Advanced requests, View requests and auto-approval), Advanced requests (pick folder and profile), View requests, Request audiobooks / eBooks, Auto-approve audiobooks / eBooks, Manage issues (implies Report issues), Report issues, Manage blocklist. Users without their own list get the defaults from Settings → Users (view everyone's requests, request both formats, report issues; seeing others' requests is a default since 2026-11-26, unlike Seerr, where only admins do). User managers who aren't admins can't change admins' accounts or grant the Admin role; they only grant permissions they hold themselves, and can't change an account holding one they lack (decided 2026-11-25: otherwise they could give an account they create any permission). The **Owner** (decided 2026-11-24, like Seerr's first user) is the account the setup wizard created (on older installs: the oldest admin): an admin that only they can change. Nobody else edits their name, email, language, password or permissions, bans, demotes or deletes them; the Users table and their profile show the role as Owner. **Manage settings is as good as Admin** (noted 2026-11-26): it reaches the saved keys, the SMTP server password resets go through, media-server sign-in and the default permissions, so its description says to give it only to people one would make administrators. A user manager can't create accounts while the default permissions include one they lack. Accounts are **invite-only**: no public sign-up.

## 4. Core flows

### 4.1 First run (setup wizard)

Shown when the database has no user: it creates the admin account (name, email, password), which becomes the **Owner**, and asks for the application URL (prefilled with the address the wizard is open at), then opens the home page. No environment variable is required (the auth secret is generated in the data folder). Services (Chaptarr, Audiobookshelf, Kavita, Komga, Jellyfin, metadata) and the default target per format are set afterwards in Settings, each with a **Test** button and a clear error on failure. Defaults come from the live lists:

- audiobook → a Chaptarr root folder with `folderType` 1 (audiobook) or 0 (mixed);
- eBook → a Chaptarr root folder with `folderType` 2 (eBook) or 0 (mixed).

### 4.2 Search

- One search bar; the results page has **tabs: All, Audiobooks, Books**, with each format's result count (decided 2026-11-26). **All** shows one scrolling row per format, so both are visible without scrolling, each with "See all" to its tab; a format's tab shows its full grid. The tab lives in the URL. The two catalogs aren't mixed in one list (unlike Seerr's movies and shows): each ranks its own results, and a work often exists in both formats.
- Result cards: cover, title, author (narrator for audiobooks), year, series badge, and a **status badge**: _Available_, _Requested_, _Processing_, or a **Request** button.
- **A series is one card (decided 2026-11-25, like Seerr shows a show once):** the volumes found of the same series fold into one "Series" card (cover of the lowest volume found, at the place of the first one found) that opens the series page; titles outside a series keep their own card. Searching a volume shows its series.
- Owned detection: first by ID among the books Chaptarr holds a file of (decided 2026-11-27: `GET /book/paged?downloaded=true` at each library sync; Hardcover id for eBooks, ASINs for audiobooks, exact), so a file deleted in Chaptarr stops counting at the next sync. Then audiobooks by ASIN in Audiobookshelf, or by title in Jellyfin and Chaptarr (an audiobook has one ASIN per marketplace); eBooks by title in Kavita, Komga and Jellyfin, "probably owned". Any configured server counts (decided 2026-11-24). An eBook is matched under any of its editions' titles (decided 2026-11-26: a French library holds "Harry Potter et la Coupe de Feu", Hardcover titles it in English), except a title equal to its series name, which libraries also list as a series.
- Fast: debounce, cached metadata, no blocking on slow providers.

### 4.2a Discover genre and upcoming rows (decided 2026-11-24, like Seerr's "Series by genre" / "Upcoming")

- **Audiobooks by genre** (Audible's top-level genres) and **Books by genre** (Hardcover's 20 most used genres, catch-alls like Fiction left out): a colored card per genre opening the Audiobooks / Books page filtered by it.
- **Upcoming books** (Hardcover): out within a year, the most awaited first, "Untitled …" placeholders left out; See all opens Books sorted by "Upcoming". Audible can't list upcoming titles (no date filter, its newest-first sort starts years ahead), so there is no audiobook equivalent. No publishers row: neither catalog gives publisher logos.
- **Genre names come from the catalogs (decided 2026-11-24, revised 2026-11-25).** Audible names its genres in its store's language, but a store may offer another one through the `locale` parameter (audible.fr and audible.de: English with `en-GB`; audible.ca: French with `fr-CA`; unsupported ones are ignored), with the same genre ids: Storyrr asks for the reader's UI language on the calls that return genre names (genre list, a genre's name, a title's or series' genres), never on search or lists, whose titles stay the store's. Hardcover's genres and moods are English-only reader tags: Storyrr translates the ~100 most used itself (`src/lib/hardcover-tags.ts`, keyed by normalized English name since slugs can carry random suffixes), others keep Hardcover's name; to drop once Hardcover translates them. Seerr relies on its catalog the same way (TMDB translates genre names).
- Saved Discover layouts get rows added in later versions appended (enabled), keeping the admin's order and choices.

### 4.2b Books and Audiobooks pages (decided 2026-11-24, like Seerr's Movies / Series)

- No search field (the top bar searches): the catalog as a grid that loads while scrolling, a **sort** and a **Filters** panel (right-side sheet, "N active filters", Reset). Sort and filters live in the URL.
- Audiobooks (Audible catalog, region from Settings): sorts Bestsellers, Release date (newest / oldest), Best rated, Title (A-Z / Z-A), Length (longest / shortest); filters genre (top-level Audible genres), author, narrator, publisher. Audible can't filter by language.
- Books (Hardcover): sorts Most read, Upcoming (most awaited, out within a year), Best rated (at least 50 ratings, released), Release date (newest: released only / oldest: year ≥ 1000), Title (A-Z / Z-A); filters genres (any of, by each book's main genre tags), edition language, release year range, pages range, minimum Hardcover rating. Non-popularity sorts need 5 readers, or they surface placeholder records. Genre + language together can take several seconds on Hardcover.
- Both: "Hide owned" and "Only languages Chaptarr accepts" switches, applied to the loaded results.

### 4.3 Media detail page

- Cover, title, authors, narrators, series (with position), description, language, duration/pages, publication date.
- Other formats of the same work when known (e.g. "Also available as eBook").
- Request button (or current status + who requested it).

- Genres and keywords (decided 2026-11-24, like Seerr's keywords): chips under the description. Audiobooks show their Audible genres (every level of each genre path); books their main Hardcover genres (up to 8) and moods (up to 4), most tagged first, without readers' opinion tags, content warnings or spoiler-flagged tags. A chip opens `/tags/$type/$id`: the genre's bestsellers on Audible, or the tag's most-read books on Hardcover, 40 per page with "Load more".

### 4.3g Open in the media server (decided 2026-11-27)

- An available title's page has one button per media server holding it: **Open in Audiobookshelf / Kavita / Komga / Jellyfin**, to the item's page there (Kavita and Komga: its series).
- The item is recognized like for availability (ASIN, else title). For a server giving no match, Storyrr asks Chaptarr for the file of the book it identified and finds the server's item by the end of that file's path: the same file is mounted in both. Only then is Chaptarr called, for that one book.
- Links use each media server's **External URL** (its settings tab), the address users open it at; blank: its connection URL, which a browser can't reach when it is a container name.

### 4.3b Navigation and Discover (decided 2026-11-24)

- Seerr-like layout: a sidebar with **Découvrir (Discover), Livres (eBooks), Livres audio (Audiobooks), Demandes (Requests), Blocages (Blocklist, admins), Problèmes (Issues), Utilisateurs (Users, admins), Paramètres (Settings, admins)**, a search bar at the top, the account menu at the top right. On phones the sidebar becomes a drawer.
- **Discover** shows horizontal rows: **Trending** (Audible bestsellers in the configured region, Hardcover's trending books), **Recent requests** (with status), **Recently added** (requests that became available).
- **Books** / **Audiobooks** pages: search and browse that type only.

- Discover's rows are configurable (Settings → General → Discover): turn rows on or off, reorder them, add rows of Books or Audiobooks with a sort and filters (format, title, the same sort and filters as those pages; their "See all" opens the page with them), or reset. Search rows were replaced by these filtered rows (decided 2026-11-25): a stored search row is dropped. Trending rows have a "See all" Browse page (`/browse/<type>`): the full list (Audible bestsellers page by page, Hardcover's trending list), filterable to hide what's in the library or requested and to accepted languages.

### 4.3c Blocklist (decided 2026-11-24)

- Admins block a book or audiobook (from its page or a request) with an optional reason. Blocked items show as _Blocked_ in search and can't be requested. The Blocklist page lists them and unblocks.

### 4.3d Issues (decided 2026-11-24)

- Any user reports a problem on an available item: wrong language, wrong edition, missing or broken content, bad audio, other; with a comment. Admins and the reporter discuss it in comments; admins resolve or reopen it. The Issues page lists open issues first (users see their own, admins all).

### 4.3f Series and authors (decided 2026-11-24)

- Series pages (`/series/<type>/<id>`, Audible series ASIN or Hardcover series id), linked from a title's series badge and from search, laid out like Seerr's show page: a header over the blurred first cover (tags shared by at least half the volumes; series status: _Available_, _Partially available_, _Requested_; name; volume count and years; the authors credited on most volumes, since Audible lists translators as authors), the summary, the volumes as rows (Seerr's seasons: cover, number, title, year, length, status or Request), a facts panel (volumes, years, narrators, publishers, languages, total length), **box sets and collections** apart below the volumes (a position covering several volumes, "0-3" or "1, 3", or Hardcover's compilation flag, which is unreliable on its own): out of the counts, the header cover and Request the series, but requestable one by one, and **Request the series**: a dialog to pick the volumes (those you have or already requested are disabled), each requested with the usual checks (permissions, blocklist, language, limits).
- **Versions in another language (decided 2026-11-25).** Hardcover keeps a translation cut into other volumes as its own series, with no link to the original ("Solo Leveling (French Numbering)" next to "Solo Leveling (Comic)"). So:
  - eBook search adds the series Hardcover's series search finds to the results, accepted languages first; a series' languages are those of its first 3 books;
  - a title or a series refused for its language (every volume refused) shows **"Also in <languages>:"** with links to the series of the same name apart from a trailing qualifier (`(…)`, `[…]`) that Chaptarr accepts. A name match, not a link Hardcover makes: it can include another medium (the novel next to the comic), whose name says so.
- Author pages (`/authors/<type>/<id>`), linked from a title's authors: photo and bio (Audnexus for audiobooks, Hardcover for eBooks) and their works.

### 4.3e Manage a title (decided 2026-11-24)

Request managers get a "Manage" side panel on title pages (Seerr's): the title's requests and issues, **Mark as available** (when the library sync can't match a title you have: it counts as owned and its open requests turn available) and **Clear data** (forgets its requests, issues and manual availability; Chaptarr and the libraries are untouched).

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
  - audiobook/eBook → Chaptarr `POST /api/v1/book/import`: adds the author if needed, monitors and searches only the requested book on the requested format, in the chosen root folder (see AGENTS.md › Chaptarr);
- Status: `pending → approved → submitted → available`; failures go to `failed` with the upstream reason and a **Retry** action. While Chaptarr is unreachable or answers 429/502/503/504, an approved request stays `approved` and the 5-minute job sends it later (decided 2026-11-26); a timeout still fails, since Chaptarr may have taken it.
- A delivered request becomes `removed` once its book is gone (decided 2026-11-27, like Seerr's deleted media): after a library sync that worked everywhere, no library holds it, Chaptarr's index doesn't either, and Chaptarr confirms it has no file. The title can then be requested again; the request keeps its history. Nothing changes while Chaptarr can't be asked.
- A library match by title alone doesn't make a request available when that title was already in the library as the request was sent (decided 2026-11-26: it is another book, or the copy to replace): Chaptarr's file or an exact ID does. Removing a media server forgets its titles.
- Availability updates from: Chaptarr webhook (import events), a periodic job (every ~15 min) checking Chaptarr files and the media servers (Audiobookshelf, Kavita, Komga, Jellyfin), and a manual "Check now".
- While Chaptarr downloads a sent request, its progress (from Chaptarr's queue, by provider ID) fills the status badge itself, with a percentage ("Downloading (63 %)"), on the Requests page, Discover's recent requests and the title's page, refreshed about every 10 seconds (decided 2026-11-26, like Seerr).
- Every transition is recorded (who, when, from → to, message) and shown in the request history.

### 4.7 Requests page (user view)

- One request per line, like Seerr (decided 2026-11-26): cover, year, title and authors; then status, when and by whom it was requested, and the folder (managers); then its actions. Above the list, one line of controls: whose requests (managers), then compact format, status and sort menus.
- My requests with status, filters (all / pending / processing / available / failed), delete while pending (like Seerr: no separate Cancel; managers delete any request, or remove it from Chaptarr once sent).

### 4.8 Users (admin)

- List, create/invite (email + temporary password; invite links later), set role, toggle auto-approve, disable/remove.
- Import users from a media server (like Seerr's Plex import): accounts linked to theirs, default permissions. One whose email a Storyrr account already uses is skipped (never linked by email): its owner links it in their settings.
- Per-user request limits overriding the global ones (decided 2026-11-24).
- Deleting an account keeps its requests (decided 2026-11-26): they show "Deleted user" as requester, with their history and watchers; its issues are deleted with it.
- Seerr-like table (decided 2026-11-24): user (avatar, name, email), requests, role, joined; search, sortable columns, pages. **Edit** opens that user's settings (the same General / Password / Permissions tabs as one's own): admins change their name, email and language, set a new password, and edit role, auto-approval, ban and request limits there. Admins can't demote, ban or delete themselves. The Owner's settings are read-only for everyone else, with a notice saying why, and their Delete button is disabled.
- Optional link to an Audiobookshelf user (future: "already listened").

### 4.8b Account menu and profile (decided 2026-11-24)

- The avatar at the top right opens a Seerr-like menu: name and email, then Profile, Requests, Settings, Sign out.
- **Profile:** avatar, name, email, role, member since; request counts (total, audiobooks, eBooks, available) and recent requests.
- **Settings** (the user's own, tabs): **General** (display name, email read-only, display language: browser default or a fixed locale, stored per user and applied on any device), **Password** (current + new; signs out other sessions), **Permissions** (read-only: role, auto-approval, request limits left). **Notifications** (personal channels) and **Linked accounts** (media-server accounts to sign in with) are the user's own tabs.

### 4.8e Sign in with a media server (decided 2026-11-24; Komga and Jellyfin added the same day)

- Per server (Settings → Audiobookshelf / Kavita / Komga / Jellyfin → Sign-in): on/off, and whether unknown accounts get a Storyrr account (off by default: only imported or matching accounts sign in).
- The sign-in page then offers Storyrr account / Audiobookshelf / Kavita / Komga / Jellyfin. Credentials are checked by the server (`POST /login`, `POST /api/Account/login`, Komga `GET /api/v2/users/me` with HTTP Basic: Komga accounts sign in with their email; Jellyfin `POST /Users/AuthenticateByName`, then the session it opened is ended); the Storyrr account is found by link only (`media_server_account`: ABS, Komga and Jellyfin user ids, Kavita username), else created with the default permissions when allowed, unless its email is already a Storyrr account's (refused: "sign in with it, then link"). **Never matched by email (decided 2026-11-25):** a media-server user can set any email there, an admin's included, which would hand over that account; Seerr matches Jellyfin and Emby accounts by user id only for the same reason (it trusts emails for Plex, which verifies them). Existing users link their media-server account in their settings (**Linked accounts** tab: the server's username and password, checked once and never stored; an account linked to another user is refused), and can unlink it. A better-auth plugin (`/api/auth/sign-in/media-server`) opens the session; bans apply.
- Users → Import users: lists a server's accounts and creates linked Storyrr accounts for the selected ones.

### 4.8d Forgot password (decided 2026-11-24)

When the Email notification agent is set up, the sign-in page offers "Forgot password?": an email with a one-time link valid for an hour (better-auth's reset flow, sent through the agent's SMTP server, in the visitor's language), leading to a page to choose a new password; other sessions are signed out. The form answers the same whether the address has an account or not.

### 4.8c Notifications (decided 2026-11-24)

- Events: request waiting for approval, auto-approved, approved, declined, available, failed; issue reported, commented, resolved, reopened.
- Agents (Settings → Notifications, one sub-tab each, with Enable, events, fields, Test, Save): Email (SMTP), Discord, Slack, Telegram, ntfy, Gotify, Pushover, Pushbullet, a webhook with a JSON template (`{{variables}}`), and Web Push (VAPID keys generated on first use; users turn it on per device). Tokens are stored encrypted; the eye button reveals them like API keys.
- Shared delivery: each enabled agent posts the events it's set for to its own destination, in the instance's notification language. A new agent starts with no event checked; turning one on needs at least one. Email and Web Push have no shared destination, so their settings have no event list (like Seerr): each user picks those events.
- Personal delivery (reworked 2026-11-24, like Seerr): requesters and watchers get news of their requests, request managers of new requests, issue managers of new issues and comments, reporters of their issues. Profile → Settings → Notifications has one tab per channel, each with its own events (only those the account can get): Email, Web Push (plus this device's switch), Discord (user ID, mentioned in the shared message) and Telegram (chat ID, the administrator's bot) appear once an administrator enables them; **Pushbullet** (own access token) and **Pushover** (own application token and user key; the application token is optional when the administrator set up Pushover) always appear and need no administrator setup. Messages use the user's language. Preferences saved before this change (one shared event list) are converted when read.

### 4.9 Settings (admin)

Seerr-like tabs (decided 2026-11-24), label column on the left, control on the right:

- **General:** application URL (decided 2026-11-25, like Seerr): the address links in emails and notifications point to, e.g. a tunnel's; read-only when `BETTER_AUTH_URL` sets it. Storyrr works at its other addresses too (its LAN IP over http, the tunnel over https).
- **Metadata:** provider status (Audible, Hardcover) with a Test button, then the Audible region and the Hardcover token.
- **About:** version (and whether a newer GitHub release exists, checked hourly), total titles and requests, data directory, time zone; help links; the latest releases like Seerr's (how old, "Release vX.Y.Z", Latest / Current badges) with each one's changelog in a dialog, rendered from the GitHub release's Markdown by a small reader that builds elements, never HTML (`src/lib/markdown.ts`).
- **Users:** auto-approve new users by default; global request limits per format ("Unlimited" or N requests every D days). Denied and cancelled requests give their slot back; joining an active request is free; admins are never limited.
- **Services:** one Chaptarr server (decided: Chaptarr serves both formats), shown as a card (address, default folder and profile per format) with Edit (connection + defaults per format, in a dialog) and Delete, or an "Add a Chaptarr server" box; the webhook URL below.
- **Audiobookshelf / Kavita / Komga / Jellyfin** (Seerr's Plex tab): connection, then the server's libraries as toggles (which ones count for availability; stored as exclusions so new libraries count) and "Sync libraries".
- **Jobs & logs:** each background job with its schedule, last run (and result) and next run, with Run now; the server's last 1,000 log lines (in memory), filtered by level and text, paused or copied.
- **Network:** an outbound HTTP(S) proxy for Storyrr's calls (with hosts reached directly; stored encrypted, its URL can carry a password), a **Trust the proxy's address header** switch (decided 2026-11-26: sign-in rate limits count per visitor address, the connection's own by default, the last X-Forwarded-For entry when on; to turn on when Storyrr is only reached through a reverse proxy or tunnel), and an optional cover cache: covers served by Storyrr from the data folder (30 days), signed-in users only, provider image hosts only (redirects included), raster images only (no SVG), 5 MB per cover, stored up to 1 GB.
- Later: health of each connection.

### 4.9b Polish (decided 2026-11-24)

- When the server runs another version than the open page (Storyrr was updated), a dialog offers to reload.
- Accounts without a real email (media-server sign-in) see a notice until they add one; users can change their own email in their settings (no verification: invite-only instance; confirmed with their current password when the account has one, decided 2026-11-26).

### 4.10 Installable app (decided 2026-11-24)

- Web app manifest and icons; a service worker (`public/sw.js`) for installation and Web Push, without offline caching (pages always come from the server).
- On phones, a bottom bar (Discover, Books, Audiobooks, Requests, More) replaces the menu button.

## 5. Data model (initial)

Auth tables are generated by better-auth (user, session, account, verification) plus the admin plugin fields (`role`, `banned`, …). App tables:

| Table                  | Key fields                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `media`                | id, `type` (audiobook/ebook), `source` (audible/hardcover), `external_id` (ASIN / Hardcover id), title, authors (json), narrators (json), series (json), language, cover_url, metadata (json), fetched_at                                                                                                                       |
| `request`              | id, media_id, user_id, `format`, `status`, `target` (json: service + root folder / library id), quality_profile_id, `backend_ref` (Chaptarr author/book id, ABS item id), last_error, created_at, updated_at                                                                                                                    |
| `request_event`        | id, request_id, actor (user id / "system" / "webhook"), from_status, to_status, message, created_at                                                                                                                                                                                                                             |
| `user_preference`      | user_id, permissions (json), locale, request_limits (json), notifications (json)                                                                                                                                                                                                                                                |
| `media_server_account` | server, account_key, user_id: which media-server account a user is (sign in with a media server, imported users)                                                                                                                                                                                                                |
| `request_watcher`      | request_id, user_id: users who joined someone else's active request (they get its news)                                                                                                                                                                                                                                         |
| `issue`                | id, media_id, user_id, type (language/edition/content…), status (open/resolved), created_at, updated_at                                                                                                                                                                                                                         |
| `issue_comment`        | id, issue_id, user_id, message, created_at: the discussion (the first comment is the report)                                                                                                                                                                                                                                    |
| `blocklist_item`       | id, type, source, external_id, title, cover_url, reason, created_by, created_at: titles nobody can request                                                                                                                                                                                                                      |
| `push_subscription`    | endpoint, user_id, p256dh, auth: a device's Web Push subscription                                                                                                                                                                                                                                                               |
| `setting`              | key, value (json; secrets encrypted)                                                                                                                                                                                                                                                                                            |
| `library_item`         | backend, item_id, library_id, format (audiobook/ebook), external_id (ASIN), match_key, title, author, synced_at: what the media servers already hold, refreshed by the library sync job; Audiobookshelf matched by ASIN, the other servers by normalized title per format (replaces the planned per-media `availability` table) |

Uniqueness: one _active_ request per (media, format, target); a second requester is attached as a watcher (shown in the UI) instead of creating a duplicate.

## 6. Integrations (summary)

| Service        | Used for                                                       | Auth                                    | Key endpoints (verify on install)                                                                                                 |
| -------------- | -------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Chaptarr       | submit audiobooks/eBooks, folders, profiles, availability      | `X-Api-Key`                             | `/api/v1/rootfolder`, `/qualityprofile`, `/metadataprofile`, `/book/lookup`, `POST /book/import`, `/queue`, `/health`, webhook    |
| Audiobookshelf | audiobook ownership, metadata proxy                            | Bearer API key                          | `/api/libraries`, `/api/libraries/:id/items`, `/api/search/books`                                                                 |
| Kavita         | eBook ownership, sign-in, users                                | Auth key → JWT                          | `/api/Plugin/authenticate`, `/api/Library/libraries`, `/api/Series/all-v2`, `/api/Series/volumes` (book titles in book libraries) |
| Komga          | eBook ownership (comics, manga, eBooks), sign-in, users        | `X-API-Key` (user: HTTP Basic)          | `GET /api/v1/libraries`, `POST /api/v1/series/list`, `POST /api/v1/books/list`, `GET /api/v2/users`, `GET /api/v2/users/me`       |
| Jellyfin       | audiobook and eBook ownership (book libraries), sign-in, users | `Authorization: MediaBrowser Token="…"` | `GET /Library/VirtualFolders`, `GET /Items?IncludeItemTypes=AudioBook,Book`, `GET /Users`, `POST /Users/AuthenticateByName`       |
| Audible        | audiobook metadata                                             | none                                    | `https://api.audible.<tld>/1.0/catalog/products` (catalog API, called directly)                                                   |
| Hardcover      | eBook metadata                                                 | personal token                          | GraphQL `https://api.hardcover.app/v1/graphql`                                                                                    |

See CLAUDE.md "Integrations: hard-won pitfalls" before implementing any of them.

## 7. Non-functional

- Single container, SQLite, < 200 MB RAM idle. Starts in seconds, migrates automatically.
- Works behind a reverse proxy / Cloudflare Tunnel; secure cookies over HTTPS; CSRF protection on mutations.
- Secrets encrypted at rest, redacted in logs and API responses.
- Responsive: usable on a phone (search + request + approve).
- i18n: English source, French translation as soon as the UI stabilizes; locale per user, fallback to the browser's.
- Link previews and search engines (decided 2026-11-24): Open Graph / Twitter card tags with a 1200×630 card per locale (`public/og-image.<locale>.png`, absolute URLs from the application URL) and a translated description; `robots: noindex, nofollow`, since an instance is private and invite-only. Pages behind sign-in have no per-title previews (bots can't sign in, and titles would leak).
- Observability: structured logs, `/api/health` with per-service status, job run history in Settings.

## 8. Milestones

1. **Skeleton:** TanStack Start + Bun + Drizzle + better-auth (invite-only, admin plugin) + Paraglide + Tailwind; CI (`bun run check`) + release-please + Docker image published on release (see AGENTS.md › Releases); health route; setup wizard (admin account only).
2. **Audiobooks end-to-end:** Settings → Services (Chaptarr, Audiobookshelf, Audible region, default audiobook target, with Test) and the same forms as an optional wizard step; Audible search, detail page, request modal (with admin target folder), approval, Chaptarr submit (write scope!), availability via ABS (ASIN) + Chaptarr webhook.
3. **eBooks:** Hardcover search, Chaptarr eBook submit to Books/Manga/Comics folders, availability via Kavita, Komga and Jellyfin.
4. ~~Podcasts~~: dropped (2026-11-24), see non-goals.
5. **Polish:** Seerr-like layout, Discover, blocklist, issues, users admin, settings + job history, retry/cancel, PWA manifest. (French translation: done early, with a language switcher in the account menu; German and Spanish added 2026-11-25.)

Later: OIDC login (better-auth `genericOAuth`, with implicit sign-up disabled), recommendations, public REST API.

## 9. Open questions

- Edition preference: let admins pin a language per format (e.g. French only) and show it in search?
