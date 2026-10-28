-- 0002_director_lease.sql
-- Stage "director lease": at most one stage tab per event writes game state (design.md section 3,
-- TD-002). The columns events.director_session / events.director_seen_at already exist (0001);
-- this migration adds the two RPCs that use them. No table, policy or column changes.
--
-- Protocol (client side: src/stage/directorLease.ts)
--   * A stage tab calls claim_director(event, tab_session) on mount and every 10 s afterwards.
--   * The claim succeeds when the lease is free, already held by the same tab session (this is the
--     heartbeat), or has not been renewed for p_ttl_seconds (the holder is presumed gone).
--   * release_director clears the lease on unmount / pagehide so the next stage can start at once.
--   * The rev compare-and-set on event_state stays as the second line of defence.
--
-- Conventions (same as 0001): security definer, search_path = '', schema-qualified names,
-- everything revoked from public / anon, execute granted to authenticated only.

-- ---------------------------------------------------------------------------------------------
-- claim_director
--   success:  { "ok": true }
--   refused:  { "ok": false, "holder_seen_at": <timestamptz | null> }   (returned, not raised)
--   not the owner / no such event: raises 'event_not_found' with SQLSTATE 42501
--   Safe under concurrency: the single UPDATE locks the row, so two tabs racing for a free or
--   expired lease cannot both win.
-- ---------------------------------------------------------------------------------------------
create or replace function public.claim_director(
  p_event_id    uuid,
  p_session     text,
  p_ttl_seconds int default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_session text := btrim(coalesce(p_session, ''));
  v_ttl     int  := coalesce(p_ttl_seconds, 30);
  v_claimed uuid;
  v_seen    timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if v_session = '' or char_length(v_session) > 200 then
    raise exception 'invalid_session' using errcode = '22023';
  end if;

  if v_ttl < 1 or v_ttl > 3600 then
    raise exception 'invalid_ttl' using errcode = '22023';
  end if;

  update public.events e
     set director_session = v_session,
         director_seen_at = now()
   where e.id = p_event_id
     and e.owner_id = v_uid
     and (
       e.director_session is null
       or e.director_session = v_session
       or e.director_seen_at is null
       or e.director_seen_at < now() - make_interval(secs => v_ttl)
     )
  returning e.id into v_claimed;

  if v_claimed is not null then
    return jsonb_build_object('ok', true);
  end if;

  -- Not claimed: either another stage holds a live lease, or the event is not the caller's.
  select e.director_seen_at into v_seen
    from public.events e
   where e.id = p_event_id and e.owner_id = v_uid;
  if not found then
    raise exception 'event_not_found' using errcode = '42501';
  end if;

  return jsonb_build_object('ok', false, 'holder_seen_at', v_seen);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- release_director: clears the lease only when p_session holds it. Anything else (free lease,
-- another holder, an event that is not the caller's) is a silent no-op, so a late release from a
-- closed tab can never evict the stage that replaced it.
-- ---------------------------------------------------------------------------------------------
create or replace function public.release_director(p_event_id uuid, p_session text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  update public.events e
     set director_session = null,
         director_seen_at = null
   where e.id = p_event_id
     and e.owner_id = v_uid
     and e.director_session = btrim(coalesce(p_session, ''));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- A heartbeat every 10 s must not move events.updated_at (it would reorder / relabel the event
-- list for no user-visible reason). Fire the 0001 trigger only when a user-facing column is part
-- of the UPDATE's SET list; the RPCs above only set director_session / director_seen_at.
-- ---------------------------------------------------------------------------------------------
drop trigger if exists events_set_updated_at on public.events;

create trigger events_set_updated_at
  before update of owner_id, name, status, created_at on public.events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Privileges (new functions inherit the default grants, so revoke first, as in 0001)
-- ---------------------------------------------------------------------------------------------
revoke all on function public.claim_director(uuid, text, int) from public, anon, authenticated;
revoke all on function public.release_director(uuid, text)    from public, anon, authenticated;

grant execute on function public.claim_director(uuid, text, int) to authenticated;
grant execute on function public.release_director(uuid, text)    to authenticated;
