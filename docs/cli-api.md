# PawPress HTTP API v1 (contract)

This is the contract between the PawPress server (`app/api/v1/*`) and the `pawpress` CLI (`cli/`).
Both sides are implemented against this document; if behaviour and this document disagree, this
document wins until it is deliberately changed.

- Base path: `/api/v1`
- All request and response bodies are JSON (`Content-Type: application/json`) except `POST /media`
  (multipart).
- All v1 route handlers run on the Node.js runtime (`export const runtime = 'nodejs'`).
- Timestamps are ISO-8601 strings in UTC, exactly as stored in Supabase.

## 1. Authentication

| Routes | Accepted auth |
|---|---|
| `/api/v1/tokens*` | **Cookie session only** (logged-in admin in the browser). Mutations also require the `Origin` header to match the request host, otherwise `403 forbidden`. |
| every other `/api/v1/*` route | **Bearer token only**: `Authorization: Bearer pp_<jws>`. Cookies are ignored. |

A personal access token (PAT) is `pp_` followed by a compact JWS (HS256, signed with the server env
var `PAWPRESS_TOKEN_SECRET`). Claims: `iss: "pawpress"`, `sub` (user id), `jti` (token id, UUID),
`scp` (scopes), `iat`, `exp`. Clients must treat the token as opaque.

A token is accepted only if **all** of these hold: the signature is valid, `iss` is correct, it hasn't
expired, its `jti` is still in the owner's active-token list (not revoked), the owner is not banned
(`banned_until` in the future) or soft-deleted, and the owner still has a `user_profiles` row with
role `master` or `admin`. Any failure returns `401 unauthorized` with no detail about which check
failed.

## 2. Scopes

| Scope | Grants |
|---|---|
| `posts:read` | list/get posts, including drafts |
| `posts:write` | create posts as drafts; edit drafts (posts that are neither published nor scheduled) |
| `posts:publish` | publish now, schedule, unpublish/unschedule; edit published **or scheduled** posts; create as published or scheduled |
| `posts:delete` | delete posts |
| `categories:write` | create/update/delete categories (reading categories needs only a valid token) |
| `media:upload` | upload images |

Effective scopes for a request = the token's `scp` ∩ the scopes of the owner's **current** role
(`master` and `admin` currently both get all six). They're evaluated on every request.
User management and token management can never be granted to a token.

Recommended default for a new agent token (draft-only): `posts:read`, `posts:write`, `media:upload`.

## 3. Errors

Every non-2xx response has this body:

```json
{ "error": { "code": "validation_failed", "message": "Human readable text", "details": {} } }
```

`details` is optional. For `validation_failed` it maps field paths to arrays of messages, e.g.
`{ "fields": { "title": ["Required"], "category": ["Unknown category"] } }`.

| `code` | HTTP | Meaning | CLI exit code |
|---|---|---|---|
| `unauthorized` | 401 | missing/invalid/expired/revoked token, or owner no longer admin | 3 |
| `forbidden` | 403 | authenticated but missing a scope (or Origin check failed) | 3 |
| `not_found` | 404 | resource doesn't exist | 4 |
| `conflict` | 409 | slug already taken, `if_updated_at` mismatch, category still has posts | 5 |
| `locked` | 409 | another editor (a human admin or another agent) holds the post's edit lock; `details.holder` says who (§9) | 5 |
| `validation_failed` | 400 | bad input, including invalid JSON | 6 |
| `payload_too_large` | 413 | upload over the size limit | 6 |
| `unsupported_media_type` | 415 | upload MIME type not allowed | 6 |
| `internal` | 500 | unexpected server error (no internals leaked) | 1 |

CLI exit codes: `0` ok, `1` unexpected/internal, `2` usage error (bad CLI args, detected locally),
`3` auth, `4` not found, `5` conflict, `6` validation (incl. 413/415), `7` network (no HTTP response).

## 4. Resources

### 4.1 Post

```json
{
  "id": "uuid",
  "title": "Hello",
  "slug": "hello",
  "excerpt": "",
  "status": "draft",
  "published_at": null,
  "category": { "id": "uuid", "slug": "news", "name": "News" },
  "featured_image_url": null,
  "created_at": "2026-10-06T12:00:00.000Z",
  "updated_at": "2026-10-06T12:00:00.000Z",
  "content": "# Markdown…"
}
```

