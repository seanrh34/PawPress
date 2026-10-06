# pawpress-cli

Command-line client for a PawPress site's HTTP API v1. Built for AI agents and humans:
manage posts, categories and media without a browser.

Requires Node.js 20 or newer.

## Install

```sh
cd cli
npm install
npm run build
npm link        # makes the `pawpress` binary available on your PATH
```

You can also run it directly without linking: `node dist/index.js --help`.

## Configuration

Resolution order (highest first):

1. `--url` / `--token` flags
2. `PAWPRESS_URL` / `PAWPRESS_TOKEN` environment variables
3. the config file

The config file lives at `$XDG_CONFIG_HOME/pawpress/config.json` or, if that is
unset, `~/.config/pawpress/config.json`. It is written with mode `0600` (directory
`0700`) and holds `{ "url", "token" }`.

```sh
echo "$PAWPRESS_TOKEN" | pawpress auth login --url https://blog.example.com
pawpress auth status
pawpress auth logout
```

Extra request headers (for example a Vercel protection-bypass header on preview
deployments) can be supplied through `PAWPRESS_HEADERS`, one `Name: value` per line:

```sh
PAWPRESS_HEADERS=$'x-vercel-protection-bypass: <secret>' pawpress posts list
```

Tokens and header values are never printed; they are redacted from all output.

## Commands

```
pawpress auth login --url <site>          # token read from stdin
pawpress auth status | auth logout

pawpress posts list [--status ...] [--category <slug>] [--search <q>] [--limit N] [--offset N]
pawpress posts get <id|slug> [--format markdown|lexical|html] [-o file]
pawpress posts pull <id|slug> [-o file.md]
pawpress posts push <file.md> [--publish] [--dry-run] [--force] [--write-back]
pawpress posts create --title T --category C [--slug S] [--excerpt E] (--file f.md | --stdin) [--publish] [--dry-run]
pawpress posts update <id> [--title T] [--slug S] [--excerpt E] [--category C] [--featured-image URL] [--file f.md | --stdin] [--if-updated-at ts] [--dry-run]
pawpress posts publish <id> | posts unpublish <id>
pawpress posts delete <id> --yes [--dry-run]

pawpress categories list
pawpress categories create --name N --slug S --description D [--dry-run]
pawpress categories update <id> [--name N] [--slug S] [--description D] [--dry-run]
pawpress categories delete <id> --yes [--dry-run]

pawpress media upload <path>
```

Global flags: `--json`, `--url <site>`, `--token <token>`, `-h/--help`, `--version`.
`--json` (or `PAWPRESS_OUTPUT=json`) prints exactly one JSON document to stdout.

Push reads YAML front matter (`id`, `title`, `slug`, `category`, `excerpt`,
`featured_image`, `status`, `updated_at`) followed by Markdown. Local images are
uploaded automatically and their references rewritten. Updating sends
`if_updated_at` from the front matter unless `--force` is given.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | unexpected / internal error (including HTTP 500 and redirects) |
| 2 | usage error (bad args, missing `--yes`, local file problems) |
| 3 | authentication/authorization (401/403) |
| 4 | not found (404) |
| 5 | conflict (409, e.g. `if_updated_at` mismatch or taken slug) |
| 6 | validation (400/413/415) |
| 7 | network error (no HTTP response) |
