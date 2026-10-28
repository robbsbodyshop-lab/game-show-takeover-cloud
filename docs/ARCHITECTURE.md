# Architecture

This describes how the code is put together as it stands today. The decisions and their reasons are
in `.ai/sdd/specs/001-cloud-rewrite/design.md`. Anything still being built is marked **in progress**.

## 1. Topology

One Vite and React 19 single-page app serves three entry points. Vercel hosts the static files.
Supabase provides sign-in, Postgres and Realtime. There is no custom server.

```
 Projector/TV        Host laptop or tablet         Team phones (up to 8)
 +-----------+       +------------------+          +-----------+
 |  STAGE /  |       |  HOST VIEW /host |          |  PHONE    |
 |  engines, |       |  console + stage |          |  /play    |
 |  audio    |       |  snapshot        |          |  buzz,    |
 +-----+-----+       +--------+---------+          |  podium   |
       |                      |                    +-----+-----+
       | supabase-js          |                          | anonymous JWT
       v                      v                          v
 +-----------------------------------------------------------------+
 | Supabase: Auth, Postgres (events, state, rooms, members)        |
 | Realtime private channels: room:<code>:stage                    |
 |                            room:<code>:phones                   |
 |                            room:<code>:host                     |
 +-----------------------------------------------------------------+
       ^ static files
 +-----+-----+
 |  Vercel   |  dist/, SPA rewrite, security and cache headers
 +-----------+
```

| Entry     | Path      | Component                      | Who uses it                                       |
| --------- | --------- | ------------------------------ | ------------------------------------------------- |
| Stage     | `/`       | `src/stage/StageApp.tsx`       | The host, on the projector. Signed in by email.   |
| Host view | `/host`   | `src/host/HostView.tsx`        | The host, on a second device. Signed in by email. |
| Phone     | `/play`   | `src/phone/PhoneApp.tsx`       | Teams. Signed in anonymously, no account.         |
| Design    | `/design` | `src/design/DesignGallery.tsx` | Developers. Development builds only.              |

Each entry point is its own lazy-loaded chunk, so a phone never downloads the stage (NFR-004).

**The stage is the only writer of game state.** It runs the engines, saves snapshots and publishes
a redacted audience view to phones and a full host view to host views. Phones and host views send
commands and presses. The stage checks every one of them against the engine before applying it.

- **Director lease (TD-002).** The design gives each event one director stage, recorded in
  `events.director_session` with a 10 s heartbeat. A second stage tab becomes read-only. **In
  progress:** the schema has the columns, but the heartbeat is not written yet. A second stage is
  noticed only at its first failed save (`src/stage/StageSession.tsx`).
- **Host views are thin.** They render the host snapshot and send commands. Any number may connect.
- **Phones** render the audience subset they need and send presses and podium actions.

## 2. Module map

Dependency rules, by convention and checked in review (the lint config does not enforce them yet):

- `src/engines/**` and `src/judging/**` import nothing from React, the DOM or Supabase.
- `src/games/**` never import `src/realtime` or `src/data`. They talk to phones and host views
  through `PhoneBridge` and `HostBridge`.
- `src/stage/**` composes everything. Persistence goes through `src/data`, never Supabase directly.