- `status` is derived from `published_at`, not stored: `"draft"` if null, `"scheduled"` if in the
  future, `"published"` otherwise (see §8).
- `category` is `null` if the post's category no longer exists.
- `content` is present **only** on `GET /posts/:idOrSlug`, in the requested `format`:
  `markdown` (string), `lexical` (the serialized editor state object), or `html` (the stored
  `content_html` string). A post with no content returns `""` (markdown/html) or `null` (lexical).
- `content_format` is also present on that endpoint and echoes the format.

### 4.2 Category

```json
{ "id": "uuid", "name": "News", "slug": "news", "description": "…", "created_at": "…", "updated_at": "…" }
```

### 4.3 Slugs

Slugs (posts and categories) must match `^[a-z0-9]+(?:-[a-z0-9]+)*$`, be at most 200 characters, and
not be reserved: `admin`, `api`, `category`, `posts`, `styles`. If a post slug is omitted on create,
the server derives one from the title (lowercase, ASCII, non-alphanumerics → `-`, trimmed). If that's
empty or reserved, you get `validation_failed`.

## 5. Endpoints

### `GET /api/v1/me`
Any valid token. `200`:
```json
{
  "user":  { "id": "uuid", "email": "a@b.c", "role": "admin" },
  "token": { "id": "uuid", "name": "my agent", "scopes": ["posts:read"], "expires_at": "…" }
}
```
`token.scopes` are the **effective** scopes (after the intersection with the role).

### `GET /api/v1/posts`
Scope `posts:read`. Query params:
- `status`: `draft` | `scheduled` | `published` | `all` (default `all`)
- `category`: category slug
- `q`: case-insensitive substring match on title
- `limit`: 1–100 (default 20); `offset`: ≥ 0 (default 0)

Ordered by `updated_at` desc. `200`: `{ "items": Post[], "total": number }` (no `content`).
An unknown `category` slug gives `200` with `{ "items": [], "total": 0 }`.

### `GET /api/v1/posts/:idOrSlug?format=markdown|lexical|html`
Scope `posts:read`. If `:idOrSlug` is a UUID, the lookup is by id; otherwise by slug. Default format
is `markdown`. `200`: Post with `content` and `content_format`. `404 not_found` if missing.

### `POST /api/v1/posts`
Scope `posts:write`; additionally `posts:publish` if `status` is `"published"` or `"scheduled"`.

Body:
| Field | Type | Notes |
|---|---|---|
| `title` | string, 1–300 | required |
| `slug` | string | optional, derived from title if absent |
| `excerpt` | string ≤ 1000 | optional, default `""` |
| `category` | string | required; a category **id or slug** |
| `featured_image_url` | string \| null | optional; `http(s)` URL or site-relative path |
| `content_markdown` | string | exactly one of `content_markdown` / `content_lexical` is required |
| `content_lexical` | object | a serialized Lexical editor state (`{ root: { type: "root", children: [...] } }`) |
| `status` | `"draft"` \| `"published"` \| `"scheduled"` | default `"draft"`; `"published"` sets `published_at` to now; `"scheduled"` requires `publish_at` |
| `publish_at` | ISO-8601 string with offset | required iff `status` is `"scheduled"`; see §8 |

`201`: Post (without `content`). Slug taken → `409 conflict`.

### `PATCH /api/v1/posts/:id`
`:id` must be a UUID. Partial update: only fields present in the body change.
Scope `posts:write`; additionally `posts:publish` if the post is **currently published or scheduled**
(i.e. `published_at` is non-null), or the body changes `status` or sends `publish_at`.

Body: any of `title`, `slug`, `excerpt`, `category`, `featured_image_url`, `content_markdown` **or**
`content_lexical` (not both), `status`, `publish_at`, plus optional `if_updated_at`.

- `if_updated_at`: if present and not equal to the stored `updated_at`, respond `409 conflict` with
  `details: { "current_updated_at": "…" }` and change nothing.
- Content HTML is regenerated **only** when content is provided; if regeneration fails the request
  returns `500 internal` and nothing is written (the web editor's PUT keeps the old HTML instead).
- `status: "published"` sets `published_at` to now unless it's already in the past (then it's kept);
  `status: "scheduled"` + `publish_at` sets it to `publish_at`; `status: "draft"` clears it. `publish_at`
  without `status` is allowed only on a post that is already scheduled (reschedule).
