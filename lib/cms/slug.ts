export const RESERVED_SLUGS: readonly string[] = [
  'admin',
  'api',
  'category',
  'posts',
  'styles',
];

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const MAX_SLUG_LENGTH = 200;

/**
 * Derive a URL-safe slug from arbitrary text. Lowercases, strips diacritics,
 * replaces every run of non-alphanumeric characters with a single dash, trims
 * leading/trailing dashes and caps the result at MAX_SLUG_LENGTH.
 */
export function slugify(title: string): string {
  const normalized = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
}

/**
 * Returns null when the slug is valid, otherwise a human-readable message.
 * Reserved-slug matching is case-insensitive.
 */
export function validateSlug(slug: string): string | null {
  if (slug.length === 0) {
    return 'Slug is required';
  }

  if (slug.length > MAX_SLUG_LENGTH) {
    return `Slug must be at most ${MAX_SLUG_LENGTH} characters`;
  }

  if (RESERVED_SLUGS.includes(slug.toLowerCase())) {
    return `Slug "${slug}" is reserved and cannot be used`;
  }

  if (!SLUG_PATTERN.test(slug)) {
    return 'Slug must be lowercase alphanumeric with hyphens only';
  }

  return null;
}