| Folder                | Holds                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/`            | `main.tsx` (entry and service wiring), `App.tsx` (route choice), `env.ts` (mode detection).                                                              |
| `src/engines/event/`  | Event reducer: teams, doors, hub, tournament bracket, Speed Round, Plinko, schema.                                                                       |
| `src/engines/feud/`   | Family Feud main game (`feudEngine.ts`), Fast Money, board, selectors.                                                                                   |
| `src/engines/wheel/`  | Wheel of Fortune engine. **In progress.**                                                                                                                |
| `src/engines/puzzle/` | Capsule Clinic engine: board, matching, scoring, versus, seeded RNG.                                                                                     |
| `src/judging/`        | Typed-answer judging: normalising, stemming, synonyms, answer matching.                                                                                  |
| `src/games/feud/`     | Family Feud controller, timing, clock, speech input, cues, saved state. Components **in progress**.                                                      |
| `src/games/wheel/`    | Wheel controller, spin plan, puzzle provider, settings. Components **in progress**.                                                                      |
| `src/games/puzzle/`   | Capsule Clinic screen: canvas renderer, controller, sprites, art, setup and title screens.                                                               |
| `src/games/speed/`    | Speed Round screen, host zone, awards.                                                                                                                   |
| `src/games/plinko/`   | Plinko finale board and screen.                                                                                                                          |
| `src/games/winner/`   | Winner announcement screen.                                                                                                                              |
| `src/stage/`          | The 1920x1080 stage: session, phase router, hub, setup, doors, scoreboard, dialogs, sign-in, room join panel, persistence hooks, phone and host bridges. |
| `src/host/`           | Host view, F2 drawer, console registry, settings, host channel and protocol.                                                                             |
| `src/phone/`          | Phone app: join, team picker, buzz, podium, Feud answer box, stage link, local storage.                                                                  |
| `src/realtime/`       | `RoomTransport` interface, Supabase transport, memory and BroadcastChannel hubs, zod schemas, room codes, roles.                                         |
| `src/data/`           | Supabase client, repositories (Supabase and in-memory), persistence, zod schemas.                                                                        |
| `src/audio/`          | Cue registry (`cues.ts`) and the Web Audio player (`player.ts`).                                                                                         |
| `src/content/`        | Family Feud and Wheel of Fortune content (JSON), zod schema, pickers.                                                                                    |
| `src/design/`         | Tokens, global CSS, primitives (Panel, Button, Marquee, Dialog and others), boot screen, memory-card menu, dither.                                       |
| `src/lib/`            | Logger. `debug` output is silent unless `localStorage["gst:debug"] = "1"`.                                                                               |
| `src/test/`           | Test setup for Vitest.                                                                                                                                   |

Content: 115 Family Feud surveys with a Fast Money list, and 331 Wheel of Fortune puzzles. Both are
validated with zod at load time (`src/content/schema.ts`).

Stack choices and why: [tech-stack](../.ai/steering/tech-stack.md) and design TD-001 to TD-008.
Plain CSS tokens with CSS Modules, no Tailwind (TD-006). A small in-house router (TD-007).

## 3. Engine contract

Every engine follows the same rules (principle P-003):

- `reduce(state, action): state` is pure. Plain serialisable data only: no `Set`, `Map` or functions.
- An illegal action returns the **same object**. The UI can then tell that nothing happened.
- Each presentation event carries a monotonic `seq`. `UNDO` never rewinds `seq`, so an animation
  keyed on it never replays.
- `UNDO` keeps a history of 30 steps.
- Randomness is injected as an action field (`draw`, a number in [0, 1)). Content is injected by
  `PROVIDE_*` actions (for example Wheel puzzles) or carried in the action (Feud surveys). Engines
  never pick content or roll dice themselves. That is what makes them replayable and testable.
- Time arrives in actions too (`now`), so clocks are testable.
- Judging is outside the engine. The Feud controller turns typed or spoken text into `slot`, `miss`
  or `review`, and the engine only sees the result.

The event reducer (`src/engines/event/eventReducer.ts`) wraps the game engines. It owns teams,
scores, chips, the play order, which games are done and the running `game` snapshot. Phases:
`setup`, `doors`, `hub`, then `feud` or `wheel` or `speed` or `plinko` or `puzzle`, then `winner`.
`gameInstance` changes when a game ends, so each game's result is credited exactly once.

## 4. Realtime protocol

Each room has three Realtime topics. Each carries Broadcast events, and presence is used for
rosters. Every message has the envelope `{ v: 1, from, sent }`. `v` is the protocol version (1).
`from` is fixed per event, so a message that names the wrong sender is dropped. Payloads are zod
validated (`src/realtime/schemas.ts`). Unknown events, invalid bodies and oversized payloads are
dropped and logged. Nothing throws.

Team ids are integers 1 to 8 everywhere.

### Topic `room:<CODE>:stage`: stage to everyone

| Event      | Payload                                                                      | When                                             |
| ---------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| `teams`    | `{ teams: [{ id, name, color }] }`                                           | On join and on team edits                        |
| `controls` | `{ activeTeam, canBuy, canSpin, canSolve, turnName, buzzTeams?, offLabel? }` | On change, debounced 50 ms                       |
| `ack`      | `{ team, pressId, accepted }`                                                | Reply to a press or action                       |
| `audience` | `{ phase, paused, scores: [{ team, score }], clock?: { endsAt, label } }`    | About 1 Hz and on change. No hidden information. |

### Topic `room:<CODE>:phones`: phones to stage

| Event         | Payload                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------- |
| `press`       | `{ pressId, team, at }`                                                                             |
| `action`      | `{ pressId, team, action: 'buy' \| 'spin' \| 'solve' \| 'solve-start' \| 'solve-cancel', answer? }` |
| `feud-answer` | `{ pressId, team, text }`, sent when answers come from phones or both                               |

Presence on this topic is the phone roster: `{ team, nickname, ua }`.

### Topic `room:<CODE>:host`: stage and host views

| Event      | Direction     | Payload                                                                                                                        |
| ---------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `hello`    | host to stage | `{ hostId }`, every 2 s (`HOST_HELLO_INTERVAL_MS`). A host view shows "Lost contact with the stage" when the stage goes quiet. |
| `snapshot` | stage to host | `{ kind, gameRev, inputLocked, data }`. Sent on change and on `hello`.                                                         |
| `command`  | host to stage | `{ cmdId, target, gameRev, teamId?, name, args? }`                                                                             |
| `result`   | stage to host | `{ cmdId, applied, reason? }`                                                                                                  |

Presence on the host topic tracks host views. Their payload has `team: 0`.

### Rules the stage enforces

- Every inbound message is re-checked against the engine (P-004). Phone controls are only a display.
- A press is ignored if it comes less than 150 ms after the same team's previous press (FR-029).
  The stage answers with `ack`.
- A `command` carries the `gameRev` it was made against, so the stage can reject a stale one. A repeated
  `cmdId` within 500 ms (`COMMAND_REPEAT_WINDOW_MS`) is a duplicate (FR-017). The host side defines both;
  the stage-side checks are **in progress**.
- Payloads stay under 32 KB (`MAX_PAYLOAD_BYTES`). The hosted Realtime limit is 256 KB.
- Reconnection (`SupabaseRoomTransport`): when a channel fails, the whole set is rebuilt after 1 s,
  2 s, 4 s, 8 s and then every 10 s. The auth token is pushed to Realtime as the session refreshes.
  The design (section 5) has the stage send `teams`, `controls` and the host snapshot again after a
  reconnect; that republish is **in progress**.
- Phones show "Waiting for the game screen" once the stage has been silent for 8 s (`STAGE_SILENCE_MS`).

### Transports

`RoomTransport` is the interface. Two implementations exist:

- `SupabaseRoomTransport`: private channels, authorised by the RLS policies in section 5.
- `MemoryRoomTransport`: in-process, used by tests. `BroadcastRoomHub` extends it with a
  `BroadcastChannel('gst-room-hub')` relay so that demo tabs in one browser can reach each other.

The host snapshot is also mirrored over `BroadcastChannel('gst-host')`, so a host view in another
tab of the same browser keeps working when the network is down.

## 5. Data model and row level security

Migration: `supabase/migrations/0001_init.sql`. It is written but **not yet applied** to the
hosted project (see [DEPLOYMENT.md](DEPLOYMENT.md)).

| Table           | Purpose                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `profiles`      | One row per auth user, including anonymous phone sessions. Created by trigger.                                                                   |
| `events`        | An event owned by one host. `status`: `setup`, `live`, `finished`. Holds `director_session`.                                                     |
| `event_state`   | One row per event: `rev` (bigint) and `state` (jsonb), the whole saved session including the running game's engine snapshot. Created by trigger. |
| `host_settings` | Per-host settings: `feud`, `wheel` and `app` as jsonb.                                                                                           |
| `rooms`         | Room code (4 letters, from the 20 consonants `BCDFGHJKLMNPQRSTVWXZ`), its event and its owner. `last_seen_at` drives expiry.                     |
| `room_members`  | Who is in a room: role `stage`, `host` or `phone`, team (1 to 8), nickname.                                                                      |
| `join_attempts` | Failed joins, for rate limiting. No client access at all.                                                                                        |

### Functions (RPCs)

Clients never write `rooms`, `room_members` or `join_attempts` directly. They call these functions.

| Function                          | Who may call                           | What it does                                                                                                                                                                                        |
| --------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open_room(event_id)`             | Owner                                  | Returns the event's room code, creating a unique one if needed. Purges expired rooms first.                                                                                                         |
| `join_room(code, team, nickname)` | Any signed-in user, anonymous included | Adds a phone to the room. Returns `{ event_id, teams }`. An unknown or expired code returns `{ error: 'room_not_found' }`. More than 5 failed joins in 10 minutes raises `rate_limited` (HTTP 429). |
| `join_room_as_host(code)`         | Owner                                  | Adds a host view to the owner's own room.                                                                                                                                                           |
| `leave_room()`                    | Signed-in user                         | Removes the caller's phone memberships.                                                                                                                                                             |
| `touch_room(code)`                | Room members                           | Refreshes `last_seen_at`.                                                                                                                                                                           |
| `keepalive()`                     | `anon`, `authenticated`                | Returns 1. Called daily by the keep-alive workflow.                                                                                                                                                 |
| `purge_expired_rooms()`           | `service_role`, and `open_room`        | Deletes rooms idle for more than 12 hours, and failed-join rows older than an hour.                                                                                                                 |

