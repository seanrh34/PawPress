import { extractGlobals } from './args';
import { CliError, EXIT, usageError } from './errors';
import { VERSION } from './deps';
import { helpFor } from './help';
import { createOutput } from './output';
import { createRedactor } from './redact';
import { collectSecrets } from './runtime';
import { authCommand } from './commands/auth';
import { postsCommand } from './commands/posts';
import { categoriesCommand } from './commands/categories';
import { mediaCommand } from './commands/media';
import type { CliDeps } from './deps';
import type { Context } from './runtime';
import type { Output } from './output';

export async function main(argv: string[], deps: CliDeps): Promise<number> {
  const { globals, rest } = extractGlobals(argv);
  const json = globals.json || deps.env.PAWPRESS_OUTPUT === 'json';
  const redact = createRedactor(collectSecrets(deps.env, deps.homedir, globals));
  const out = createOutput({
    json,
    stdout: (text) => deps.stdout(redact(text)),
    stderr: (text) => deps.stderr(redact(text)),
  });

  try {
    if (globals.version) {
      out.line(VERSION);
      return EXIT.OK;
    }
    if (globals.help) {
      out.raw(helpFor(rest));
      return EXIT.OK;
    }
    if (rest.length === 0) {
      deps.stderr(redact(helpFor([])));
      return EXIT.USAGE;
    }
    const ctx: Context = { deps, out, globals };
    await dispatch(ctx, rest);
    return EXIT.OK;
  } catch (error) {
    return reportError(out, error);
  }
}

async function dispatch(ctx: Context, rest: string[]): Promise<void> {
  const [group, ...tail] = rest;
  switch (group) {
    case 'auth':
      return authCommand(ctx, tail);
    case 'posts':
      return postsCommand(ctx, tail);
    case 'categories':
      return categoriesCommand(ctx, tail);
    case 'media':
      return mediaCommand(ctx, tail);
    case 'help':
      ctx.out.raw(helpFor(tail));
      return;
    default:
      throw usageError(`unknown command: ${group}. Run \`pawpress --help\` for usage.`);
  }
}

function reportError(out: Output, error: unknown): number {
  if (error instanceof CliError) {
    out.error({ message: error.message, code: error.code, details: error.details });
    return error.exitCode;
  }
  if (error instanceof Error) {
    out.error({ message: error.message });
    return EXIT.INTERNAL;
  }
  out.error({ message: String(error) });
  return EXIT.INTERNAL;
}
