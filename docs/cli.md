# Using PawPress from the command line (and from AI agents)

`pawpress` is a command-line client for a PawPress site. It's designed so AI coding agents
(Claude Code, OpenCode, and similar) can manage posts, categories, and images without a browser.
Everything is non-interactive, output can be machine-readable, and every failure has a stable exit
code.

This page is both the setup guide for site owners and the instructions you can hand to an agent.
The HTTP API underneath is specified in [`docs/cli-api.md`](./cli-api.md).

## 1. Setup (site owner)

1. **Server:** set `PAWPRESS_TOKEN_SECRET` in the site's environment, at least 32 random bytes:
   `openssl rand -base64 48`. Without it, token authentication is disabled (every CLI request gets
   `401`). Rotating it invalidates every token.
2. **Create a token:** log in to `/admin`, open **API Tokens**, choose a name, scopes, and an expiry
   (7, 30, or 90 days), and copy the token. It's shown **once**.
3. **Install the CLI** (Node.js 20+):
   ```sh
   cd cli && npm install && npm run build && npm link
   ```
4. **Log in.** The token is read from stdin, so it never ends up in your shell history or the
   process list:
   ```sh
   printf '%s' "$PAWPRESS_TOKEN" | pawpress auth login --url https://your-site.example
   pawpress auth status
   ```
   Alternatively, skip the config file and set `PAWPRESS_URL` and `PAWPRESS_TOKEN` in the agent's
   environment.

### Choosing scopes (least privilege)

| Scope | Lets the token… |
|---|---|
| `posts:read` | list and read posts, including drafts |
| `posts:write` | create drafts, and edit posts that are **neither published nor scheduled** |
| `posts:publish` | publish now, schedule, unpublish/unschedule, edit published or scheduled posts, create posts as published or scheduled |
| `posts:delete` | delete posts |
| `categories:write` | create, rename, and delete categories |
| `media:upload` | upload images |

**Recommended for agents: `posts:read`, `posts:write`, `media:upload`.** With these, an agent can
write and revise drafts, but a human publishes them. Only grant `posts:publish` or `posts:delete` to
agents you'd trust to change the live site. A token can never manage users or other tokens. A token
also never has more power than its owner: if the owner is demoted or removed, the token stops
working immediately.

### Preview deployments behind Vercel Authentication

Pass the protection-bypass header with `PAWPRESS_HEADERS` (newline-separated `Name: value`):

```sh
export PAWPRESS_HEADERS="x-vercel-protection-bypass: $BYPASS_SECRET"
```

Header values are never printed.

## 2. Instructions for agents

> Paste this section into your agent's instructions (e.g. `CLAUDE.md` / `AGENTS.md`).

You can manage this PawPress site with the `pawpress` CLI. Rules:

- **Always pass `--json`** and parse stdout. On success stdout is exactly one JSON document; on
  failure stdout is empty and stderr holds `{"error":{"code","message","details"}}`.
- **Check the exit code** (table below). Don't retry auth (3) or validation (6) errors unchanged.
- **Never print, log, or echo the token** or `PAWPRESS_HEADERS`. Don't pass the token as a CLI
  argument; it's already configured.
- Start with `pawpress auth status --json` to see which scopes you have. Don't attempt actions your
  scopes don't allow; ask the human instead.
- Before deleting anything, confirm with the human. Destructive commands require `--yes`.
- Use `--dry-run` to preview any write; it sends nothing that changes the site.

### Editing an existing post: pull → edit → push

```sh
pawpress posts pull my-post-slug -o post.md --json   # Markdown + YAML front matter
# ... edit post.md (body and/or front matter) ...
pawpress posts push post.md --write-back --json     # updates the post; refreshes updated_at in the file
```

The front matter looks like this:

```yaml
---
id: 6f1c…                 # present = update; absent = create
title: My post
slug: my-post
category: news            # category slug
excerpt: One-line summary
featured_image: https://…/cover.png   # or a relative path to a local file
status: draft             # draft | scheduled | published
publish_at: 2026-10-20T09:00:00+08:00  # only for status: scheduled
updated_at: 2026-10-06T12:00:00.123456+00:00   # read-only; used for conflict detection
lock_session: 7c9e…       # read-only; the edit lock you hold (if any)
lock_expires_at: 2026-10-06T12:15:00+00:00     # read-only
---
```

- **Don't edit `id`, `updated_at`, `lock_session` or `lock_expires_at`.** `push` sends `updated_at` so the
  server can reject your change if someone else edited the post since you pulled it, and sends
  `lock_session` so the server knows you still hold the edit lock.
