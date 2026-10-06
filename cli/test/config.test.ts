import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  configFilePath,
  normalizeBaseUrl,
  parseHeaders,
  readConfigFile,
  writeConfigFile,
} from '../src/config';
import { createOutput } from '../src/output';
import { resolveSettings } from '../src/runtime';
import type { Context } from '../src/runtime';
import { configEnv, makeHarness, makeTempDir } from './helpers';

function makeContext(env: Record<string, string | undefined>, flags: Partial<Context['globals']> = {}): Context {
  const harness = makeHarness({ env, homedir: '/home/test' });
  return {
    deps: harness.deps,
    out: createOutput({ json: false, stdout: () => undefined, stderr: () => undefined }),
    globals: { json: false, help: false, version: false, ...flags },
  };
}

describe('config resolution', () => {
  it('prefers flags over env over the config file', async () => {
    const dir = await makeTempDir();
    const env = configEnv(dir);
    await writeConfigFile(configFilePath(env, '/home/test'), {
      url: 'https://file.example',
      token: 'file-token',
    });

    const fromFile = await resolveSettings(makeContext(env));
    expect(fromFile.url).toBe('https://file.example');
    expect(fromFile.token).toBe('file-token');

    const fromEnv = await resolveSettings(
      makeContext({ ...env, PAWPRESS_URL: 'https://env.example', PAWPRESS_TOKEN: 'env-token' }),
    );
    expect(fromEnv.url).toBe('https://env.example');
    expect(fromEnv.token).toBe('env-token');

    const fromFlags = await resolveSettings(
      makeContext(
        { ...env, PAWPRESS_URL: 'https://env.example', PAWPRESS_TOKEN: 'env-token' },
        { url: 'https://flag.example', token: 'flag-token' },
      ),
    );
    expect(fromFlags.url).toBe('https://flag.example');
    expect(fromFlags.token).toBe('flag-token');
  });

  it('reads an existing config file and returns {} when missing', async () => {
    const dir = await makeTempDir();
    const env = configEnv(dir);
    expect(await readConfigFile(configFilePath(env, '/home/test'))).toEqual({});
    await writeConfigFile(configFilePath(env, '/home/test'), { url: 'https://a.b' });
    expect(await readConfigFile(configFilePath(env, '/home/test'))).toEqual({ url: 'https://a.b' });
  });

  it('writes the config file with mode 0600 and directory 0700', async () => {
    const dir = await makeTempDir();
    const env = configEnv(dir);
    const file = configFilePath(env, '/home/test');
    await writeConfigFile(file, { url: 'https://a.b', token: 'secret' });
    const mode = (await stat(file)).mode & 0o777;
    expect(mode).toBe(0o600);
    const dirMode = (await stat(join(dir, 'pawpress'))).mode & 0o777;
    expect(dirMode).toBe(0o700);
  });
});

describe('PAWPRESS_HEADERS parsing', () => {
  it('parses newline-separated Name: value lines', () => {
    expect(parseHeaders('X-A: 1\nX-B: two:three')).toEqual({ 'X-A': '1', 'X-B': 'two:three' });
    expect(parseHeaders('')).toEqual({});
    expect(parseHeaders(undefined)).toEqual({});
    expect(parseHeaders('  \n X-C : spaced \r\n')).toEqual({ 'X-C': 'spaced' });
  });

  it('rejects malformed lines without echoing the value', () => {
    expect(() => parseHeaders('no-colon-secret-value')).toThrowError(/invalid PAWPRESS_HEADERS/);
  });
});

describe('URL rules', () => {
  it('strips a trailing slash', () => {
    expect(normalizeBaseUrl('https://blog.example/')).toBe('https://blog.example');
    expect(normalizeBaseUrl('https://blog.example')).toBe('https://blog.example');
  });

  it('allows http only for localhost', () => {
    expect(normalizeBaseUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeBaseUrl('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
    expect(normalizeBaseUrl('http://[::1]:3000')).toBe('http://[::1]:3000');
    expect(() => normalizeBaseUrl('http://blog.example')).toThrowError(/localhost/);
  });

  it('rejects non-http(s) URLs', () => {
    expect(() => normalizeBaseUrl('ftp://blog.example')).toThrowError(/http/);
    expect(() => normalizeBaseUrl('not a url')).toThrowError(/invalid URL/);
  });
});
