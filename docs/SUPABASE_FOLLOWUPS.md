# Supabase follow-ups

The CLI integration deliberately made **no** Supabase changes (no schema migrations, RLS or storage
policy edits, or Auth settings). This is the checklist of database-side work for the site owner, in
rough priority order. Items marked **security** are worth doing before giving tokens to agents on a
public site.

## (a) Disable public sign-ups, or make RLS role-aware — security

Current RLS policies grant write access to **any** `authenticated` user:

- `posts`: `FOR ALL USING (auth.role() = 'authenticated')`
- `categories`: `FOR ALL USING (auth.role() = 'authenticated')`
- `storage.objects` (`post-images`): insert/update/delete for any authenticated user

If public sign-ups are enabled in Supabase Auth, anyone can create an account and write to these
tables directly with the anon key, bypassing the app entirely. (The app's login route rejects users
without a `user_profiles` row, but direct Supabase API access isn't affected by that.)

**Do:** Authentication → Providers/Settings → disable "Allow new users to sign up" (admins are
created by the master account through `/admin/users`, which uses the Admin API). Then also do (b).

## (b) Make RLS policies check `user_profiles.role` — security

Replace the `auth.role() = 'authenticated'` write policies with ones that require an admin profile,
e.g. a `SECURITY DEFINER` helper `is_admin()` that checks
`exists (select 1 from user_profiles where id = auth.uid() and role in ('master','admin'))`, and
use it in the `posts`, `categories`, and `storage.objects` write policies. Keep the public read
policies (`published_at IS NOT NULL` for posts).

Note: token-authenticated `/api/v1` requests use the service-role client and bypass RLS by design;
the app enforces scopes and the owner's role on every request (`lib/auth/context.ts`,
`lib/api/withApi.ts`). Role-aware RLS protects the **cookie/anon** paths.

## (c) Storage policies vs. the web editor's uploads

`lib/uploadImages.ts` (used by the web editor's `POST`/`PUT /api/posts`) uploads with the **anon**
client (`lib/supabase.ts`), which has no user session. With the documented policy
`WITH CHECK (bucket_id = 'post-images' AND auth.role() = 'authenticated')`, those uploads should
fail. The code swallows the error and keeps the original image URL. Verify in the dashboard whether
editor uploads actually land in the bucket. If they don't, either loosen the insert policy (not
recommended) or change the editor path to upload with the user's cookie client. (The v1 `/media`
endpoint uploads with the service-role client and isn't affected.)

## (d) Move tokens from `app_metadata` to an `api_tokens` table

Personal access tokens are currently tracked in each user's `auth.users.app_metadata.pawpress_tokens`
(metadata only, never the token itself) behind the `TokenStore` interface in
`lib/auth/tokenStore.ts`. Limitations: read-modify-write races when two tokens are created or revoked
at the same moment, the list is visible in the user's own JWT, and it's capped at 10 tokens per user.

**Main security reason to migrate soon:** the store is a read-modify-write over the whole token list,
so a **revoke racing with a concurrent token creation can be silently undone**. Both requests read the
same list, the creation writes `[...old, new]`, then the revoke's stale write puts the revoked token
back. The revoked token then keeps working even though the user was told it was revoked. An
`api_tokens` table with a per-row `DELETE`/`revoked_at` update is atomic and removes this race.

Suggested table:

```
api_tokens(
  id uuid primary key,              -- the JWT jti
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  scopes text[] not null,
  token_hash text,                  -- optional: sha256 of the token, if you switch to opaque tokens
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz
)
```

RLS: no direct access from `anon`/`authenticated`; the app reads it with the service-role client.
Then implement `TableTokenStore implements TokenStore` and swap it in `lib/auth/context.ts`,
`app/api/v1/tokens*`, and `app/api/v1/me`. Callers don't depend on `app_metadata`.

## (e) Audit log table

v1 mutations currently write one structured line to the server log:
`{"evt":"pawpress.audit","action","resource","id","userId","tokenId","ts"}` (see `audit()` in
`lib/api/withApi.ts`). Add an `audit_log(id, ts, user_id, token_id, action, resource, resource_id)`
table (insert-only for the service role) and make `audit()` insert into it. Keep logging content out
of it.

## (f) Optional: Custom Access Token Hook for role claims

A Supabase Custom Access Token Hook could add `user_profiles.role` to the session JWT so RLS policies
(and the app) can read the role from `auth.jwt()` without a table lookup. Optional. If you do it,
remember that a JWT claim only updates on token refresh, so a demotion takes effect at the next
refresh, not immediately.

## (g) Housekeeping

- Add `updated_at` triggers on `posts`/`categories` (README step 7) if they aren't installed. The app
  sets `updated_at` itself, and optimistic concurrency relies on it changing on every write.
- `README.md` documents the schema as the code uses it today. Consider committing the real schema as
  migrations (`supabase/migrations/`) so it can't drift from the docs again.

## (h) Add a Content-Security-Policy header — security (recommended)

Post bodies are stored as Lexical JSON and rendered with `dangerouslySetInnerHTML`
(`app/[slug]/page.tsx`), so `content_html` is an XSS sink that is defended in application code
(`lib/lexicalToHtml.ts` escapes/allow-lists output, and v1 writes are normalised and URL-checked). A
strict `Content-Security-Policy` is a valuable second layer: add one via `next.config.ts` headers (or
the host's edge config), e.g. `default-src 'self'`, `img-src 'self' https: data:`,
`frame-src https://www.youtube.com`, `object-src 'none'`, `base-uri 'self'`, and avoid
`unsafe-inline` for scripts. Note Next.js’s own runtime may need nonces/`'unsafe-inline'` for styles
and inline bootstrap scripts, so start in report-only mode and tune before enforcing. This has **not**
been added yet.
