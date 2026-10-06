import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';

export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation_failed'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'internal';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 400,
  payload_too_large: 413,
  unsupported_media_type: 415,
  internal: 500,
};

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }

  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError('unauthorized', message);
  }

  static forbidden(message = 'Forbidden', details?: unknown): ApiError {
    return new ApiError('forbidden', message, details);
  }

  static notFound(message = 'Not found'): ApiError {
    return new ApiError('not_found', message);
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError('conflict', message, details);
  }

  static validation(message: string, details?: unknown): ApiError {
    return new ApiError('validation_failed', message, details);
  }

  static payloadTooLarge(message = 'Payload too large'): ApiError {
    return new ApiError('payload_too_large', message);
  }

  static unsupportedMediaType(message = 'Unsupported media type'): ApiError {
    return new ApiError('unsupported_media_type', message);
  }

  static internal(message = 'Internal server error'): ApiError {
    return new ApiError('internal', message);
  }
}

export interface FieldErrors {
  fields: Record<string, string[]>;
}

export function fromZodError(err: ZodError): ApiError {
  const fields: Record<string, string[]> = {};

  for (const issue of err.issues) {
    const path = issue.path.length > 0 ? issue.path.map(String).join('.') : '_root';
    (fields[path] ??= []).push(issue.message);
  }

  return ApiError.validation('Validation failed', { fields } satisfies FieldErrors);
}

/**
 * True when a Supabase/Postgres error is a unique-constraint violation.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

export function toResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    const body: ApiErrorBody = {
      error: {
        code: err.code,
        message: err.message,
      },
    };

    if (err.details !== undefined) {
      body.error.details = err.details;
    }

    return NextResponse.json(body, { status: err.status });
  }

  console.error('Unhandled API error:', err);

  const body: ApiErrorBody = {
    error: {
      code: 'internal',
      message: 'Internal server error',
    },
  };

  return NextResponse.json(body, { status: 500 });
}

export function toLegacyResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }

  console.error('Unhandled API error:', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
