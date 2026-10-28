-- supabase/tests/director.sql
-- claim_director / release_director (0002_director_lease.sql). Spec: design.md section 3, TD-002.
--
-- HOW TO RUN: same as rls.sql (supabase test db, or psql against a database that has 0001 and 0002
-- applied and pgTAP installed). The whole file runs in one transaction that is rolled back.
--
-- now() is constant inside a transaction, so "time passes" is simulated by moving
-- events.director_seen_at into the past as the privileged role. Observations made as a client role
-- are written to the temp table _t and asserted afterwards as the privileged role (see rls.sql).

begin;

select plan(30);

insert into auth.users (id, email, is_anonymous) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'host-a@example.test', false),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'host-b@example.test', false);

create temp table _t (k text primary key, v text);
grant all on _t to public;

-- ---------------------------------------------------------------------------------------------
-- Host A creates an event; host B creates one too.
-- ---------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
with ins as (insert into public.events (name) values ('Show A') returning id)
  insert into _t select 'ev_a', id::text from ins;

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
with ins as (insert into public.events (name) values ('Show B') returning id)
  insert into _t select 'ev_b', id::text from ins;
reset role;

select ok((select director_session is null and director_seen_at is null from public.events where id = (select v::uuid from _t where k = 'ev_a')),
          'a new event has no director');

-- ---------------------------------------------------------------------------------------------
-- Claim on a free lease, same-session heartbeat, refusal of a second tab
-- ---------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare ev uuid := (select v::uuid from _t where k = 'ev_a'); res jsonb;
begin
  res := public.claim_director(ev, 'tab-1');
  insert into _t values ('claim_free', res::text);
end $$;
reset role;

select is((select v::jsonb from _t where k = 'claim_free'), '{"ok": true}'::jsonb, 'claiming a free lease returns ok');
select is((select director_session from public.events where id = (select v::uuid from _t where k = 'ev_a')), 'tab-1', 'the claim stored the session');
select ok((select director_seen_at = now() from public.events where id = (select v::uuid from _t where k = 'ev_a')), 'the claim stamped director_seen_at');

-- 20 s later tab-1 heartbeats; tab-2 asks too.
update public.events set director_seen_at = now() - interval '20 seconds'
 where id = (select v::uuid from _t where k = 'ev_a');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare ev uuid := (select v::uuid from _t where k = 'ev_a'); res jsonb;
begin
  res := public.claim_director(ev, 'tab-2');
  insert into _t values ('claim_busy', res::text);
  insert into _t values ('claim_busy_session', (select director_session from public.events where id = ev));
  res := public.claim_director(ev, 'tab-1');
  insert into _t values ('heartbeat', res::text);
end $$;
reset role;

select is((select (v::jsonb ->> 'ok') from _t where k = 'claim_busy'), 'false', 'a second tab is refused while the lease is live (20 s old, ttl 30)');
select ok((select (v::jsonb -> 'holder_seen_at') is not null and (v::jsonb ->> 'holder_seen_at')::timestamptz = now() - interval '20 seconds' from _t where k = 'claim_busy'),
          'the refusal reports when the holder was last seen');
select is((select v from _t where k = 'claim_busy_session'), 'tab-1', 'a refused claim leaves the holder in place');
select is((select v::jsonb from _t where k = 'heartbeat'), '{"ok": true}'::jsonb, 'the holder renews its own lease');
select ok((select director_seen_at = now() from public.events where id = (select v::uuid from _t where k = 'ev_a')), 'the heartbeat refreshed director_seen_at');
select is((select director_session from public.events where id = (select v::uuid from _t where k = 'ev_a')), 'tab-1', 'the heartbeat kept the holder');

-- A heartbeat is not a user edit: updated_at must not move. (now() is constant in this
-- transaction, so compare against a value that is clearly different.)
update public.events set updated_at = now() - interval '1 day', director_seen_at = now() - interval '5 seconds'
 where id = (select v::uuid from _t where k = 'ev_a');
update public.events set director_seen_at = now() - interval '5 seconds'
 where id = (select v::uuid from _t where k = 'ev_a');
select ok((select updated_at < now() - interval '23 hours' from public.events where id = (select v::uuid from _t where k = 'ev_a')),
          'updating only director columns does not touch updated_at');
update public.events set name = 'Show A (renamed)' where id = (select v::uuid from _t where k = 'ev_a');
select ok((select updated_at = now() from public.events where id = (select v::uuid from _t where k = 'ev_a')),
          'renaming the event still bumps updated_at');

-- ---------------------------------------------------------------------------------------------
-- Takeover after the TTL, custom TTL, boundary
-- ---------------------------------------------------------------------------------------------
update public.events set director_seen_at = now() - interval '31 seconds'
 where id = (select v::uuid from _t where k = 'ev_a');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare ev uuid := (select v::uuid from _t where k = 'ev_a'); res jsonb;
begin
  res := public.claim_director(ev, 'tab-2');
  insert into _t values ('steal', res::text);
  insert into _t values ('steal_session', (select director_session from public.events where id = ev));
  -- the old holder wakes up and heartbeats: it has been replaced
  res := public.claim_director(ev, 'tab-1');
  insert into _t values ('old_holder', res::text);
end $$;
reset role;

select is((select v::jsonb from _t where k = 'steal'), '{"ok": true}'::jsonb, 'a stale lease (31 s > ttl 30) can be taken over');
select is((select v from _t where k = 'steal_session'), 'tab-2', 'the new tab is now the director');
select is((select (v::jsonb ->> 'ok') from _t where k = 'old_holder'), 'false', 'the replaced tab is refused on its next heartbeat');

