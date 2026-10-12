-- PawPress: hide scheduled posts at the data layer.
--
-- A post with published_at in the future is "scheduled". The app hides it from every public page
-- and API, but the original read policy (published_at IS NOT NULL) still lets anyone holding the
-- public anon key read scheduled posts directly through Supabase's REST API. This makes the database
-- agree with the app. Apply manually (SQL Editor or `supabase db push`).
--
-- Policies are permissive and OR'ed together, so EVERY public read policy on posts that allows
-- future-dated rows must go, not just one. This drops both known names: the README's setup SQL
-- ("Allow public read access to published posts") and the name used on the 34cats-blog project
-- ("Public users can view published posts"). Check for others with:
--   select policyname, cmd, roles, qual from pg_policies where schemaname = 'public' and tablename = 'posts';

drop policy if exists "Allow public read access to published posts" on public.posts;
drop policy if exists "Public users can view published posts" on public.posts;

create policy "Public users can view published posts" on public.posts
  for select
  using (published_at is not null and published_at <= now());
