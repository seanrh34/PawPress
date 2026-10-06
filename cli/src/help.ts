import { VERSION } from './deps';

const GLOBAL_FLAGS = `
Global flags:
  --url <site>      PawPress site URL (overrides env and config)
  --token <token>   API token (overrides env and config; prefer PAWPRESS_TOKEN)
  --json            Print a single JSON document to stdout
  -h, --help        Show help
  --version         Show version

Environment:
  PAWPRESS_URL, PAWPRESS_TOKEN, PAWPRESS_OUTPUT=json,
  PAWPRESS_HEADERS (newline-separated "Name: value" extra request headers)
`;

const ROOT = `pawpress ${VERSION} - manage a PawPress site over the HTTP API

Usage: pawpress <command> [options]

Commands:
  auth        Login, check status, logout
  posts       List, get, pull, push, create, update, publish, delete posts
  categories  List, create, update, delete categories
  media       Upload media

Run "pawpress <command> --help" for details.
${GLOBAL_FLAGS}`;

const COMMANDS: Record<string, string> = {
  auth: `Usage: pawpress auth <login|status|logout>

  auth login --url <site>   Read a token from stdin, validate it and save it
  auth status               Show the authenticated user, scopes and expiry
  auth logout               Remove the saved token`,
  'auth login': `Usage: pawpress auth login --url <site>

Reads the API token from stdin (never from argv), validates it with GET /api/v1/me
and saves it to the config file. Example:
  echo "$PAWPRESS_TOKEN" | pawpress auth login --url https://blog.example.com`,
  'auth status': `Usage: pawpress auth status

Shows the site URL, user email/role, token id/name, effective scopes and expiry.
The token itself is never printed.`,
  'auth logout': `Usage: pawpress auth logout

Removes the saved token from the config file.`,
  posts: `Usage: pawpress posts <list|get|pull|push|create|update|publish|unpublish|delete> [options]`,
  'posts list': `Usage: pawpress posts list [options]

  --status draft|published|all   Filter by status (default all)
  --category <slug>              Filter by category slug
  --search <q>                   Substring match on title
  --limit <n>                    Page size (1-100, default 20)
  --offset <n>                   Pagination offset (default 0)`,
  'posts get': `Usage: pawpress posts get <id|slug> [options]

  --format markdown|lexical|html   Content format (default markdown)
  -o, --output <file>              Write the content to a file`,
  'posts pull': `Usage: pawpress posts pull <id|slug> [-o <file.md>]

Writes the post as Markdown with YAML front matter (id, title, slug, category,
excerpt, featured_image, status, updated_at). Prints to stdout when -o is omitted.`,
  'posts push': `Usage: pawpress posts push <file.md> [options]

Creates a post when the front matter has no id, otherwise updates it.
  --publish      Publish the post
  --dry-run      Show the request without sending it
  --force        Skip the updated_at concurrency check on update
  --write-back   Rewrite the file with the returned id/updated_at and image URLs

Update sends "status" only when --publish is given or the front matter has a
status field. Without --write-back the local updated_at becomes stale.

Only relative image paths (e.g. img/x.png, ./x.png) are uploaded; site-relative
(/...) and remote (http/data) references are left untouched.`,
  'posts create': `Usage: pawpress posts create --title T --category C [--slug S] [--excerpt E]
                                  (--file f.md | --stdin) [--publish] [--dry-run]

Only relative image paths (e.g. img/x.png, ./x.png) are uploaded; site-relative
(/...) and remote (http/data) references are left untouched.`,
  'posts update': `Usage: pawpress posts update <id> [options]

  --title T, --slug S, --excerpt E, --category C, --featured-image URL
  --file f.md | --stdin        Replace the content
  --if-updated-at <ts>         Optimistic concurrency check
  --dry-run                    Show the request without sending it`,
  'posts publish': `Usage: pawpress posts publish <id>`,
  'posts unpublish': `Usage: pawpress posts unpublish <id>`,
  'posts delete': `Usage: pawpress posts delete <id> --yes [--dry-run]

Requires --yes (there is no interactive prompt).`,
  categories: `Usage: pawpress categories <list|create|update|delete> [options]`,
  'categories list': `Usage: pawpress categories list`,
  'categories create': `Usage: pawpress categories create --name N --slug S --description D [--dry-run]`,
  'categories update': `Usage: pawpress categories update <id> [--name N] [--slug S] [--description D] [--dry-run]`,
  'categories delete': `Usage: pawpress categories delete <id> --yes [--dry-run]

Requires --yes (there is no interactive prompt).`,
  media: `Usage: pawpress media upload <path>`,
  'media upload': `Usage: pawpress media upload <path>

Uploads an image (png, jpg, jpeg, webp, gif, avif) and prints its URL.
JSON mode prints the full API response.`,
};

export function helpFor(tokens: string[]): string {
  const [group, sub] = tokens;
  if (group && sub) {
    const command = COMMANDS[`${group} ${sub}`];
    if (command) return `${command}\n${GLOBAL_FLAGS}`;
  }
  if (group && COMMANDS[group]) {
    return `${COMMANDS[group]}\n${GLOBAL_FLAGS}`;
  }
  if (group) return ROOT;
  return ROOT;
}
