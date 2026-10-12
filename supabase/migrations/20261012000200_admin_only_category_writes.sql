-- PawPress: only admins may write categories.
--
-- The 34cats-blog project allowed ANY authenticated Supabase user to insert, update, or delete
-- categories directly through the REST API. The app itself writes categories with the service-role
-- key (which bypasses RLS), so restricting the policies to admin/master profiles doesn't affect it.
-- The public read policy ("Anyone can read categories") is unchanged.

drop policy if exists "Authenticated users can insert categories" on public.categories;
drop policy if exists "Authenticated users can update categories" on public.categories;
drop policy if exists "Authenticated users can delete categories" on public.categories;
-- README setup SQL name, in case a project used it:
drop policy if exists "Allow authenticated write access to categories" on public.categories;

create policy "Admins can insert categories" on public.categories
  for insert to authenticated
  with check (exists (
    select 1 from public.user_profiles
     where user_profiles.id = auth.uid() and user_profiles.role in ('admin', 'master')));

create policy "Admins can update categories" on public.categories
  for update to authenticated
  using (exists (
    select 1 from public.user_profiles
     where user_profiles.id = auth.uid() and user_profiles.role in ('admin', 'master')))
  with check (exists (
    select 1 from public.user_profiles
     where user_profiles.id = auth.uid() and user_profiles.role in ('admin', 'master')));

create policy "Admins can delete categories" on public.categories
  for delete to authenticated
  using (exists (
    select 1 from public.user_profiles
     where user_profiles.id = auth.uid() and user_profiles.role in ('admin', 'master')));