All functions set `search_path = ''` and use schema-qualified names.

### RLS summary

- `profiles`: each user reads and writes their own row.
- `events`, `event_state`, `host_settings`: only the owner (`owner_id = auth.uid()`, or the parent
  event's owner for `event_state`).
- `rooms`: the owner reads. Nobody writes directly.
- `room_members`: a user reads their own membership, and the room owner reads the whole roster.
- `join_attempts`: no policy and no grants.
- Grants: the schema revokes everything from the client roles and grants back only what is listed.

Realtime authorisation (`realtime.messages`, with "Allow public access" off). Six policies. A topic
is `room:<CODE>:<kind>`, and the policies read the code and kind with `split_part`.

| Topic  | Read                                    | Write                                                                                        |
| ------ | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| stage  | Any member of the room                  | The owner's stage or host sessions (`role` in stage, host, and the user is `rooms.owner_id`) |
| phones | The owner's sessions only               | Phone members only                                                                           |
| host   | The owner's stage or host sessions only | The owner's stage or host sessions only                                                      |

The host topic is owner-only because host snapshots carry hidden information. Phones can therefore
never read it. Phones also cannot publish to the stage topic, so they cannot impersonate the stage.

## 6. Persistence and resume

- The stage saves the whole event after each change. `src/data/persistence.ts` debounces writes by
  500 ms. It flushes at once when the page becomes hidden or is closing.
- Each save is a compare-and-set: `update ... set rev = rev + 1 where event_id = ? and rev = ?`.
  If no row matches, another stage has saved first. This stage then becomes read-only and says so.
- The last saved state is also cached in `localStorage` under `gst:cache:<eventId>`, so a reload
  shows the screen at once while the cloud copy loads. The cache is a convenience. A failed or
  blocked `localStorage` is handled and the app still works.
- A game in progress resumes exactly, because its engine state is plain data stored inside the
  session (TD-003). Clocks are stored as an end time, or as the time left when paused. A reload
  recomputes the clock.
- A phone keeps its room, team and nickname in `localStorage` (`src/phone/phoneStorage.ts`) and
  rejoins silently after a reload (FR-021).
- Host views store nothing on the server beyond their membership row. They receive the full state
  from the stage on every `hello`.

## 7. Hidden information

Principle P-002: answers, puzzle solutions, the question queue and the sealed envelope never reach
an audience device.

- Each engine has a host selector (`hostView`) and an audience selector (`audienceView`).
  `audienceView` exists for Feud and Wheel. Stage components receive only the audience view.
- The host snapshot is published only on the host topic, which RLS restricts to the owner's
  sessions. Phones are not subscribed to it and cannot read it.
- `audience` events carry only phase, pause state, scores and the clock.
- `src/engines/feud/selectors.test.ts` asserts that the audience view of a Feud state contains no
  unrevealed answer text. The Wheel engine tests use `audienceView` as well. Every game needs this
  test before it ships.

## 8. Demo mode

Demo mode runs the whole app without Supabase. `src/app/env.ts` picks it when any of these is true:

- The build or dev server runs with `--mode demo`.
- The URL has `?demo=1`.
- `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY` is missing.

In demo mode:

- Data comes from `src/data/repositories/memory/` (in-memory). Nothing is persisted between page
  loads except the `localStorage` cache.
- Room traffic uses `MemoryRoomTransport` through `BroadcastRoomHub`, so a demo phone in another tab
  of the same origin reaches the stage.
- The Playwright suite builds and serves in demo mode (`playwright.config.ts`), so CI needs no
  Supabase project.

## 9. Testing layers

| Layer                  | Tool                           | Location                           | Covers                                                                           |
| ---------------------- | ------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------- |
| Engine rules           | Vitest                         | `src/engines/**/*.test.ts`         | Each rule in the rules documents. Seeded RNG and fixture content.                |
| Selectors              | Vitest                         | `src/engines/**/selectors.test.ts` | Audience view leaks nothing hidden.                                              |
| Judging and content    | Vitest                         | `src/judging`, `src/content`       | Answer matching, normalising, content schema and pickers.                        |
| Protocol and transport | Vitest                         | `src/realtime/*.test.ts`           | zod schemas, memory transport contract, reconnect and backoff.                   |
| Data                   | Vitest                         | `src/data`                         | Repositories (in-memory and fake Supabase), persistence.                         |
| Components             | Vitest, Testing Library, jsdom | `src/**/*.test.tsx`                | Phone, host and stage screens.                                                   |
| Database and RLS       | SQL with pgTAP                 | `supabase/tests/rls.sql`           | Cross-tenant reads denied, phones cannot write the stage topic, join rate limit. |
| End to end             | Playwright (Chromium)          | `e2e/`                             | Demo-mode flows. One smoke test so far. Multi-page flows are **in progress**.    |
| CI                     | GitHub Actions                 | `.github/workflows/ci.yml`         | `npm run validate` on each push and pull request. Playwright as a second job.    |

About 77 test files exist across `src/`. Run them with `npm test`. Run the SQL tests with
`supabase test db` against a local stack, or with `psql` against a migrated database (the file
explains both).

## 10. Open items

- **In progress:** Family Feud and Wheel of Fortune screens, and their registration in `App.tsx`.
  Until then every game slot shows a stub. The Speed Round, Plinko, Capsule Clinic and winner
  screens exist as components but are not registered either.
- **In progress:** the director lease heartbeat (section 1).
- **In progress:** the Wheel of Fortune engine.
- **Open question Q-001:** the puzzle game's name. "Capsule Clinic" is a working title pending the
  owner's approval. Q-005 (its scoring) is also open. The proposed rules are in use.