- Edit locks apply (§9): if another session holds the post's lock, the request fails with `409 locked`.
- The server always bumps `updated_at`.

`200`: the updated Post (without `content`). An empty body (no updatable fields) → `400 validation_failed`.

### `POST /api/v1/posts/:id/publish` / `POST /api/v1/posts/:id/unpublish`
Scope `posts:publish`. Optional body for publish: `{ "at": "<ISO-8601 with offset>" }`.
- publish without `at`: a draft or a scheduled post goes live now (`published_at` = now); an already
  published post keeps its `published_at` (idempotent).
- publish with `at` in the future: the post becomes (or is rescheduled as) `scheduled`. `at` in the past
  or now → `validation_failed` (use publish without `at`).
- unpublish sets `published_at` to null (also cancels a schedule). Idempotent.
`200`: Post. Edit locks apply (§9).

### `DELETE /api/v1/posts/:id`
Scope `posts:delete`. `200`: `{ "deleted": true, "id": "uuid" }`. `404` if missing.

### `GET /api/v1/categories`
Any valid token. `200`: `{ "items": Category[] }` ordered by name.

### `POST /api/v1/categories`
Scope `categories:write`. Body: `name` (1–100), `slug`, `description` (1–1000), all required.
`201`: Category. Slug taken → `409`.

### `PATCH /api/v1/categories/:id`
`:id` must be a UUID (a non-UUID returns `404 not_found` without querying the database).
Scope `categories:write`. Partial update of `name`, `slug`, `description`. `200`: Category.

### `DELETE /api/v1/categories/:id`
`:id` must be a UUID (a non-UUID returns `404 not_found` without querying the database).
Scope `categories:write`. `409 conflict` if any post uses the category.
`200`: `{ "deleted": true, "id": "uuid" }`.

### `POST /api/v1/media`
Scope `media:upload`. `multipart/form-data` with a single field `file`.
- Max 4 MB (4 194 304 bytes) → otherwise `413 payload_too_large`.
- Allowed types: `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/avif`. The server checks
  the file's magic bytes, not just the declared type → otherwise `415 unsupported_media_type`.
