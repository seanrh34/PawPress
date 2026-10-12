-- PawPress: edit locks ("who is editing this post") for the web editor and the CLI.
--
-- Apply manually (Supabase Dashboard → SQL Editor, or `supabase db push`). The app works without
-- this table, but edit locking then reports "unavailable" and only optimistic concurrency
-- (if_updated_at) protects against conflicting edits. See docs/cli-api.md §9.
--
-- Access: only the server (service role) touches this table. RLS is enabled with no policies, so
-- the anon and authenticated roles can neither read nor write it.

create table if not exists public.post_edit_locks (
  post_id         uuid primary key references public.posts (id) on delete cascade,
  session_id      uuid not null,
  holder_kind     text not null check (holder_kind in ('user', 'agent')),
  holder_user_id  uuid not null references auth.users (id) on delete cascade,
  holder_token_id uuid,
  holder_label    text not null check (char_length(holder_label) between 1 and 200),
  acquired_at     timestamptz not null default now(),
  expires_at      timestamptz not null
);

alter table public.post_edit_locks enable row level security;
revoke all on table public.post_edit_locks from anon, authenticated;
grant select, insert, update, delete on table public.post_edit_locks to service_role;

-- Atomically acquire, renew, or take over a post's edit lock.
--
-- The lock is granted when any of these is true:
--   * nobody holds it,
--   * the current lease has expired,
--   * the caller is renewing its own session (same session_id and same user), or
--   * p_force is true (a human admin taking over; the app only passes it for cookie sessions).
-- Concurrent callers are serialised by the primary key, so at most one of them wins.
--
-- Returns {"acquired": bool, "lock": {...current lock row...}}. When acquired is false, "lock"
-- describes the other holder.
create or replace function public.acquire_post_edit_lock(
  p_post_id         uuid,
  p_session_id      uuid,
  p_holder_kind     text,
  p_holder_user_id  uuid,
  p_holder_token_id uuid,
  p_holder_label    text,
  p_ttl_seconds     integer,
  p_force           boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.post_edit_locks;
begin
  if p_ttl_seconds is null or p_ttl_seconds < 30 or p_ttl_seconds > 3600 then
    raise exception 'p_ttl_seconds must be between 30 and 3600';
  end if;

  insert into public.post_edit_locks as l (
    post_id, session_id, holder_kind, holder_user_id, holder_token_id, holder_label,
    acquired_at, expires_at
  ) values (
    p_post_id, p_session_id, p_holder_kind, p_holder_user_id, p_holder_token_id, p_holder_label,
    now(), now() + make_interval(secs => p_ttl_seconds)
  )
  on conflict (post_id) do update set
    session_id      = excluded.session_id,
    holder_kind     = excluded.holder_kind,
    holder_user_id  = excluded.holder_user_id,
    holder_token_id = excluded.holder_token_id,
    holder_label    = excluded.holder_label,
    acquired_at     = case when l.session_id = excluded.session_id then l.acquired_at else now() end,
    expires_at      = excluded.expires_at
  where (l.session_id = excluded.session_id and l.holder_user_id = excluded.holder_user_id)
     or l.expires_at <= now()
     or p_force
  returning * into v_row;

  if found then
    return jsonb_build_object('acquired', true, 'lock', to_jsonb(v_row));
  end if;

  select * into v_row from public.post_edit_locks where post_id = p_post_id;
  return jsonb_build_object('acquired', false, 'lock', to_jsonb(v_row));
end;
$$;

revoke all on function public.acquire_post_edit_lock(uuid, uuid, text, uuid, uuid, text, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.acquire_post_edit_lock(uuid, uuid, text, uuid, uuid, text, integer, boolean)
  to service_role;
