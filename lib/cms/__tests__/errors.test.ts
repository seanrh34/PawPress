import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, fromZodError, toLegacyResponse, toResponse } from '../errors';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ApiError', () => {
  it('maps codes to HTTP statuses', () => {
    expect(ApiError.unauthorized().status).toBe(401);
    expect(ApiError.forbidden().status).toBe(403);
    expect(ApiError.notFound().status).toBe(404);
    expect(ApiError.conflict('x').status).toBe(409);
    expect(ApiError.validation('x').status).toBe(400);
    expect(ApiError.payloadTooLarge().status).toBe(413);
    expect(ApiError.unsupportedMediaType().status).toBe(415);
    expect(ApiError.internal().status).toBe(500);
  });

  it('carries details', () => {
    const error = ApiError.conflict('taken', { current_updated_at: 'now' });
    expect(error.code).toBe('conflict');
    expect(error.details).toEqual({ current_updated_at: 'now' });
  });
});

describe('fromZodError', () => {
  it('produces validation_failed with dot-joined field paths', () => {
    const schema = z.object({
      title: z.string(),
      meta: z.object({ slug: z.string() }),
    });
    const result = schema.safeParse({ title: 1, meta: { slug: 2 } });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('unreachable');

    const error = fromZodError(result.error);
    expect(error.code).toBe('validation_failed');
    expect(error.status).toBe(400);

    const details = error.details as { fields: Record<string, string[]> };
    expect(details.fields.title).toHaveLength(1);
    expect(details.fields['meta.slug']).toHaveLength(1);
  });
});

describe('toResponse', () => {
  it('serialises ApiError with code, message and details', async () => {
    const error = ApiError.validation('bad', { fields: { title: ['nope'] } });
    const response = toResponse(error);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: 'validation_failed',
        message: 'bad',
        details: { fields: { title: ['nope'] } },
      },
    });
  });

  it('omits details when there are none', async () => {
    const body = await toResponse(ApiError.notFound('missing')).json();
    expect(body).toEqual({
      error: { code: 'not_found', message: 'missing' },
    });
  });

  it('turns unknown errors into a generic 500 without leaking the message', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = toResponse(new Error('relation "secret_table" does not exist'));
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body).toEqual({
      error: { code: 'internal', message: 'Internal server error' },
    });
    expect(JSON.stringify(body)).not.toContain('secret_table');
    expect(spy).toHaveBeenCalled();
  });
});

describe('toLegacyResponse', () => {
  it('uses the { error: string } shape for ApiError', async () => {
    const response = toLegacyResponse(ApiError.conflict('already exists'));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'already exists' });
  });

  it('uses a generic 500 for unknown errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = toLegacyResponse(new Error('boom'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
