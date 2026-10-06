import { usageError } from './errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function assertUuid(value: string, label: string): string {
  if (!isUuid(value)) {
    throw usageError(`invalid ${label}: ${value} (expected a UUID)`);
  }
  return value;
}