- **Use `--write-back`** so the file gets the new `updated_at`. Otherwise your next push of the same
  file conflicts.
- Changing `status` or editing a published **or scheduled** post needs `posts:publish`.

### Edit locks (who is editing)

`posts pull` acquires an **edit lock** by default (an agent lease of 900 s, or `--lock-ttl <seconds>`,
60–3600), so a human opening the same post in the web editor sees a warning. The lock must be
available on the server: locking needs the `post_edit_locks` migration. Until it is applied, `pull`
prints `edit locking unavailable on this site; relying on updated_at conflict detection` on stderr
and continues.

- If a human or another agent is already editing, `pull` **writes nothing** and exits **5** with
  `error: not editing: <message>` naming them (JSON: `error.code` is `"locked"` and
  `error.details.holder` says who). Do **not** retry in a loop and do **not** try to force your way
  in: report it and try again on the next scheduled run.
- If the token can't edit the post (it's published/scheduled and the token lacks `posts:publish`),
  `pull` prints `not locking: this token can't edit this post` on stderr and continues **without** a
  lock; `posts lock` still fails with exit 3.
- An agent may hold at most **5 locks** per user. A sixth `pull` (or `lock`) exits **5** with the
  server message `Too many active edit locks for this user (max 5); release some with pawpress posts
  unlock`. Release one with `pawpress posts unlock <id> --session <uuid>` and retry.
- `push` sends `lock_session` and releases the lock on success. Use `--keep-lock` for a long edit and
  renew it with `pawpress posts lock <id|slug> --session <uuid>`; release it early with
  `pawpress posts unlock <id> --session <uuid>`. `--no-lock` on `pull` skips locking entirely.
- If you lose the lock to an admin takeover, `push` exits **5** with
  `error: failed to apply edits: an admin took over editing; your changes are still in <file>`.
  Your file is not modified.
- While you hold a lock, pass `--session <uuid>` to `posts update`, `publish`, `unpublish` and
  `delete` so your own lock doesn't refuse you (`posts update --file f.md` also reads the
  `lock_session` from that file's front matter). Without it, any active lock held by someone else
  refuses them with `error: <verb> refused: <message>` (exit 5).

### Scheduling a post

`published_at` is the single source of truth: `status` is never stored, it is derived (null =
draft, in the future = scheduled, otherwise published). Scheduling therefore needs `posts:publish` —
a draft-only token cannot schedule or reschedule anything.

```sh
# From a file's front matter (`status: scheduled` + `publish_at`):
pawpress posts push scheduled-post.md --write-back --json

# Or directly, without editing front matter:
pawpress posts push scheduled-post.md --at 2026-10-20T09:00:00+08:00 --json
pawpress posts create --title "T" --category news --file body.md --at 2026-10-20T09:00:00+08:00 --json
pawpress posts publish <id> --at 2026-10-20T09:00:00+08:00 --json   # reschedule
```

- Times **must be explicit**: an ISO-8601 timestamp with a `Z` or a numeric offset
  (`2026-10-20T09:00:00+08:00`), strictly in the future. A bare local time like
  `2026-10-20T09:00:00` is rejected locally (exit 2). The server stores UTC and will accept times at
  most 365 days ahead.
- `--publish` still means "publish now" and cannot be combined with `--at` (exit 2).
- To **cancel** a schedule, unpublish it and it becomes a draft again:
  `pawpress posts unpublish <id> --json`.
- A scheduled post counts as published for permissions: editing its content also needs
  `posts:publish`.
- Scheduled posts stay hidden from the public site (and the anonymous API) until they go live; their
  URL returns 404 until then.

### Creating a post

Write a file without an `id` (`title` and `category` are required), then push it:

```sh
pawpress posts push new-post.md --write-back --json   # created as a draft
```

Or: `pawpress posts create --title "T" --category news --file body.md --json`.

### Handling conflicts (exit code 5)

Code 5 covers two distinct situations, distinguished by `error.code` in JSON mode:

- **`"locked"` — someone is editing.** A human admin or another agent holds the edit lock. `pull`
  exits with `not editing: <message>` and `push` with `failed to apply edits: <message>`, both naming
  the holder. **Do not retry in a loop and do not use `--force`.** Report who is editing and try
  again on the next scheduled run.
