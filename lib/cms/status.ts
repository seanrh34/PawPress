/**
 * `published_at` is the single source of truth for a post's lifecycle:
 *
 * - `null`            -> draft (hidden)
 * - in the future     -> scheduled (hidden until then)
 * - now or in the past -> published (live)
 *
 * There is no stored `status` column and no cron job: every reader derives the
 * status from `published_at` and filters out future rows.
 */
export type PostStatus = 'draft' | 'scheduled' | 'published';

export function postStatus(
  published_at: string | null,
  now: Date = new Date(),
): PostStatus {
  if (published_at === null) {
    return 'draft';
  }
  const ts = Date.parse(published_at);
  if (Number.isNaN(ts) || ts <= now.getTime()) {
    return 'published';
  }
  return 'scheduled';
}