-- A shorter TTL expires sooner; a longer one protects the holder.
update public.events set director_seen_at = now() - interval '10 seconds'
 where id = (select v::uuid from _t where k = 'ev_a');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare ev uuid := (select v::uuid from _t where k = 'ev_a');
begin
  insert into _t values ('ttl_long',  public.claim_director(ev, 'tab-1', 60)::text);
  insert into _t values ('ttl_short', public.claim_director(ev, 'tab-1', 5)::text);
end $$;
reset role;

select is((select (v::jsonb ->> 'ok') from _t where k = 'ttl_long'), 'false', 'a 10 s old lease is live under a 60 s ttl');
select is((select (v::jsonb ->> 'ok') from _t where k = 'ttl_short'), 'true', 'a 10 s old lease is expired under a 5 s ttl');

-- A holder row with no timestamp is treated as expired.
update public.events set director_session = 'ghost', director_seen_at = null
 where id = (select v::uuid from _t where k = 'ev_a');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  insert into _t values ('null_seen', public.claim_director((select v::uuid from _t where k = 'ev_a'), 'tab-3')::text);
end $$;
reset role;
select is((select v::jsonb from _t where k = 'null_seen'), '{"ok": true}'::jsonb, 'a lease without director_seen_at can be claimed');

-- ---------------------------------------------------------------------------------------------
-- Release
-- ---------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare ev uuid := (select v::uuid from _t where k = 'ev_a');
begin
  -- tab-3 holds it; a late release from tab-1 must not evict it
  perform public.release_director(ev, 'tab-1');
  insert into _t values ('after_foreign_release', (select director_session from public.events where id = ev));
  perform public.release_director(ev, 'tab-3');
  insert into _t values ('after_own_release', coalesce((select director_session from public.events where id = ev), 'null'));
  insert into _t values ('after_own_release_seen', coalesce((select director_seen_at::text from public.events where id = ev), 'null'));
  -- a free lease is immediately claimable
  insert into _t values ('after_release_claim', public.claim_director(ev, 'tab-4')::text);
  -- releasing twice / releasing a free lease is a no-op
  perform public.release_director(ev, 'tab-3');
  insert into _t values ('after_noop_release', (select director_session from public.events where id = ev));
end $$;
reset role;

select is((select v from _t where k = 'after_foreign_release'), 'tab-3', 'release by a non-holder does nothing');
select is((select v from _t where k = 'after_own_release'), 'null', 'release by the holder clears director_session');
select is((select v from _t where k = 'after_own_release_seen'), 'null', 'release by the holder clears director_seen_at');
select is((select v::jsonb from _t where k = 'after_release_claim'), '{"ok": true}'::jsonb, 'a released lease can be claimed at once');
select is((select v from _t where k = 'after_noop_release'), 'tab-4', 'a stale release does not evict the new holder');

-- ---------------------------------------------------------------------------------------------
-- Non-owner, anonymous and invalid arguments
-- ---------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare ev uuid := (select v::uuid from _t where k = 'ev_a');
begin
  begin
    perform public.claim_director(ev, 'intruder');
    insert into _t values ('b_claim', 'no error');
  exception when others then
    insert into _t values ('b_claim', sqlstate || ':' || sqlerrm);
  end;
  -- release by a non-owner (even with the right session string) is a silent no-op
  perform public.release_director(ev, 'tab-4');
  begin
    perform public.claim_director(gen_random_uuid(), 'x');
    insert into _t values ('b_unknown_event', 'no error');
  exception when others then
    insert into _t values ('b_unknown_event', sqlstate || ':' || sqlerrm);
  end;
  -- B can still use its own event
  insert into _t values ('b_own', public.claim_director((select v::uuid from _t where k = 'ev_b'), 'b-tab')::text);
end $$;

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare ev uuid := (select v::uuid from _t where k = 'ev_a');
begin
  begin
    perform public.claim_director(ev, '   ');
    insert into _t values ('blank_session', 'no error');
  exception when others then
    insert into _t values ('blank_session', sqlstate);
  end;
  begin
    perform public.claim_director(ev, 'tab-1', 0);
    insert into _t values ('zero_ttl', 'no error');
  exception when others then
    insert into _t values ('zero_ttl', sqlstate);
  end;
end $$;
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    perform public.claim_director(gen_random_uuid(), 'x');
    insert into _t values ('anon_claim', 'no error');
  exception when others then
    insert into _t values ('anon_claim', sqlstate);
  end;
  begin
    perform public.release_director(gen_random_uuid(), 'x');
    insert into _t values ('anon_release', 'no error');
  exception when others then
    insert into _t values ('anon_release', sqlstate);
  end;
end $$;
reset role;

select is((select v from _t where k = 'b_claim'), '42501:event_not_found', 'a non-owner cannot claim another host''s event');
select is((select director_session from public.events where id = (select v::uuid from _t where k = 'ev_a')), 'tab-4', 'a non-owner release leaves the holder in place');
select is((select v from _t where k = 'b_unknown_event'), '42501:event_not_found', 'claiming an unknown event is refused like a foreign one');
select is((select v::jsonb from _t where k = 'b_own'), '{"ok": true}'::jsonb, 'each host can claim their own event');
select is((select v from _t where k = 'blank_session'), '22023', 'a blank session id is rejected');
select is((select v from _t where k = 'zero_ttl'), '22023', 'a non-positive ttl is rejected');
select is((select v from _t where k = 'anon_claim') || '/' || (select v from _t where k = 'anon_release'), '42501/42501', 'anon cannot execute claim_director or release_director');

select * from finish();

rollback;
