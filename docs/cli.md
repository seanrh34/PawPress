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
| `posts:write` | create drafts, and edit posts that **aren't** published |
| `posts:publish` | publish/unpublish, edit already-published posts, create posts as published |
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
status: draft             # draft | published
updated_at: 2026-10-06T12:00:00.123456+00:00   # read-only; used for conflict detection
---
```

- **Don't edit `id` or `updated_at`.** `push` sends `updated_at` so the server can reject your
  change if someone else edited the post since you pulled it.
- **Use `--write-back`** so the file gets the new `updated_at`. Otherwise your next push of the same
  file conflicts.
- Changing `status` or editing a published post needs `posts:publish`.

### Creating a post

Write a file without an `id` (`title` and `category` are required), then push it:

```sh
pawpress posts push new-post.md --write-back --json   # created as a draft
```

Or: `pawpress posts create --title "T" --category news --file body.md --json`.

### Handling conflicts (exit code 5)

The post changed on the server after you pulled it. **Don't use `--force` by default.** Pull it
again into a new file, merge your changes into the fresh version, and push that. Only use `--force`
if the human tells you to overwrite their changes. Exit 5 on create means the slug is taken: pick a
different `slug`.

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
pawpress posts list [--status draft|published|all] [--category <slug>] [--search <q>] [--limit N] [--offset N]
pawpress posts get <id|slug> [--format markdown|lexical|html] [-o file]
pawpress posts pull <id|slug> [-o file.md]
pawpress posts push <file.md> [--publish] [--dry-run] [--force] [--write-back] [--allow-outside-dir]
pawpress posts create --title T --category C [--slug S] [--excerpt E] (--file f.md | --stdin) [--publish] [--dry-run] [--allow-outside-dir]
pawpress posts update <id> [--title T] [--slug S] [--excerpt E] [--category C] [--featured-image URL]
                           [--file f.md | --stdin] [--if-updated-at ts] [--dry-run] [--allow-outside-dir]
pawpress posts publish <id> | unpublish <id>
pawpress posts delete <id> --yes [--dry-run]
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
| 5 | conflict (stale `updated_at`, slug taken, category still has posts) | pull, merge, push again |
| 6 | validation (400/413/415), e.g. unsafe URL or file too large | read `error.details`, fix the input |
| 7 | network (server unreachable, timeout) | check the URL and connectivity |
