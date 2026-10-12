-- PawPress: hide scheduled posts at the data layer.
--
-- A post with published_at in the future is "scheduled". The app hides it from every public page
-- and API, but the original read policy (published_at IS NOT NULL) still lets anyone holding the
-- public anon key read scheduled posts directly through Supabase's REST API. This makes the database
-- agree with the app. Apply manually (SQL Editor or `supabase db push`).
--
-- The policy name below is the one from the README's setup SQL. If your project named it
-- differently, check with:
--   select policyname, cmd, qual from pg_policies where schemaname = 'public' and tablename = 'posts';
-- and drop that policy instead.

drop policy if exists "Allow public read access to published posts" on public.posts;

create policy "Allow public read access to published posts" on public.posts
  for select
  using (published_at is not null and published_at <= now());
