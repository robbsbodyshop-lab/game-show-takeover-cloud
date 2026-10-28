-- 0001_init.sql
-- Game Show Takeover: tables, RLS, RPCs and realtime.messages policies.
-- Spec: .ai/sdd/specs/001-cloud-rewrite/design.md section 4 (data model and RLS),
-- section 7 (persistence), section 12 (operations). Requirements FR-001..007, FR-025..029, NFR-006.
--
-- Conventions
--   * Every table has RLS enabled. Clients never write rooms / room_members / join_attempts
--     directly; only the security definer RPCs below do.
--   * Every function sets search_path = '' and uses schema-qualified names. Built-ins that live in
--     pg_catalog (now(), upper(), ...) are always resolved implicitly.
--   * Room codes: 4 letters from the 20 consonants BCDFGHJKLMNPQRSTVWXZ, upper case.
--   * Room lifetime: 12 hours after rooms.last_seen_at (FR-028).

-- ---------------------------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.set_saved_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.saved_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.events (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name              text not null check (char_length(btrim(name)) between 1 and 120),
  status            text not null default 'setup' check (status in ('setup', 'live', 'finished')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  director_session  text,
  director_seen_at  timestamptz
);

create index events_owner_created_idx on public.events (owner_id, created_at desc);

-- One row per event. A row with rev = 0 and state = null is created by trigger when the event is
-- created, so the first save is always the guarded update "where rev = 0" (design.md section 7).
create table public.event_state (
  event_id uuid primary key references public.events (id) on delete cascade,
  rev      bigint not null default 0 check (rev >= 0),
  state    jsonb,
  saved_at timestamptz not null default now()
);

create table public.host_settings (
  owner_id   uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  feud       jsonb not null default '{}'::jsonb,
  wheel      jsonb not null default '{}'::jsonb,
  app        jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.rooms (
  code         text primary key check (code ~ '^[BCDFGHJKLMNPQRSTVWXZ]{4}$'),
  event_id     uuid not null unique references public.events (id) on delete cascade,
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index rooms_last_seen_at_idx on public.rooms (last_seen_at);
create index rooms_owner_id_idx on public.rooms (owner_id);

create table public.room_members (
  room_code text not null references public.rooms (code) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null check (role in ('stage', 'host', 'phone')),
  team      int check (team between 1 and 8),
  nickname  text check (char_length(nickname) <= 40),
  joined_at timestamptz not null default now(),
  primary key (room_code, user_id)
);

create index room_members_room_code_idx on public.room_members (room_code);
create index room_members_user_id_idx on public.room_members (user_id);

-- Failed join attempts only (rate limiting, FR-029). No client access at all.
create table public.join_attempts (
  user_id      uuid not null,
  attempted_at timestamptz not null default now()
);

create index join_attempts_user_time_idx on public.join_attempts (user_id, attempted_at);

-- ---------------------------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------------------------

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

create trigger host_settings_set_updated_at
  before update on public.host_settings
  for each row execute function public.set_updated_at();

create trigger event_state_set_saved_at
  before update on public.event_state
  for each row execute function public.set_saved_at();

-- A profile for every auth user (anonymous phone sessions included; their rows are tiny and
-- let an anonymous user be upgraded to a host account without a missing-profile error).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), '')
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Creating an event also creates its (empty) save slot.
create or replace function public.handle_new_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_state (event_id, rev, state)
  values (new.id, 0, null)
  on conflict (event_id) do nothing;
  return new;
end;
$$;

create trigger on_event_created
  after insert on public.events
  for each row execute function public.handle_new_event();

-- ---------------------------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------------------------

alter table public.profiles      enable row level security;
alter table public.events        enable row level security;
alter table public.event_state   enable row level security;
alter table public.host_settings enable row level security;
alter table public.rooms         enable row level security;
alter table public.room_members  enable row level security;
alter table public.join_attempts enable row level security;

-- profiles: owner reads / writes the own row.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- events: owner only, all operations.
create policy events_owner_select on public.events
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy events_owner_insert on public.events
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy events_owner_update on public.events
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy events_owner_delete on public.events
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- event_state: owner of the parent event only, all operations.
create policy event_state_owner_select on public.event_state
  for select to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_state.event_id and e.owner_id = (select auth.uid())
  ));

create policy event_state_owner_insert on public.event_state
  for insert to authenticated
  with check (exists (
    select 1 from public.events e
    where e.id = event_state.event_id and e.owner_id = (select auth.uid())
  ));

create policy event_state_owner_update on public.event_state
  for update to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_state.event_id and e.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.events e
    where e.id = event_state.event_id and e.owner_id = (select auth.uid())
  ));