- Stored in the `post-images` bucket under a server-generated name (the client filename isn't used).

`201`: `{ "url": "https://…/post-images/…", "content_type": "image/png", "size": 1234 }`.

### Token management (cookie session only)

`GET /api/v1/tokens` → `200`: `{ "items": [{ "id", "name", "scopes", "created_at", "expires_at" }] }`
(the caller's own active tokens).

`POST /api/v1/tokens`, body `{ "name": string (1–100), "scopes": Scope[] (≥1), "expires_in_days": 1–90 (default 30) }`.
The requested scopes must be a subset of the caller's role scopes, otherwise `403 forbidden`. At most
10 active tokens per user (`409 conflict` beyond that). `201`:
```json
{ "token": "pp_…", "meta": { "id": "uuid", "name": "…", "scopes": [], "created_at": "…", "expires_at": "…" } }
```
The token string is returned **only** in this response and never stored server-side.

`DELETE /api/v1/tokens/:id` → `200`: `{ "deleted": true, "id": "uuid" }` (revokes immediately).

## 6. Content rules for v1 writes

- `content_markdown` is limited to 200 000 characters and `content_lexical` to 2 MB of JSON; a larger
  payload is rejected with `validation_failed` before any conversion or parsing. In addition, a
  single text block — a run of consecutive non-blank lines — may not exceed 10 000 characters
  (fenced code blocks are exempt); a larger block is rejected with `validation_failed` and the
  message "a paragraph exceeds 10000 characters".
- `content_markdown` is converted Markdown → Lexical JSON (server-side, headless) → HTML.
- `content_lexical` must be an object with `root.type === "root"` and a `children` array. Every node
  `type` must be one the editor can render; unknown types are rejected with the offending paths in
  `details.fields.content_lexical`. The state is then parsed and re-serialized through the editor
  (unknown fields are dropped) before URL checks and storage.
- **URL rules** (applied to Lexical JSON from either source, before saving):
  - Image `src` and `featured_image_url`: `http(s)://…` or site-relative (`/…`). `data:` URIs are
    rejected with `validation_failed` and the hint "upload images with POST /api/v1/media first".
  - Link `url`: `http(s):`, `mailto:`, site-relative (`/…`) or fragment (`#…`) only. Anything else
    (e.g. `javascript:`) → `validation_failed`.
- The server **never fetches** remote URLs from submitted content. Remote image URLs are kept as-is.
- Supported Markdown: CommonMark headings, emphasis/strong/strikethrough, inline code, links,
  ordered/unordered/nested lists, block quotes, fenced code blocks with a language, images
  `![alt](src)`, and a paragraph containing only a YouTube URL (becomes an embed). GFM tables are
  supported if `docs/cli.md` says so; otherwise use `format=lexical` to round-trip tables.

## 7. Audit log

Every successful v1 mutation writes one line to the server log:
`{"evt":"pawpress.audit","action":"post.update","resource":"post","id":"…","userId":"…","tokenId":"…","ts":"…"}`.
It never includes content, tokens, or headers.

## 8. Scheduled publishing

`published_at` is the single source of truth:

| `published_at` | `status` | Public site |
|---|---|---|
| `null` | `draft` | hidden |
| > now | `scheduled` | hidden until that moment, then live automatically (no cron job; every public query filters `published_at <= now()`) |
| ≤ now | `published` | live |

- `publish_at` / `at` must be an ISO-8601 timestamp **with an explicit offset or `Z`** (no local
  times), strictly in the future, and at most 365 days ahead. Otherwise `validation_failed`. The server
  stores it in UTC.
- A scheduled post counts as "published" for permissions: changing, rescheduling, or editing it needs
  `posts:publish`. A draft-only token can't alter content that is queued to go live.
- Public pages, category pages, and the anonymous `GET /api/posts` only show posts with
  `published_at <= now()`. Visiting the URL of a scheduled post returns 404 until it goes live.
- The web editor offers Draft / Publish now / Schedule (date and time in the browser's time zone, shown
  with the zone).

## 9. Edit locks (who is editing)

A post can have at most one **edit lock**, a lease held by one editing session. A session is either a
human in the web editor (cookie session) or an agent (token). Locks make both sides aware of each
other. Optimistic concurrency (`if_updated_at`) still applies as a second line of defence.

Lock object, as returned by the endpoints below and embedded as `edit_lock` in `GET /posts/:idOrSlug`:
```json
{
  "session_id": "uuid",           // only returned to the session that holds it
  "holder": { "kind": "user" | "agent", "label": "alice@example.com" | "agent \"weekly-writer\" (alice@example.com)", "user_id": "uuid" },
  "acquired_at": "…", "expires_at": "…"
}
```

Rules:
- **Humans can override; agents can't.** The web editor can take over a lock held by anyone (force).
  A token can only acquire a lock that is free or expired, or that its own session already holds.
- **Agents are refused while someone else holds the lock.** Any token mutation of a post (PATCH,
  publish, unpublish, delete) fails with `409 locked` if another session holds an unexpired lock,
  regardless of who. `details.holder` identifies the holder, and `details.taken_over` is `true` when
  the caller's own session had held it and lost it to a takeover.
- Leases expire: web editor sessions after 2 minutes without a heartbeat (the editor heartbeats every
  30 s while the page is open); agent sessions after `ttl_seconds` (default 900, max 3600), renewed by
  re-acquiring with the same session. An expired lock counts as free.
- Acquiring a lock needs the same scopes as editing the post (`posts:write`, plus `posts:publish` if it's
  published or scheduled).
- **Graceful degradation:** locks live in the `post_edit_locks` table
  (`supabase/migrations/…_post_edit_locks.sql`, applied by the site owner). Until it exists, lock
  endpoints return `200 { "locking": "unavailable", "lock": null }`, mutations aren't lock-checked, and
  `if_updated_at` is the only protection.

### `POST /api/v1/posts/:id/lock`
Body `{ "session_id"?: uuid, "ttl_seconds"?: 60–3600 }`. Omit `session_id` to start a new session;
pass it to renew your own. `200 { "locking": "enabled", "lock": Lock }`, or `409 locked`.

### `DELETE /api/v1/posts/:id/lock`
Header `X-PawPress-Lock-Session: <session_id>`. Releases your own session's lock (no-op if you don't
hold it). `200 { "released": boolean }`.

### Lock session on mutations
Token mutations may send `X-PawPress-Lock-Session: <session_id>`. The request succeeds if no one else
holds an unexpired lock. With a header the caller is "this session"; without one, any unexpired lock
blocks it. A successful PATCH does **not** release the lock; the CLI releases it explicitly after
`push`.