- **`"conflict"` — the post changed since you pulled it.** `updated_at` no longer matches. **Don't use
  `--force` by default.** Pull it again into a new file, merge your changes into the fresh version,
  and push that. Only use `--force` if the human tells you to overwrite their changes. Exit 5 on
  create means the slug is taken: pick a different `slug`.

### Images

- Reference local images with **relative** paths: `![Diagram](./img/diagram.png)` or
  `featured_image: ./cover.jpg`. On push/create the CLI uploads them (`media:upload`) and rewrites the
  references to the uploaded URLs. Use `--write-back` to also save those URLs into your file.
- Allowed: png, jpeg, webp, gif, avif; max 4 MB each. The file is checked locally before it is read
  (over-size → exit 6).
- The resolved path must stay inside the Markdown file's own directory. Pass `--allow-outside-dir` on
  push/create/update to upload a file outside it deliberately. Symbolic links are always rejected
  (exit 2).
- Remote `https://…` image URLs and site paths (`/…`) are kept as-is; the server never downloads
  them. `data:` URIs are rejected.

### Supported Markdown

Headings, bold/italic/strikethrough, inline code, links (`http(s)`, `mailto:`, `/path`, `#anchor`
only), ordered/unordered/nested lists, block quotes, fenced code blocks with a language, images, GFM
tables, and YouTube embeds: put a YouTube URL alone on its own line. Raw HTML and horizontal rules
aren't supported. Use `posts get <id> --format lexical` if you need the exact editor JSON.

A single text block (a run of consecutive non-blank lines, i.e. one paragraph) must be at most
10 000 characters. Fenced code blocks are exempt. Larger paragraphs are rejected with exit 6
("a paragraph exceeds 10000 characters"), so split very long text with blank lines.

## 3. Command reference

```
pawpress auth login --url <site>        # token from stdin
pawpress auth status | logout
pawpress posts list [--status draft|scheduled|published|all] [--category <slug>] [--search <q>] [--limit N] [--offset N]
pawpress posts get <id|slug> [--format markdown|lexical|html] [-o file]
pawpress posts pull <id|slug> [-o file.md] [--lock-ttl <s>] [--no-lock]
pawpress posts push <file.md> [--publish] [--at <ISO>] [--dry-run] [--force] [--write-back] [--keep-lock] [--allow-outside-dir]
pawpress posts create --title T --category C [--slug S] [--excerpt E] (--file f.md | --stdin) [--publish] [--at <ISO>] [--dry-run] [--allow-outside-dir]
pawpress posts update <id> [--title T] [--slug S] [--excerpt E] [--category C] [--featured-image URL]
                           [--file f.md | --stdin] [--if-updated-at ts] [--session <uuid>] [--dry-run] [--allow-outside-dir]
pawpress posts publish <id> [--at <ISO>] [--session <uuid>] | unpublish <id> [--session <uuid>]
pawpress posts delete <id> --yes [--session <uuid>] [--dry-run]
pawpress posts lock <id|slug> [--ttl <s>] [--session <uuid>]
pawpress posts unlock <id> --session <uuid>
pawpress categories list
pawpress categories create --name N --slug S --description D [--dry-run]
pawpress categories update <id> [--name N] [--slug S] [--description D] [--dry-run]
pawpress categories delete <id> --yes [--dry-run]
pawpress media upload <path>
```

Global flags: `--json` (or `PAWPRESS_OUTPUT=json`), `--url`, `--token`, `--help`, `--version`.
Ids for update/publish/unpublish/delete must be UUIDs (use `posts list` to find them); `get` and
`pull` also accept a slug.

Configuration precedence: flags → `PAWPRESS_URL`/`PAWPRESS_TOKEN` → `~/.config/pawpress/config.json`
(or under `$XDG_CONFIG_HOME`), which is written with mode `0600`. Plain `http://` is only accepted for
`localhost`.

## 4. Exit codes

| Code | Meaning | What to do |
|---|---|---|
| 0 | success | |
| 1 | unexpected server or client error | retry once later; report if it persists |
| 2 | usage error (bad arguments, missing `--yes`, missing/unsupported local file) | fix the command |
| 3 | authentication or permission (401/403) | check `auth status`; ask for a token with the needed scope |
| 4 | not found | check the id/slug with `posts list` |
| 5 | conflict (`conflict` = stale `updated_at`/taken slug; `locked` = someone else is editing) | for `conflict`: pull, merge, push again; for `locked`: report who and retry later |
| 6 | validation (400/413/415), e.g. unsafe URL or file too large | read `error.details`, fix the input |
| 7 | network (server unreachable, timeout) | check the URL and connectivity |
