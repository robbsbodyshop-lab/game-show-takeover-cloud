-- supabase/tests/rls.sql
-- Row level security, RPC and realtime.messages policy tests for 0001_init.sql.
-- Spec: design.md sections 4 and 11; requirements FR-002, FR-025, FR-028, FR-029, NFR-006.
--
-- HOW TO RUN
--   1. Local stack with Docker:      supabase start && supabase test db
--      (pgTAP ships with the local stack; pg_prove picks up supabase/tests/*.sql)
--   2. Any database that already has the migration applied (a Supabase branch, a scratch project),
--      for example through psql:      psql "$DATABASE_URL" -f supabase/tests/rls.sql
--      pgTAP must be installed (`create extension if not exists pgtap with schema extensions;`).
--      Through the Supabase MCP `execute_sql`, send the file contents in one call.
--   The whole file runs in one transaction that is rolled back, so nothing persists.
--
-- DESIGN OF THE TESTS
--   Statements that run as a client role (set local role ... + request.jwt.claims) only write
--   their observations into the temp table _t, either through a DO block or an insert. The pgTAP
--   assertions (plan / is / ok) always run afterwards as the original (privileged) role, so they
--   never depend on pgTAP privileges for anon / authenticated.
--   Realtime policies are exercised by inserting into realtime.messages with the realtime.topic
--   setting that Realtime itself sets before evaluating a policy.

begin;

select plan(101);

-- ---------------------------------------------------------------------------------------------
-- Fixtures (as the privileged role)
-- ---------------------------------------------------------------------------------------------
-- A = host A, B = host B, P = phone (anonymous), Q = guesser (anonymous), R = late phone.
insert into auth.users (id, email, is_anonymous) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'host-a@example.test', false),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'host-b@example.test', false),
  ('cccccccc-0000-4000-8000-000000000003', null, true),
  ('dddddddd-0000-4000-8000-000000000004', null, true),
  ('eeeeeeee-0000-4000-8000-000000000005', null, true);

create temp table _t (k text primary key, v text);
grant all on _t to public;

select is((select count(*)::int from public.profiles), 5, 'trigger created a profile for each auth user');

-- ---------------------------------------------------------------------------------------------
-- Events: tenancy
-- ---------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
with ins as (insert into public.events (name) values ('Show A') returning id)
  insert into _t select 'ev_a', id::text from ins;

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
with ins as (insert into public.events (name) values ('Show B') returning id)
  insert into _t select 'ev_b', id::text from ins;

-- B looks at everything and at A's event specifically.
do $$
declare n int;
begin
  select count(*) into n from public.events;
  insert into _t values ('b_events_total', n::text);
  select count(*) into n from public.events where id = (select v::uuid from _t where k = 'ev_a');
  insert into _t values ('b_sees_ev_a', n::text);
  select count(*) into n from public.event_state;
  insert into _t values ('b_state_total', n::text);
  select count(*) into n from public.event_state where event_id = (select v::uuid from _t where k = 'ev_a');
  insert into _t values ('b_sees_state_a', n::text);

  update public.events set name = 'hijacked' where id = (select v::uuid from _t where k = 'ev_a');
  get diagnostics n = row_count;
  insert into _t values ('b_update_ev_a_rows', n::text);

  delete from public.events where id = (select v::uuid from _t where k = 'ev_a');
  get diagnostics n = row_count;
  insert into _t values ('b_delete_ev_a_rows', n::text);

  update public.event_state set state = '{"x":1}'::jsonb, rev = 1
   where event_id = (select v::uuid from _t where k = 'ev_a');
  get diagnostics n = row_count;
  insert into _t values ('b_update_state_a_rows', n::text);

  begin
    insert into public.events (owner_id, name) values ('aaaaaaaa-0000-4000-8000-000000000001', 'spoof');
    insert into _t values ('b_spoof_insert', 'no error');
  exception when others then
    insert into _t values ('b_spoof_insert', sqlstate);
  end;

  begin
    update public.events set owner_id = 'aaaaaaaa-0000-4000-8000-000000000001'
     where id = (select v::uuid from _t where k = 'ev_b');
    insert into _t values ('b_give_away_event', 'no error');
  exception when others then
    insert into _t values ('b_give_away_event', sqlstate);
  end;

  begin
    insert into public.host_settings (owner_id, app) values ('aaaaaaaa-0000-4000-8000-000000000001', '{}');
    insert into _t values ('b_spoof_settings', 'no error');
  exception when others then
    insert into _t values ('b_spoof_settings', sqlstate);
  end;
end $$;

-- A: own rows, host settings, guarded state save.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare n int; r bigint;
begin
  select count(*) into n from public.events;
  insert into _t values ('a_events_total', n::text);
  select count(*) into n from public.events where id = (select v::uuid from _t where k = 'ev_b');
  insert into _t values ('a_sees_ev_b', n::text);
  select count(*) into n from public.event_state where event_id = (select v::uuid from _t where k = 'ev_a');
  insert into _t values ('a_sees_state_a', n::text);
  select rev into r from public.event_state where event_id = (select v::uuid from _t where k = 'ev_a');
  insert into _t values ('a_initial_rev', r::text);

  -- Guarded save: first writer wins, a second writer holding the old rev gets 0 rows.
  update public.event_state
     set rev = 1, state = '{"teams":[{"id":1,"name":"Red","color":"#f00","players":["Ann"]},{"id":2,"name":"Blue","color":"#00f"}]}'::jsonb
   where event_id = (select v::uuid from _t where k = 'ev_a') and rev = 0;
  get diagnostics n = row_count;
  insert into _t values ('a_save_first', n::text);
  update public.event_state set rev = 1, state = '{"stale":true}'::jsonb
   where event_id = (select v::uuid from _t where k = 'ev_a') and rev = 0;
  get diagnostics n = row_count;
  insert into _t values ('a_save_stale', n::text);

  insert into public.host_settings (feud) values ('{"timer":30}');
  select count(*) into n from public.host_settings;
  insert into _t values ('a_settings_rows', n::text);
end $$;

-- B cannot read A's settings; anon cannot read anything.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.host_settings;
  insert into _t values ('b_settings_rows', n::text);
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    perform 1 from public.events;
    insert into _t values ('anon_select_events', 'no error');
  exception when others then
    insert into _t values ('anon_select_events', sqlstate);
  end;
  begin
    perform public.open_room(gen_random_uuid());
    insert into _t values ('anon_open_room', 'no error');
  exception when others then
    insert into _t values ('anon_open_room', sqlstate);
  end;
  begin
    perform public.join_room('BCDF', 1, 'x');
    insert into _t values ('anon_join_room', 'no error');
  exception when others then
    insert into _t values ('anon_join_room', sqlstate);
  end;
  insert into _t values ('anon_keepalive', public.keepalive()::text);
end $$;
reset role;

select is((select v from _t where k = 'b_events_total'), '1', 'host B sees only their own event');
select is((select v from _t where k = 'a_events_total'), '1', 'host A sees only their own event');
select is((select v from _t where k = 'b_sees_ev_a'), '0', 'cross-tenant select of events returns 0 rows');
select is((select v from _t where k = 'a_sees_ev_b'), '0', 'cross-tenant select of events returns 0 rows (reverse)');
select is((select v from _t where k = 'b_state_total'), '1', 'host B sees only their own event_state row');
select is((select v from _t where k = 'b_sees_state_a'), '0', 'cross-tenant select of event_state returns 0 rows');
select is((select v from _t where k = 'b_update_ev_a_rows'), '0', 'cross-tenant update of events touches 0 rows');
select is((select v from _t where k = 'b_delete_ev_a_rows'), '0', 'cross-tenant delete of events touches 0 rows');
select is((select v from _t where k = 'b_update_state_a_rows'), '0', 'cross-tenant update of event_state touches 0 rows');
select is((select v from _t where k = 'b_spoof_insert'), '42501', 'cannot insert an event owned by someone else');
select is((select v from _t where k = 'b_give_away_event'), '42501', 'cannot reassign an event to another owner');
select is((select v from _t where k = 'b_spoof_settings'), '42501', 'cannot insert host_settings for someone else');
select is((select v from _t where k = 'a_sees_state_a'), '1', 'creating an event created its event_state slot');
select is((select v from _t where k = 'a_initial_rev'), '0', 'event_state starts at rev 0');
select is((select v from _t where k = 'a_save_first'), '1', 'save with the expected rev updates one row');
select is((select v from _t where k = 'a_save_stale'), '0', 'save with a stale rev updates 0 rows (conflict)');
select is((select v from _t where k = 'a_settings_rows'), '1', 'host A can write and read own host_settings');
select is((select v from _t where k = 'b_settings_rows'), '0', 'host B cannot read host A settings');
select is((select v from _t where k = 'anon_select_events'), '42501', 'anon role has no access to events');
select is((select v from _t where k = 'anon_open_room'), '42501', 'anon role cannot execute open_room');
select is((select v from _t where k = 'anon_join_room'), '42501', 'anon role cannot execute join_room');
select is((select v from _t where k = 'anon_keepalive'), '1', 'anon role can execute keepalive');

-- ---------------------------------------------------------------------------------------------
-- Rooms: open_room, direct writes, roster visibility
-- ---------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare c1 text; c2 text; n int;
begin
  c1 := public.open_room((select v::uuid from _t where k = 'ev_a'));
  c2 := public.open_room((select v::uuid from _t where k = 'ev_a'));
  insert into _t values ('room_code', c1);
  insert into _t values ('room_code_again', c2);
  select count(*) into n from public.rooms;
  insert into _t values ('a_rooms', n::text);
  select count(*) into n from public.room_members where role = 'stage';
  insert into _t values ('a_stage_members', n::text);

  begin
    insert into public.rooms (code, event_id, owner_id)
    values ('BCDF', (select v::uuid from _t where k = 'ev_b'), 'aaaaaaaa-0000-4000-8000-000000000001');
    insert into _t values ('a_direct_room_insert', 'no error');
  exception when others then
    insert into _t values ('a_direct_room_insert', sqlstate);
  end;
  begin
    insert into public.room_members (room_code, user_id, role)
    values ((select v from _t where k = 'room_code'), 'cccccccc-0000-4000-8000-000000000003', 'phone');
    insert into _t values ('a_direct_member_insert', 'no error');
  exception when others then
    insert into _t values ('a_direct_member_insert', sqlstate);
  end;
  begin
    update public.rooms set last_seen_at = now() + interval '1 year';
    insert into _t values ('a_direct_room_update', 'no error');
  exception when others then
    insert into _t values ('a_direct_room_update', sqlstate);
  end;
  begin
    delete from public.room_members;
    insert into _t values ('a_direct_member_delete', 'no error');
  exception when others then
    insert into _t values ('a_direct_member_delete', sqlstate);
  end;
  begin
    perform 1 from public.join_attempts;
    insert into _t values ('a_join_attempts_select', 'no error');
  exception when others then
    insert into _t values ('a_join_attempts_select', sqlstate);
  end;
end $$;

-- B cannot open A's event and sees no rooms.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare n int;
begin
  begin
    perform public.open_room((select v::uuid from _t where k = 'ev_a'));
    insert into _t values ('b_open_a', 'no error');
  exception when others then
    insert into _t values ('b_open_a', sqlstate || ':' || sqlerrm);
  end;
  select count(*) into n from public.rooms;
  insert into _t values ('b_rooms', n::text);
  select count(*) into n from public.room_members;
  insert into _t values ('b_members', n::text);
  begin
    perform public.join_room_as_host((select v from _t where k = 'room_code'));
    insert into _t values ('b_join_as_host', 'no error');
  exception when others then
    insert into _t values ('b_join_as_host', sqlstate);
  end;
  begin
    perform public.touch_room((select v from _t where k = 'room_code'));
    insert into _t values ('b_touch', 'no error');
  exception when others then
    insert into _t values ('b_touch', sqlstate);
  end;
end $$;
reset role;

select ok((select v from _t where k = 'room_code') ~ '^[BCDFGHJKLMNPQRSTVWXZ]{4}$', 'open_room returns a 4-consonant code');
select is((select v from _t where k = 'room_code_again'), (select v from _t where k = 'room_code'), 'open_room is idempotent per event');
select is((select count(*)::int from public.rooms), 1, 'one room exists for the one opened event');
select is((select v from _t where k = 'a_rooms'), '1', 'owner reads own room');
select is((select v from _t where k = 'a_stage_members'), '1', 'open_room created the owner stage membership');
select is((select role from public.room_members where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'stage', 'owner membership role is stage');
select is((select v from _t where k = 'a_direct_room_insert'), '42501', 'no direct insert into rooms');
select is((select v from _t where k = 'a_direct_member_insert'), '42501', 'no direct insert into room_members');
select is((select v from _t where k = 'a_direct_room_update'), '42501', 'no direct update of rooms');
select is((select v from _t where k = 'a_direct_member_delete'), '42501', 'no direct delete from room_members');
select is((select v from _t where k = 'a_join_attempts_select'), '42501', 'join_attempts is not readable by clients');
select is((select v from _t where k = 'b_open_a'), '42501:event_not_found', 'another host cannot open_room for my event');
select is((select v from _t where k = 'b_rooms'), '0', 'another host sees no rooms');
select is((select v from _t where k = 'b_members'), '0', 'another host sees no room_members');
select is((select v from _t where k = 'b_join_as_host'), '42501', 'another host cannot join_room_as_host');
select is((select v from _t where k = 'b_touch'), '42501', 'non-member cannot touch_room');

-- ---------------------------------------------------------------------------------------------
-- join_room: phones, anonymous sessions, team list, roster
-- ---------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}', true);
do $$
declare res jsonb; n int; code text := (select v from _t where k = 'room_code');
begin
  res := public.join_room(' ' || lower(code) || ' ', 3, '  Pat  ');
  insert into _t values ('p_join_event', res ->> 'event_id');
  insert into _t values ('p_join_teams', jsonb_array_length(res -> 'teams')::text);
  insert into _t values ('p_join_team1_keys', (select string_agg(k, ',' order by k) from jsonb_object_keys(res -> 'teams' -> 0) as k));
  insert into _t values ('p_join_team_names', (res -> 'teams' -> 0 ->> 'name') || '/' || (res -> 'teams' -> 1 ->> 'name'));

  select count(*) into n from public.room_members;
  insert into _t values ('p_members_visible', n::text);
  select count(*) into n from public.rooms;
  insert into _t values ('p_rooms_visible', n::text);

  -- re-join with another team is an upsert, not a second row
  perform public.join_room(code, 2, 'Pat');
  select count(*) into n from public.room_members;
  insert into _t values ('p_members_after_rejoin', n::text);
  insert into _t values ('p_team_after_rejoin', (select team::text from public.room_members));

  begin
    perform public.join_room(code, 9, 'Pat');
    insert into _t values ('p_bad_team', 'no error');
  exception when others then
    insert into _t values ('p_bad_team', sqlstate);
  end;

  res := public.join_room('BBBB', 1, 'Pat');
  insert into _t values ('p_wrong_code', coalesce(res ->> 'error', 'none'));
  -- wrong code did not remove the working membership
  select count(*) into n from public.room_members;
  insert into _t values ('p_members_after_wrong', n::text);

  perform public.touch_room(code);
  insert into _t values ('p_touch', 'ok');
end $$;

-- Owner roster and owner testing the join flow without losing the stage role.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare n int; code text := (select v from _t where k = 'room_code');
begin
  select count(*) into n from public.room_members;
  insert into _t values ('a_roster', n::text);
  perform public.join_room(code, 1, 'Owner test');
  insert into _t values ('a_role_after_join_room', (select role from public.room_members where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'));
  perform public.join_room_as_host(code);
  insert into _t values ('a_role_after_host', (select role from public.room_members where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'));
end $$;
reset role;

select is((select v from _t where k = 'p_join_event'), (select v from _t where k = 'ev_a'), 'join_room returns the event id');
select is((select v from _t where k = 'p_join_teams'), '2', 'join_room returns the teams from event_state');
select is((select v from _t where k = 'p_join_team1_keys'), 'color,id,name', 'join_room exposes only id, name, color per team');
select is((select v from _t where k = 'p_join_team_names'), 'Red/Blue', 'join_room keeps team order');
select is((select v from _t where k = 'p_members_visible'), '1', 'a phone sees only its own membership');
select is((select v from _t where k = 'p_rooms_visible'), '0', 'a phone cannot read the rooms table');
select is((select v from _t where k = 'p_members_after_rejoin'), '1', 're-joining does not duplicate the membership');
select is((select v from _t where k = 'p_team_after_rejoin'), '2', 're-joining updates the team');
select is((select v from _t where k = 'p_bad_team'), '22023', 'team outside 1..8 is rejected');
select is((select v from _t where k = 'p_wrong_code'), 'room_not_found', 'wrong code returns room_not_found');
select is((select v from _t where k = 'p_members_after_wrong'), '1', 'a wrong code does not disturb the current membership');
select is((select role from public.room_members where user_id = 'cccccccc-0000-4000-8000-000000000003'), 'phone', 'phone membership has role phone');
select is((select nickname from public.room_members where user_id = 'cccccccc-0000-4000-8000-000000000003'), 'Pat', 'nickname is trimmed');
select is((select v from _t where k = 'p_touch'), 'ok', 'a member can touch_room');
select is((select v from _t where k = 'a_roster'), '2', 'the owner sees the whole roster (stage + phone)');
select is((select v from _t where k = 'a_role_after_join_room'), 'stage', 'join_room does not downgrade the owner stage role');
select is((select v from _t where k = 'a_role_after_host'), 'host', 'join_room_as_host sets role host for the owner');

-- ---------------------------------------------------------------------------------------------
-- realtime.messages policies
-- Members: A (owner, role host), P (phone). Non-members: B, Q.
-- ---------------------------------------------------------------------------------------------
create temp table _rt (k text primary key, v text);
grant all on _rt to public;

set local role authenticated;
do $$
declare
  code text := (select v from _t where k = 'room_code');
  u record;
  t record;
  tests text[][] := array[
    -- who, kind, extension, expected ('ok' | 'denied')
    ['A', 'stage',  'broadcast', 'ok'],
    ['A', 'stage',  'presence',  'ok'],
    ['P', 'stage',  'broadcast', 'denied'],
    ['P', 'stage',  'presence',  'denied'],
    ['B', 'stage',  'broadcast', 'denied'],
    ['P', 'phones', 'broadcast', 'ok'],
    ['P', 'phones', 'presence',  'ok'],
    ['A', 'phones', 'broadcast', 'denied'],
    ['B', 'phones', 'broadcast', 'denied'],
    ['P', 'host',   'broadcast', 'denied'],
    ['P', 'host',   'presence',  'denied'],
    ['B', 'host',   'broadcast', 'denied'],
    ['A', 'host',   'broadcast', 'ok'],
    ['A', 'host',   'presence',  'ok']
  ];
  i int;
  sub text;
  outcome text;
begin
  for i in 1 .. array_length(tests, 1) loop
    sub := case tests[i][1]
      when 'A' then 'aaaaaaaa-0000-4000-8000-000000000001'
      when 'B' then 'bbbbbbbb-0000-4000-8000-000000000002'
      when 'P' then 'cccccccc-0000-4000-8000-000000000003'
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', sub, 'role', 'authenticated')::text, true);
    perform set_config('realtime.topic', 'room:' || code || ':' || tests[i][2], true);
    begin
      insert into realtime.messages (topic, extension, payload, event, private)
      values ('room:' || code || ':' || tests[i][2], tests[i][3], '{}'::jsonb, 'test', true);
      outcome := 'ok';
    exception when insufficient_privilege then
      outcome := 'denied';
    end;
    insert into _rt values (tests[i][1] || ':' || tests[i][2] || ':' || tests[i][3], outcome);
  end loop;
end $$;

-- Reads. The table now holds broadcast + presence rows for stage / phones / host.
do $$
declare
  code text := (select v from _t where k = 'room_code');
  who text; kind text; sub text; n int;
  cases text[][] := array[
    ['A', 'stage'], ['P', 'stage'], ['B', 'stage'],
    ['A', 'phones'], ['P', 'phones'], ['B', 'phones'],
    ['A', 'host'], ['P', 'host'], ['B', 'host']
  ];
  i int;
begin
  for i in 1 .. array_length(cases, 1) loop
    who := cases[i][1]; kind := cases[i][2];
    sub := case who
      when 'A' then 'aaaaaaaa-0000-4000-8000-000000000001'
      when 'B' then 'bbbbbbbb-0000-4000-8000-000000000002'
      when 'P' then 'cccccccc-0000-4000-8000-000000000003'
    end;
    perform set_config('request.jwt.claims', json_build_object('sub', sub, 'role', 'authenticated')::text, true);
    perform set_config('realtime.topic', 'room:' || code || ':' || kind, true);
    select count(*) into n from realtime.messages;
    insert into _rt values ('read:' || who || ':' || kind, case when n > 0 then 'visible' else 'hidden' end);
  end loop;

  -- wrong room code and malformed topics are invisible even to the owner
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
  perform set_config('realtime.topic', 'room:ZZZZ:stage', true);
  select count(*) into n from realtime.messages;
  insert into _rt values ('read:A:other-room', case when n > 0 then 'visible' else 'hidden' end);
  perform set_config('realtime.topic', 'lobby:' || code || ':stage', true);
  select count(*) into n from realtime.messages;
  insert into _rt values ('read:A:bad-prefix', case when n > 0 then 'visible' else 'hidden' end);
  perform set_config('realtime.topic', 'room:' || code || ':nope', true);
  select count(*) into n from realtime.messages;
  insert into _rt values ('read:A:bad-kind', case when n > 0 then 'visible' else 'hidden' end);
end $$;
reset role;

select is((select v from _rt where k = 'A:stage:broadcast'),  'ok',     'owner stage can broadcast on :stage');
select is((select v from _rt where k = 'A:stage:presence'),   'ok',     'owner stage can track presence on :stage');
select is((select v from _rt where k = 'P:stage:broadcast'),  'denied', 'a phone member cannot broadcast on :stage');
select is((select v from _rt where k = 'P:stage:presence'),   'denied', 'a phone member cannot track presence on :stage');
select is((select v from _rt where k = 'B:stage:broadcast'),  'denied', 'a non-member cannot broadcast on :stage');
select is((select v from _rt where k = 'P:phones:broadcast'), 'ok',     'a phone can broadcast on :phones');
select is((select v from _rt where k = 'P:phones:presence'),  'ok',     'a phone can track presence on :phones');
select is((select v from _rt where k = 'A:phones:broadcast'), 'denied', 'the owner cannot impersonate a phone on :phones');
select is((select v from _rt where k = 'B:phones:broadcast'), 'denied', 'a non-member cannot broadcast on :phones');
select is((select v from _rt where k = 'P:host:broadcast'),   'denied', 'a phone cannot broadcast on :host');
select is((select v from _rt where k = 'P:host:presence'),    'denied', 'a phone cannot track presence on :host');
select is((select v from _rt where k = 'B:host:broadcast'),   'denied', 'a non-member cannot broadcast on :host');
select is((select v from _rt where k = 'A:host:broadcast'),   'ok',     'the owner can broadcast on :host');
select is((select v from _rt where k = 'A:host:presence'),    'ok',     'the owner can track presence on :host');
select is((select v from _rt where k = 'read:A:stage'),  'visible', 'owner reads :stage');
select is((select v from _rt where k = 'read:P:stage'),  'visible', 'a phone member reads :stage');
select is((select v from _rt where k = 'read:B:stage'),  'hidden',  'a non-member cannot read :stage');
select is((select v from _rt where k = 'read:A:phones'), 'visible', 'owner reads :phones');
select is((select v from _rt where k = 'read:P:phones'), 'hidden',  'a phone cannot read :phones');
select is((select v from _rt where k = 'read:B:phones'), 'hidden',  'a non-member cannot read :phones');
select is((select v from _rt where k = 'read:A:host'),   'visible', 'owner reads :host');
select is((select v from _rt where k = 'read:P:host'),   'hidden',  'a phone cannot read :host (hidden information)');
select is((select v from _rt where k = 'read:B:host'),   'hidden',  'a non-member cannot read :host');
select is((select v from _rt where k = 'read:A:other-room'), 'hidden', 'owner cannot read a room they are not in');
select is((select v from _rt where k = 'read:A:bad-prefix'), 'hidden', 'topic must start with room:');
select is((select v from _rt where k = 'read:A:bad-kind'),   'hidden', 'unknown topic kinds are not readable');

-- ---------------------------------------------------------------------------------------------
-- Rate limit: 5 failed attempts / 10 minutes / user
-- ---------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-000000000004","role":"authenticated","is_anonymous":true}', true);
do $$
declare i int; res jsonb; code text := (select v from _t where k = 'room_code');
begin
  for i in 1 .. 5 loop
    res := public.join_room('BBB' || substr('CDFGH', i, 1), 1, 'Guess');
    insert into _t values ('q_try_' || i, coalesce(res ->> 'error', 'joined'));
  end loop;
  begin
    perform public.join_room('BBBZ', 1, 'Guess');
    insert into _t values ('q_try_6', 'no error');
  exception when others then
    insert into _t values ('q_try_6', sqlstate || ':' || sqlerrm);
  end;
  -- even the right code is refused while the limit is active
  begin
    perform public.join_room(code, 1, 'Guess');
    insert into _t values ('q_try_right_code', 'no error');
  exception when others then
    insert into _t values ('q_try_right_code', sqlstate || ':' || sqlerrm);
  end;
end $$;

-- The limit is per user: P still joins.
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}', true);
do $$
declare res jsonb;
begin
  res := public.join_room((select v from _t where k = 'room_code'), 2, 'Pat');
  insert into _t values ('p_after_q_limited', coalesce(res ->> 'error', 'joined'));
end $$;
reset role;

select is((select v from _t where k = 'q_try_1'), 'room_not_found', 'failed attempt 1 returns room_not_found');
select is((select v from _t where k = 'q_try_5'), 'room_not_found', 'failed attempt 5 returns room_not_found');
select is((select v from _t where k = 'q_try_6'), 'PT429:rate_limited', 'the 6th attempt raises rate_limited');
select is((select v from _t where k = 'q_try_right_code'), 'PT429:rate_limited', 'a correct code is refused while rate limited');
select is((select count(*)::int from public.join_attempts where user_id = 'dddddddd-0000-4000-8000-000000000004'), 5, 'five failed attempts were recorded');
select is((select v from _t where k = 'p_after_q_limited'), 'joined', 'rate limit is per user');

-- ---------------------------------------------------------------------------------------------
-- Expiry (12 h), purge, leave_room, privileges
-- ---------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
declare n int;
begin
  perform public.leave_room();
  select count(*) into n from public.room_members;
  insert into _t values ('p_members_after_leave', n::text);
end $$;
reset role;

select is((select v from _t where k = 'p_members_after_leave'), '0', 'leave_room removes the phone membership');
select is((select count(*)::int from public.room_members where role in ('stage', 'host')), 1, 'leave_room keeps the owner membership');

update public.rooms set last_seen_at = now() - interval '13 hours';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-000000000005","role":"authenticated","is_anonymous":true}', true);
do $$
declare res jsonb;
begin
  res := public.join_room((select v from _t where k = 'room_code'), 1, 'Late');
  insert into _t values ('r_expired_join', coalesce(res ->> 'error', 'joined'));
  begin
    perform public.purge_expired_rooms();
    insert into _t values ('r_purge', 'no error');
  exception when others then
    insert into _t values ('r_purge', sqlstate);
  end;
end $$;
reset role;

select is((select v from _t where k = 'r_expired_join'), 'room_not_found', 'an expired room (13 h idle) cannot be joined');
select is((select v from _t where k = 'r_purge'), '42501', 'clients cannot execute purge_expired_rooms');
select is(public.purge_expired_rooms(), 1, 'purge_expired_rooms deletes the expired room');
select is((select count(*)::int from public.rooms), 0, 'no rooms remain after the purge');
select is((select count(*)::int from public.room_members), 0, 'room_members cascade with the room');

-- ---------------------------------------------------------------------------------------------
-- Structure: RLS everywhere, nothing granted to anon
-- ---------------------------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname in ('profiles', 'events', 'event_state', 'host_settings', 'rooms', 'room_members', 'join_attempts')
      and c.relrowsecurity),
  7, 'RLS is enabled on all 7 tables');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'no public table is without RLS');
select ok(not has_table_privilege('anon', 'public.events', 'select'), 'anon has no privileges on events');
select ok(not has_table_privilege('authenticated', 'public.join_attempts', 'select'), 'authenticated has no privileges on join_attempts');
select ok(not has_table_privilege('authenticated', 'public.rooms', 'insert'), 'authenticated cannot insert into rooms');
select ok(not has_table_privilege('authenticated', 'public.room_members', 'insert'), 'authenticated cannot insert into room_members');

select * from finish();

rollback;
