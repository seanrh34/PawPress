import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/main';
import type { CliDeps } from '../src/deps';
import type { Env } from '../src/config';
import type { FetchInit, FetchLike, FetchResponseLike } from '../src/http';

export function response(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): FetchResponseLike {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers?.[name.toLowerCase()] ?? null },
    text: async () => text,
  };
}

export interface FetchCall {
  url: string;
  init?: FetchInit;
}

export interface FetchHarness {
  fetch: FetchLike;
  calls: FetchCall[];
  methods(): string[];
}

export function makeFetch(
  handler: (url: string, init: FetchInit | undefined) => FetchResponseLike | Promise<FetchResponseLike>,
): FetchHarness {
  const calls: FetchCall[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return {
    fetch,
    calls,
    methods: () => calls.map((call) => call.init?.method ?? 'GET'),
  };
}

export interface Harness {
  deps: CliDeps;
  run(argv: string[]): Promise<number>;
  stdoutText(): string;
  stderrText(): string;
  outLines: string[];
  errLines: string[];
}

export function makeHarness(overrides: Partial<CliDeps> = {}): Harness {
  const out: string[] = [];
  const err: string[] = [];
  const deps: CliDeps = {
    env: {},
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    fetch: async () => {
      throw new Error('fetch not stubbed');
    },
    stdin: async () => '',
    cwd: process.cwd(),
    homedir: '/home/test',
    version: '0.1.0',
    ...overrides,
  };
  return {
    deps,
    outLines: out,
    errLines: err,
    run: (argv) => main(argv, deps),
    stdoutText: () => out.join(''),
    stderrText: () => err.join(''),
  };
}

export async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'pawpress-test-'));
}

export async function writeTempFile(dir: string, name: string, content: string): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, content, 'utf8');
  return path;
}

export function configEnv(dir: string): Env {
  return { XDG_CONFIG_HOME: dir };
}
