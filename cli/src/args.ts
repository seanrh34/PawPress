import { parseArgs } from 'node:util';
import type { ParseArgsConfig } from 'node:util';
import { usageError } from './errors';
import type { GlobalFlags } from './deps';

export type OptionSpec = NonNullable<ParseArgsConfig['options']>;

export interface ParsedOptions {
  values: Record<string, unknown>;
  positionals: string[];
}

export function parseOptions(
  args: string[],
  options: OptionSpec,
  allowPositionals = false,
): ParsedOptions {
  try {
    const parsed = parseArgs({ args, options, allowPositionals, strict: true });
    return {
      values: parsed.values as Record<string, unknown>,
      positionals: parsed.positionals as string[],
    };
  } catch (error) {
    throw usageError(error instanceof Error ? error.message : 'invalid arguments');
  }
}

export function optString(values: Record<string, unknown>, key: string): string | undefined {
  const value = values[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw usageError(`--${key} expects a value`);
  return value;
}

export function optBool(values: Record<string, unknown>, key: string): boolean {
  return values[key] === true;
}

export interface GlobalParseResult {
  globals: GlobalFlags;
  rest: string[];
}

export function extractGlobals(argv: string[]): GlobalParseResult {
  const globals: GlobalFlags = { json: false, help: false, version: false };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] ?? '';
    if (token === '--') {
      rest.push(...argv.slice(i + 1));
      break;
    }
    if (token === '--json') {
      globals.json = true;
      continue;
    }
    if (token === '--help' || token === '-h') {
      globals.help = true;
      continue;
    }
    if (token === '--version') {
      globals.version = true;
      continue;
    }
    if (token === '--url') {
      globals.url = takeValue(argv, ++i, '--url');
      continue;
    }
    if (token.startsWith('--url=')) {
      globals.url = token.slice('--url='.length);
      continue;
    }
    if (token === '--token') {
      globals.token = takeValue(argv, ++i, '--token');
      continue;
    }
    if (token.startsWith('--token=')) {
      globals.token = token.slice('--token='.length);
      continue;
    }
    rest.push(token);
  }
  return { globals, rest };
}

function takeValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined) throw usageError(`${flag} requires a value`);
  return value;
}
