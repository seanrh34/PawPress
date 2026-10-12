/**
 * Helpers for building PostgREST query strings against Supabase's REST API.
 * Values interpolated into a filter must be percent-encoded so a user-supplied
 * slug can't inject extra query parameters or break the request.
 */

export type RestOperator = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte';

export function restFilter(operator: RestOperator, value: string): string {
  return `${operator}.${encodeURIComponent(value)}`;
}

/** `?column=<op>.<encoded value>` for a single equality filter. */
export function restEq(column: string, value: string): string {
  return `${column}=${restFilter('eq', value)}`;
}

/** `?column=<op>.<encoded value>` for a single range filter. */
export function restCompare(
  column: string,
  operator: Exclude<RestOperator, 'eq' | 'neq'>,
  value: string,
): string {
  return `${column}=${restFilter(operator, value)}`;
}
