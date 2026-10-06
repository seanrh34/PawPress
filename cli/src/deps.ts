import { homedir as osHomedir } from 'node:os';
import type { Env } from './config';
import type { FetchLike } from './http';

export const VERSION = '0.1.0';

export interface GlobalFlags {
  url?: string;
  token?: string;
  json: boolean;
  help: boolean;
  version: boolean;
}

export interface CliDeps {
  env: Env;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  fetch: FetchLike;
  stdin: () => Promise<string>;
  cwd: string;
  homedir: string;
  version: string;
}

export function defaultDeps(): CliDeps {
  return {
    env: process.env as Env,
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    fetch: globalThis.fetch as unknown as FetchLike,
    stdin: readStdin,
    cwd: process.cwd(),
    homedir: osHomedir(),
    version: VERSION,
  };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString('utf8');
}
