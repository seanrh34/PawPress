-- PawPress: only the master account may change a profile's role or identity.
--
-- The "Users can update own profile, master can update any" policy lets any admin UPDATE their own
-- user_profiles row through the REST API, including `role`. An admin could set their own role to
-- 'master' and then create or delete admin accounts. The app never updates user_profiles (display
-- names live in auth user metadata), so this guard changes no app behaviour.
--
-- RLS can't compare old and new column values, so a trigger does it. The service role (the app's
-- server-side admin client, and the SQL editor) is not restricted.

create or replace function public.guard_user_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.id, new.email, new.role, new.created_by)
     is not distinct from (old.id, old.email, old.role, old.created_by) then
    return new;
  end if;

  if coalesce(auth.role(), '') = 'service_role' or session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if exists (
    select 1 from public.user_profiles
    where id = auth.uid() and role = 'master'
  ) then
    return new;
  end if;

  raise exception 'Only the master account can change a profile''s role, email, id or creator'
    using errcode = '42501';
end;
$$;

drop trigger if exists guard_user_profile_identity on public.user_profiles;
create trigger guard_user_profile_identity
  before update on public.user_profiles
  for each row execute function public.guard_user_profile_identity();
