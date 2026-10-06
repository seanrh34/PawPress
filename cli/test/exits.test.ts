import { describe, expect, it } from 'vitest';
import { apiErrorFromResponse } from '../src/http';
import { EXIT, exitCodeForError, exitCodeForStatus } from '../src/errors';
import { makeFetch, makeHarness, response } from './helpers';

const ENV = { PAWPRESS_URL: 'https://site.example', PAWPRESS_TOKEN: 'pp_test_token' };

const CASES: Array<[string, number, number]> = [
  ['unauthorized', 401, EXIT.AUTH],
  ['forbidden', 403, EXIT.AUTH],
  ['not_found', 404, EXIT.NOT_FOUND],
  ['conflict', 409, EXIT.CONFLICT],
  ['validation_failed', 400, EXIT.VALIDATION],
  ['payload_too_large', 413, EXIT.VALIDATION],
  ['unsupported_media_type', 415, EXIT.VALIDATION],
  ['internal', 500, EXIT.INTERNAL],
];

describe('exit code mapping', () => {
  it.each(CASES)('maps code %s (HTTP %i) to %i', (code, status, expected) => {
    const error = apiErrorFromResponse(status, JSON.stringify({ error: { code, message: 'nope' } }));
    expect(error.exitCode).toBe(expected);
    expect(error.code).toBe(code);
    expect(error.message).toBe('nope');
  });

  it('falls back to the HTTP status when the code is unknown', () => {
    expect(exitCodeForError(404, 'mystery')).toBe(EXIT.NOT_FOUND);
    expect(exitCodeForStatus(500)).toBe(EXIT.INTERNAL);
    expect(exitCodeForStatus(401)).toBe(EXIT.AUTH);
  });

  it('uses a non-JSON message for non-JSON bodies', () => {
    const error = apiErrorFromResponse(401, '<html>Vercel Authentication</html>');
    expect(error.exitCode).toBe(EXIT.AUTH);
    expect(error.message).toBe('HTTP 401 from server (non-JSON response)');
  });

  it('maps network failures to exit 7 including the host', async () => {
    const harness = makeFetch(() => {
      throw new Error('boom');
    });
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'list'])).toBe(7);
    expect(h.stderrText()).toMatch(/site\.example/);
    expect(h.stderrText()).not.toMatch(/pp_test_token/);
  });

  it('maps redirects to exit 1 with a URL hint', async () => {
    const harness = makeFetch(() => response(302, ''));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'list'])).toBe(1);
    expect(h.stderrText()).toMatch(/redirect/i);
  });

  it('maps a 500 to exit 1', async () => {
    const harness = makeFetch(() => response(500, { error: { code: 'internal', message: 'oops' } }));
    const h = makeHarness({ env: ENV, fetch: harness.fetch });
    expect(await h.run(['posts', 'list'])).toBe(1);
  });
});
