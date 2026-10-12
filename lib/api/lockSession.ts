import { isUuid } from '@/lib/cms/categoryService';
import { ApiError } from '@/lib/cms/errors';

/** Header carrying the caller's edit-lock session on token mutations (§9). */
export const LOCK_SESSION_HEADER = 'X-PawPress-Lock-Session';

/**
 * Reads the optional `X-PawPress-Lock-Session` header. Returns `undefined` when
 * absent. A present-but-invalid value is a `validation_failed` error, never a
 * silent "no session": a malformed header must not turn into a lock bypass.
 */
export function lockSessionFromHeader(req: Request): string | undefined {
  const raw = req.headers.get(LOCK_SESSION_HEADER);

  if (raw === null || raw.trim() === '') {
    return undefined;
  }

  const value = raw.trim();
  if (!isUuid(value)) {
    throw ApiError.validation(`${LOCK_SESSION_HEADER} must be a UUID`, {
      fields: { [LOCK_SESSION_HEADER]: ['Must be a UUID'] },
    });
  }

  return value;
}

/**
 * Like `lockSessionFromHeader` but treats a missing header as a validation
 * error instead of `undefined`.
 */
export function requiredLockSessionFromHeader(req: Request): string {
  const value = lockSessionFromHeader(req);
  if (value === undefined) {
    throw ApiError.validation(`${LOCK_SESSION_HEADER} header is required`, {
      fields: { [LOCK_SESSION_HEADER]: ['Required'] },
    });
  }
  return value;
}