create policy event_state_owner_delete on public.event_state
  for delete to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = event_state.event_id and e.owner_id = (select auth.uid())
  ));

-- host_settings: owner only.
create policy host_settings_owner_select on public.host_settings
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy host_settings_owner_insert on public.host_settings
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy host_settings_owner_update on public.host_settings
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy host_settings_owner_delete on public.host_settings
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- rooms: the owner can read their rooms. Nobody writes directly (open_room / purge do).
-- Phones never read this table; they get the team list from join_room.
create policy rooms_owner_select on public.rooms
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- room_members: a user reads their own membership; the room owner reads the whole roster.
-- Writes only through the RPCs.
create policy room_members_select on public.room_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.rooms r
      where r.code = room_members.room_code and r.owner_id = (select auth.uid())
    )
  );

-- join_attempts: RLS on, no policy and no grants: invisible to every client role.

-- ---------------------------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------------------------

-- open_room: owner only. One room per event; returns the existing code when there is one.
create or replace function public.open_room(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_alphabet constant text := 'BCDFGHJKLMNPQRSTVWXZ';
  v_code     text;
  v_bytes    bytea;
  v_attempt  int := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Opportunistic expiry so the feature works even if no cron job is configured.
  perform public.purge_expired_rooms();

  -- Lock the event row so two tabs opening the room at once cannot race on the unique event_id.
  perform 1 from public.events e
   where e.id = p_event_id and e.owner_id = v_uid
     for update;
  if not found then
    raise exception 'event_not_found' using errcode = '42501';
  end if;

  select r.code into v_code from public.rooms r where r.event_id = p_event_id;

  if v_code is null then
    loop
      v_attempt := v_attempt + 1;
      if v_attempt > 50 then
        raise exception 'room_code_space_exhausted' using errcode = '53400';
      end if;
      -- gen_random_uuid() is backed by the server's strong random source; 4 bytes -> 4 letters.
      -- (256 mod 20 = 16, so the first 16 letters are marginally more likely; irrelevant here
      -- because guessing is rate limited.)
      v_bytes := uuid_send(gen_random_uuid());
      v_code := substr(v_alphabet, (get_byte(v_bytes, 0) % 20) + 1, 1)
             || substr(v_alphabet, (get_byte(v_bytes, 1) % 20) + 1, 1)
             || substr(v_alphabet, (get_byte(v_bytes, 2) % 20) + 1, 1)
             || substr(v_alphabet, (get_byte(v_bytes, 3) % 20) + 1, 1);
      insert into public.rooms (code, event_id, owner_id)
      values (v_code, p_event_id, v_uid)
      on conflict (code) do nothing;
      exit when found;
      v_code := null;
    end loop;
  else
    update public.rooms set last_seen_at = now() where code = v_code;
  end if;

  insert into public.room_members (room_code, user_id, role)
  values (v_code, v_uid, 'stage')
  on conflict (room_code, user_id) do update set role = 'stage';

  return v_code;
end;
$$;

-- join_room: any authenticated user, anonymous sessions included.
--   success:       { "event_id": uuid, "teams": [ { "id", "name", "color" } ] }
--   unknown / expired / malformed code: { "error": "room_not_found" } (returned, not raised, so
--                  that the failed attempt row is committed and counts towards the rate limit)
--   rate limited:  raises 'rate_limited' with SQLSTATE PT429 (HTTP 429 through PostgREST)
create or replace function public.join_room(p_code text, p_team int, p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_code     text := upper(btrim(coalesce(p_code, '')));
  v_nick     text := nullif(left(btrim(coalesce(p_nickname, '')), 24), '');
  v_event_id uuid;
  v_failures int;
  v_teams    jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_team is null or p_team < 1 or p_team > 8 then
    raise exception 'invalid_team' using errcode = '22023';
  end if;

  delete from public.join_attempts
   where user_id = v_uid and attempted_at < now() - interval '10 minutes';

  select count(*) into v_failures
    from public.join_attempts a
   where a.user_id = v_uid and a.attempted_at > now() - interval '10 minutes';

  if v_failures >= 5 then
    raise exception 'rate_limited' using errcode = 'PT429';
  end if;

  select r.event_id into v_event_id
    from public.rooms r
   where r.code = v_code
     and r.last_seen_at > now() - interval '12 hours';

  if v_event_id is null then
    insert into public.join_attempts (user_id) values (v_uid);
    return jsonb_build_object('error', 'room_not_found');
  end if;

  -- A phone sits in one room at a time.
  delete from public.room_members
   where user_id = v_uid and role = 'phone' and room_code <> v_code;

  -- If the caller already is stage / host of this room (owner testing), keep that role.
  insert into public.room_members (room_code, user_id, role, team, nickname)
  values (v_code, v_uid, 'phone', p_team, v_nick)
  on conflict (room_code, user_id) do update
    set team = excluded.team, nickname = excluded.nickname
    where public.room_members.role = 'phone';

  update public.rooms set last_seen_at = now() where code = v_code;

  select coalesce(
           jsonb_agg(
             jsonb_build_object('id', t.elem -> 'id', 'name', t.elem -> 'name', 'color', t.elem -> 'color')
             order by t.ord
           ),
           '[]'::jsonb
         )
    into v_teams
    from public.event_state es
   cross join lateral jsonb_array_elements(
           case when jsonb_typeof(es.state -> 'teams') = 'array' then es.state -> 'teams' else '[]'::jsonb end
         ) with ordinality as t (elem, ord)
   where es.event_id = v_event_id;

  return jsonb_build_object('event_id', v_event_id, 'teams', coalesce(v_teams, '[]'::jsonb));
end;
$$;

-- join_room_as_host: owner only (a second device signed in as the host, FR-018).
create or replace function public.join_room_as_host(p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  perform 1 from public.rooms r where r.code = v_code and r.owner_id = v_uid;
  if not found then
    -- Same error whether the room does not exist or belongs to someone else.
    raise exception 'room_not_found' using errcode = '42501';
  end if;

  insert into public.room_members (room_code, user_id, role)
  values (v_code, v_uid, 'host')
  on conflict (room_code, user_id) do update set role = 'host';

  update public.rooms set last_seen_at = now() where code = v_code;
end;
$$;

-- leave_room: removes the caller's phone membership(s). Owner sessions are not removed.
create or replace function public.leave_room()
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
  delete from public.room_members where user_id = v_uid and role = 'phone';
end;
$$;

-- touch_room: members only; keeps the room alive (FR-028).
create or replace function public.touch_room(p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  update public.rooms r
     set last_seen_at = now()
   where r.code = v_code
     and exists (
       select 1 from public.room_members m
       where m.room_code = r.code and m.user_id = v_uid
     );
  if not found then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
end;
$$;

-- keepalive: called daily with the publishable key by the GitHub Actions cron (NFR-010).
create or replace function public.keepalive()
returns integer
language sql
stable
set search_path = ''
as $$
  select 1;
$$;

-- purge_expired_rooms: rooms idle for more than 12 hours (members cascade) and stale attempts.
-- Not callable by clients; open_room calls it, and a scheduled job may too (see bottom).
create or replace function public.purge_expired_rooms()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.rooms where last_seen_at < now() - interval '12 hours';
  get diagnostics v_deleted = row_count;
  delete from public.join_attempts where attempted_at < now() - interval '1 hour';
  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Privileges
-- Supabase grants ALL on new public objects to anon / authenticated / service_role by default
-- privileges, so revoke everything explicitly and then grant only what is needed.
-- ---------------------------------------------------------------------------------------------

revoke all on all tables    in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant select, insert, update         on public.profiles      to authenticated;
grant select, insert, update, delete on public.events        to authenticated;
grant select, insert, update, delete on public.event_state   to authenticated;
grant select, insert, update, delete on public.host_settings to authenticated;
grant select                         on public.rooms         to authenticated;
grant select                         on public.room_members  to authenticated;
-- join_attempts: nothing.

grant execute on function public.open_room(uuid)            to authenticated;
grant execute on function public.join_room(text, int, text) to authenticated;
grant execute on function public.join_room_as_host(text)    to authenticated;
grant execute on function public.leave_room()               to authenticated;
grant execute on function public.touch_room(text)           to authenticated;
grant execute on function public.keepalive()                to anon, authenticated;
grant execute on function public.purge_expired_rooms()      to service_role;

-- ---------------------------------------------------------------------------------------------
-- Realtime authorization (private channels, "Allow public access" off)
-- Topic format: room:<CODE>:<kind> with kind in (stage, host), and room:<CODE>:phones:<TEAM>
-- (TEAM 1..8) for phones.
--   split_part(topic, ':', 2) = code, split_part(topic, ':', 3) = kind,
--   split_part(topic, ':', 4) = team (phones only).
-- The team is part of the phones topic because RLS cannot read the message payload: a phone may
-- only publish on the topic of the team stored in its own room_members row, so it cannot press,
-- act or answer for another team (FR-025, P-004).
-- Both Realtime extensions are covered: broadcast (messages) and presence (track / state).
--   * stage topic : any member reads; owner sessions (role stage|host, user = rooms.owner_id)
--                   write (broadcast: controls / teams / ack / audience; presence: stage online).
--   * phones topic: a phone member writes (press / action / feud-answer; presence) only on the
--                   topic of its own team; owner sessions read every team topic.
--   * host topic  : owner sessions only, read and write (snapshots carry hidden information).
-- "Owner session" = a room_members row for the caller in a room whose owner_id is the caller.
-- Ownership is therefore checked against rooms.owner_id, never against the stored role alone.
-- ---------------------------------------------------------------------------------------------

create policy "room stage topic: members read"
  on realtime.messages for select to authenticated
  using (
    extension in ('broadcast', 'presence')
    and split_part((select realtime.topic()), ':', 1) = 'room'
    and split_part((select realtime.topic()), ':', 3) = 'stage'
    and exists (
      select 1 from public.room_members m
      where m.room_code = split_part((select realtime.topic()), ':', 2)
        and m.user_id = (select auth.uid())
    )
  );

create policy "room stage topic: owner stage/host write"
  on realtime.messages for insert to authenticated
  with check (
    extension in ('broadcast', 'presence')
    and split_part((select realtime.topic()), ':', 1) = 'room'
    and split_part((select realtime.topic()), ':', 3) = 'stage'
    and exists (
      select 1
      from public.room_members m
      join public.rooms r on r.code = m.room_code
      where m.room_code = split_part((select realtime.topic()), ':', 2)
        and m.user_id = (select auth.uid())
        and m.role in ('stage', 'host')
        and r.owner_id = m.user_id
    )
  );

create policy "room phones topic: phones write"
  on realtime.messages for insert to authenticated
  with check (
    extension in ('broadcast', 'presence')
    and split_part((select realtime.topic()), ':', 1) = 'room'
    and split_part((select realtime.topic()), ':', 3) = 'phones'
    and split_part((select realtime.topic()), ':', 4) ~ '^[1-8]$'
    and split_part((select realtime.topic()), ':', 5) = ''
    and exists (
      select 1 from public.room_members m
      where m.room_code = split_part((select realtime.topic()), ':', 2)
        and m.user_id = (select auth.uid())
        and m.role = 'phone'
        -- case, not and: the cast must never be evaluated for a non-numeric part
        and case
              when split_part((select realtime.topic()), ':', 4) ~ '^[1-8]$'
              then m.team = split_part((select realtime.topic()), ':', 4)::int
              else false
            end
    )
  );

create policy "room phones topic: owner reads"
  on realtime.messages for select to authenticated
  using (
    extension in ('broadcast', 'presence')
    and split_part((select realtime.topic()), ':', 1) = 'room'
    and split_part((select realtime.topic()), ':', 3) = 'phones'
    and split_part((select realtime.topic()), ':', 4) ~ '^[1-8]$'
    and split_part((select realtime.topic()), ':', 5) = ''
    and exists (
      select 1
      from public.room_members m
      join public.rooms r on r.code = m.room_code
      where m.room_code = split_part((select realtime.topic()), ':', 2)
        and m.user_id = (select auth.uid())
        and r.owner_id = m.user_id
    )
  );

create policy "room host topic: owner reads"
  on realtime.messages for select to authenticated
  using (
    extension in ('broadcast', 'presence')
    and split_part((select realtime.topic()), ':', 1) = 'room'
    and split_part((select realtime.topic()), ':', 3) = 'host'
    and exists (
      select 1
      from public.room_members m
      join public.rooms r on r.code = m.room_code
      where m.room_code = split_part((select realtime.topic()), ':', 2)
        and m.user_id = (select auth.uid())
        and m.role in ('stage', 'host')
        and r.owner_id = m.user_id
    )
  );

create policy "room host topic: owner writes"
  on realtime.messages for insert to authenticated
  with check (
    extension in ('broadcast', 'presence')
    and split_part((select realtime.topic()), ':', 1) = 'room'
    and split_part((select realtime.topic()), ':', 3) = 'host'
    and exists (
      select 1
      from public.room_members m
      join public.rooms r on r.code = m.room_code
      where m.room_code = split_part((select realtime.topic()), ':', 2)
        and m.user_id = (select auth.uid())
        and m.role in ('stage', 'host')
        and r.owner_id = m.user_id
    )
  );

-- ---------------------------------------------------------------------------------------------
-- Optional: scheduled expiry. open_room already purges opportunistically. If the pg_cron
-- extension is enabled (Dashboard > Database > Extensions) run once, outside this migration:
--   select cron.schedule('purge-expired-rooms', '17 * * * *', 'select public.purge_expired_rooms()');
-- ---------------------------------------------------------------------------------------------
