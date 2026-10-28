# Architecture

This describes how the code is put together as it is now. The decisions and their reasons are in
`.ai/sdd/specs/001-cloud-rewrite/design.md`. What is not done yet, and the known gaps, are in
[CHANGELOG.md](../CHANGELOG.md#known-gaps).

## 1. Topology

One Vite and React 19 single-page app serves three pages. Vercel hosts the static files. Supabase
provides sign-in, Postgres and Realtime. There is no custom server.

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
 +------------------------------------------------------------------+
 | Supabase: Auth, Postgres (events, state, rooms, members)         |
 | Realtime private channels: room:<code>:stage                     |
 |                            room:<code>:host                      |
 |                            room:<code>:phones:1 ... :phones:8    |
 +------------------------------------------------------------------+
       ^ static files
 +-----+-----+
 |  Vercel   |  dist/, page rewrites, security and cache headers
 +-----------+
```

| Page      | Path      | HTML entry   | Script entry           | Screen                         | Who uses it                                       |
| --------- | --------- | ------------ | ---------------------- | ------------------------------ | ------------------------------------------------- |
| Stage     | `/`       | `index.html` | `src/app/main.tsx`     | `src/stage/StageApp.tsx`       | The host, on the projector. Signed in by email.   |
| Host view | `/host`   | `host.html`  | `src/app/hostMain.tsx` | `src/host/HostView.tsx`        | The host, on a second device. Signed in by email. |
| Phone     | `/play`   | `play.html`  | `src/app/playMain.tsx` | `src/phone/PhoneApp.tsx`       | Teams. Signed in anonymously, no account.         |
| Design    | `/design` | (stage page) | (stage page)           | `src/design/DesignGallery.tsx` | Developers. Development builds only.              |

`vercel.json` (and `vite.config.ts` in development) maps `/play` and `/host` to their pages, and
everything else to `index.html`. Each page is its own chunk, so a phone never downloads the stage
(NFR-004). `src/app/App.tsx` chooses the stage's screen from the path (`src/app/routes.ts`).

**The stage is the only writer of game state.** It runs the engines, saves the event, publishes a
redacted audience view to phones and a full host view to host views. Phones and host views send
commands and presses. The stage checks every one of them against the engine before applying it.

- **Director lease (TD-002).** Each stage tab claims its event's lease when it mounts and renews it every
  10 s (`src/stage/directorLease.ts`, `claim_director` in `0002_director_lease.sql`). The lease lapses
  30 s after the last renewal, so a closed tab does not lock the event. The stage opens the room and
  connects to Realtime only after its tab holds the lease. A second stage tab is therefore read-only and
  never joins the room. A save that finds a newer revision also demotes the stage.
- **Host views are thin.** They render the host snapshot and send commands. Any number may connect.
- **Phones** render the audience subset they need and send presses and podium actions.

## 2. Module map

Dependency rules, checked in review (the lint config does not enforce them yet):

- `src/engines/**` and `src/judging/**` import nothing from React, the DOM or Supabase.
- `src/games/**` never import `src/realtime` or `src/data`. They talk to phones and host views
  through `PhoneBridge` and `HostBridge` (`src/stage/gameContract.ts`).
- `src/stage/**` composes everything. Persistence goes through `src/data`, never Supabase directly.

| Folder                | Holds                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/`            | Page entries (`main.tsx` for the stage, `playMain.tsx`, `hostMain.tsx`), `App.tsx` and `routes.ts` (screen choice), `stageRegistry.ts` (the games and screens the stage renders), `lightServices.ts` and `mountLight.tsx` (services for the phone and host pages; the Supabase client is loaded by dynamic import, and only in Supabase mode), `env.ts` (mode detection). |
| `src/engines/event/`  | Event reducer: teams, doors, hub, tournament bracket, Speed Round, Plinko, schema.                                                                                                                                                                                                                                                                                        |
| `src/engines/feud/`   | Family Feud main game (`feudEngine.ts`), Fast Money, board, selectors.                                                                                                                                                                                                                                                                                                    |
| `src/engines/wheel/`  | Wheel of Fortune engine: episode plan, rounds, Bonus Round, puzzle state, solve judging, selectors.                                                                                                                                                                                                                                                                       |
| `src/engines/puzzle/` | Capsule Clinic engine: board, matching, scoring, versus, seeded RNG.                                                                                                                                                                                                                                                                                                      |
| `src/judging/`        | Typed-answer judging: normalising, stemming, synonyms, answer matching.                                                                                                                                                                                                                                                                                                   |
| `src/games/feud/`     | Family Feud screens and console, controller, timing, clock, speech input, cues, saved state, settings.                                                                                                                                                                                                                                                                    |
| `src/games/wheel/`    | Wheel of Fortune screens and console, controller, spin plan, puzzle provider, settings, saved state.                                                                                                                                                                                                                                                                      |
| `src/games/puzzle/`   | Capsule Clinic screen: canvas renderer, controller, sprites, art, setup and title screens.                                                                                                                                                                                                                                                                                |
| `src/games/speed/`    | Speed Round screen, host zone, awards.                                                                                                                                                                                                                                                                                                                                    |
| `src/games/plinko/`   | Plinko finale board and screen.                                                                                                                                                                                                                                                                                                                                           |
| `src/games/winner/`   | Winner announcement screen.                                                                                                                                                                                                                                                                                                                                               |
| `src/stage/`          | The 1920x1080 stage: session, phase router, hub, setup, doors, scoreboard with the join QR code, dialogs, sign-in, room join panel, persistence and director lease, phone and host bridges.                                                                                                                                                                               |
| `src/host/`           | Host view, F2 drawer, console registry, app and next-game settings, host channel and protocol.                                                                                                                                                                                                                                                                            |
| `src/phone/`          | Phone app: join, team picker, buzz, podium, Feud answer box, stage link, local storage.                                                                                                                                                                                                                                                                                   |
| `src/realtime/`       | `RoomTransport` interface, Supabase transport, memory and BroadcastChannel hubs, zod schemas, room codes, channel plan (`roles.ts`).                                                                                                                                                                                                                                      |
| `src/data/`           | Supabase client, repositories (Supabase and in-memory), persistence, zod schemas.                                                                                                                                                                                                                                                                                         |
| `src/audio/`          | Cue registry (`cues.ts`) and the Web Audio player (`player.ts`).                                                                                                                                                                                                                                                                                                          |
| `src/content/`        | Family Feud and Wheel of Fortune content (JSON), zod schema, pickers.                                                                                                                                                                                                                                                                                                     |
| `src/design/`         | Tokens, global CSS, primitives (Panel, Button, Marquee, Dialog and others), boot screen, memory-card menu, dither.                                                                                                                                                                                                                                                        |
| `src/lib/`            | Logger. `debug` output is silent unless `localStorage["gst:debug"] = "1"`.                                                                                                                                                                                                                                                                                                |
| `src/test/`           | Test setup for Vitest.                                                                                                                                                                                                                                                                                                                                                    |

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
- Judging is outside the engine. The Feud controller turns typed, spoken or phone text into `slot`,
  `miss` or `review`, and the engine only sees the result.

The event reducer (`src/engines/event/eventReducer.ts`) wraps the game engines. It owns teams,
scores, chips, the play order, which games are done and the running `game` snapshot. Phases:
`setup`, `doors`, `hub`, then `feud` or `wheel` or `speed` or `plinko` or `puzzle`, then `winner`.
`gameInstance` changes when a game ends or is abandoned, so each game's result is credited exactly once.

## 4. Realtime protocol

Each room has one `stage` topic, one `host` topic and eight `phones` topics, one per team. Each
carries Broadcast events, and presence is used for rosters. Every message has the envelope
`{ v: 1, from, sent }`. `v` is the protocol version (1). `from` is fixed per event, so a message that
names the wrong sender is dropped. Payloads are zod validated (`src/realtime/schemas.ts`). Unknown
events, invalid bodies and oversized payloads are dropped and logged. Nothing throws.

Team ids are integers 1 to 8 everywhere.

Which channels each role opens (`src/realtime/roles.ts`, `channelPlan`):

| Role      | Channels                                                    |
| --------- | ----------------------------------------------------------- |
| Stage     | `stage`, `host`, and `phones:1` to `phones:8` (10 channels) |
| Host view | `stage`, `host`                                             |
| Phone     | `stage`, and its own `phones:<team>` once it has a team     |

### Topic `room:<CODE>:stage`: stage to everyone

| Event      | Payload                                                                      | When                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `teams`    | `{ teams: [{ id, name, color }] }`                                           | On connect, when a phone joins, and on team edits                                                                                    |
| `controls` | `{ activeTeam, canBuy, canSpin, canSolve, turnName, buzzTeams?, offLabel? }` | On change, debounced 50 ms (`CONTROLS_DEBOUNCE_MS`). Re-sent on reconnect.                                                           |
| `ack`      | `{ team, pressId, accepted }`                                                | Reply to a press or action                                                                                                           |
| `audience` | `{ phase, paused, scores: [{ team, score }], clock? }`                       | On change, and every 3 s as a heartbeat (`AUDIENCE_HEARTBEAT_MS`). No hidden information. `clock` is in the schema but not sent yet. |

### Topics `room:<CODE>:phones:<TEAM>`: phones to stage

There is one topic per team, 1 to 8. A phone joins and publishes only on its own team's topic.
The stage joins all eight and merges them into one roster. A message whose payload `team` differs
from its topic's team is dropped (`parsePhonesMessage`).

| Event         | Payload                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------- |
| `press`       | `{ pressId, team, at }`                                                                             |
| `action`      | `{ pressId, team, action: 'buy' \| 'spin' \| 'solve' \| 'solve-start' \| 'solve-cancel', answer? }` |
| `feud-answer` | `{ pressId, team, text }`, sent when answers come from phones or both                               |

Presence on each team topic is that team's phones: `{ team, nickname, ua }`.

### Topic `room:<CODE>:host`: stage and host views

| Event      | Direction     | Payload                                                                                                                                            |
| ---------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hello`    | host to stage | `{ hostId }`, every 2 s (`HOST_HELLO_INTERVAL_MS`). A host view shows "Lost contact with the stage" after 6 s of silence (`HOST_LOST_CONTACT_MS`). |
| `snapshot` | stage to host | `{ kind, gameRev, inputLocked, data }`. Sent on change, on `hello`, on reconnect, and the hub snapshot every 2 s (`HUB_REPUBLISH_MS`).             |
| `command`  | host to stage | `{ cmdId, target, gameRev, teamId?, name, args? }`                                                                                                 |
| `result`   | stage to host | `{ cmdId, applied, reason? }`                                                                                                                      |

Presence on the host topic tracks host views. Their payload has `team: 0`.

### Rules the stage enforces

- Every inbound message is re-checked against the engine (P-004). Phone controls are only a display.
- A press is dropped if it comes less than 150 ms after the same team's previous press
  (`PRESS_MIN_INTERVAL_MS`, FR-029), and while the stage is locked (paused or a dialog is open, FR-015).
  The stage answers with `ack`.
- A `command` carries the `gameRev` it was made against. One older than the game's current snapshot is
  refused as `stale`; `undo` is exempt. A `cmdId` already seen is answered again with the same result and
  never applied twice (remembered for 60 s). The same target, name, args and team within 500 ms
  (`COMMAND_REPEAT_WINDOW_MS`) is refused as `duplicate` (FR-017). All of this is in
  `src/host/hostChannel.ts`.
- Payloads stay under 32 KB (`MAX_PAYLOAD_BYTES`). The hosted Realtime limit is 256 KB.
- Reconnection (`SupabaseRoomTransport`): when a channel fails, the whole set is rebuilt after 1 s, 2 s,
  4 s, 8 s and then every 10 s. The auth token is pushed to Realtime as the session refreshes. After a
  reconnect the stage sends its teams, controls, audience and host snapshots again.
- Phones show "Waiting for the game screen" once the stage has been silent for 8 s (`STAGE_SILENCE_MS`),
  and rejoin by themselves.

### Transports

`RoomTransport` is the interface. Two implementations exist:

- `SupabaseRoomTransport`: private channels, authorised by the RLS policies in section 5.
- `MemoryRoomTransport`: in-process, used by tests and demo mode. `BroadcastRoomHub` extends it with a
  `BroadcastChannel('gst-room-hub')` relay, so demo tabs in one browser can reach each other.

The host snapshot is also mirrored over `BroadcastChannel('gst-host')`, so a host view in another tab
of the same browser keeps working when the network is down. The F2 drawer on the stage does not use the
network at all: it reads the stage's own host channel and sends commands to it in process
(`dispatchLocal`), through the same checks as a received command.

## 5. Data model and row level security

Migrations, applied in order: `supabase/migrations/0001_init.sql`, then `0002_director_lease.sql`.
Neither is applied to the hosted project yet (see [DEPLOYMENT.md](DEPLOYMENT.md), section 2).

| Table           | Purpose                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `profiles`      | One row per auth user, including anonymous phone sessions. Created by trigger.                                                                   |
| `events`        | An event owned by one host. `status`: `setup`, `live`, `finished`. Holds the director lease (`director_session`, `director_seen_at`).            |
| `event_state`   | One row per event: `rev` (bigint) and `state` (jsonb), the whole saved session including the running game's engine snapshot. Created by trigger. |
| `host_settings` | Per-host settings: `feud`, `wheel` and `app` as jsonb.                                                                                           |
| `rooms`         | Room code (4 letters, from the 20 consonants `BCDFGHJKLMNPQRSTVWXZ`), its event and its owner. `last_seen_at` drives expiry.                     |
| `room_members`  | Who is in a room: role `stage`, `host` or `phone`, team (1 to 8) for phones, nickname.                                                           |
| `join_attempts` | Failed joins, for rate limiting. No client access at all.                                                                                        |

### Functions (RPCs)

Clients never write `rooms`, `room_members` or `join_attempts` directly. They call these functions.

| Function                                 | Who may call                           | What it does                                                                                                                                                                                                                       |
| ---------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open_room(event_id)`                    | Owner                                  | Returns the event's room code, creating a unique one if needed, and records the caller as the stage. Purges expired rooms first.                                                                                                   |
| `join_room(code, team, nickname)`        | Any signed-in user, anonymous included | Adds a phone to the room on the given team. Returns `{ event_id, teams }`. An unknown or expired code returns `{ error: 'room_not_found' }`. After five failed joins in 10 minutes, further joins raise `rate_limited` (HTTP 429). |
| `join_room_as_host(code)`                | Owner                                  | Adds a host view to the owner's own room.                                                                                                                                                                                          |
| `leave_room()`                           | Signed-in user                         | Removes the caller's phone memberships.                                                                                                                                                                                            |
| `touch_room(code)`                       | Room members                           | Refreshes `last_seen_at`. The stage calls it every 5 minutes.                                                                                                                                                                      |
| `claim_director(event_id, session, ttl)` | Owner                                  | Takes or renews the event's director lease. Returns `{ ok }`, or `{ ok: false, holder_seen_at }` when another stage holds a live lease.                                                                                            |
| `release_director(event_id, session)`    | Owner                                  | Gives the lease back, if this session holds it. Otherwise it does nothing.                                                                                                                                                         |
| `keepalive()`                            | `anon`, `authenticated`                | Returns 1. Called daily by the keep-alive workflow.                                                                                                                                                                                |
| `purge_expired_rooms()`                  | `service_role`, and `open_room`        | Deletes rooms idle for more than 12 hours, and failed-join rows older than an hour.                                                                                                                                                |

All functions set `search_path = ''` and use schema-qualified names.

### RLS summary

- `profiles`: each user reads and writes their own row.
- `events`, `event_state`, `host_settings`: only the owner (`owner_id = auth.uid()`, or the parent
  event's owner for `event_state`).
- `rooms`: the owner reads. Nobody writes directly.
- `room_members`: a user reads their own membership, and the room owner reads the whole roster.
- `join_attempts`: no policy and no grants.
- Grants: the schema revokes everything from the client roles and grants back only what is listed.

Realtime authorisation (`realtime.messages`, with "Allow public access" off). Six policies cover
broadcast and presence. A topic is `room:<CODE>:<kind>` or `room:<CODE>:phones:<TEAM>`, and the policies
read the code, kind and team with `split_part`.

| Topic                    | Read                                    | Write                                                                                        |
| ------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| stage                    | Any member of the room                  | The owner's stage or host sessions (`role` in stage, host, and the user is `rooms.owner_id`) |
| phones (`phones:<TEAM>`) | The owner's sessions, for every team    | A phone member whose `room_members.team` equals the team in the topic name                   |
| host                     | The owner's stage or host sessions only | The owner's stage or host sessions only                                                      |

Why the team is in the topic name: RLS cannot read a message payload, so a phone's team is checked
against its membership row only through the topic it publishes on. A phone therefore cannot press,
act or answer for another team (FR-025, P-004). The stage still checks the `team` field in each
payload against the topic, so the two agree.

The host topic is owner-only because host snapshots carry hidden information. Phones cannot read it.
Phones also cannot publish to the stage topic, so they cannot impersonate the stage.

## 6. Persistence and resume

- The stage saves the whole event after each change. `src/data/persistence.ts` writes 500 ms after the
  last change, and never later than 2 s after the first unsaved change (`DEFAULT_MAX_WAIT_MS`), so a
  fast change stream such as the Wheel's Frenzy clock still reaches the cloud. It flushes at once when
  the page becomes hidden or is closing.
- Each save is a compare-and-set on `event_state.rev`: the update matches `rev = <the revision this tab
last saw>`. If no row matches and the event still exists, another stage has saved first. This stage
  then becomes read-only and says so. Saves are serialised, and failed saves retry with backoff.
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
- The stage's settings (`app`, `feud`, `wheel`) are saved to `host_settings` and cached in
  `localStorage` (`gst:app-settings`, `gst:feud-settings`, `gst:wheel-settings`). When the host view
  saves a setting it sends the stage a `settings-changed` command, and the stage reads the account again.

## 7. Hidden information

Principle P-002: answers, puzzle solutions, the question queue and the sealed envelope never reach
an audience device.

- Each engine has a host selector (`hostView`) and an audience selector (`audienceView`).
  `audienceView` exists for Feud and Wheel. Stage components receive only the audience view.
- The host snapshot is published only on the host topic, which RLS restricts to the owner's
  sessions. Phones are not subscribed to it and cannot read it.
- `audience` events carry only phase, pause state and scores. `controls` carry booleans, a team
  name and fixed labels.
- `src/engines/feud/selectors.test.ts` asserts that the audience view of a Feud state contains no
  unrevealed answer text. The Wheel tests check the audience view, the view model and the rendered
  screen. Every game needs this kind of test before it ships.
- The F2 drawer runs in the stage window, so the host's data is on that screen while the drawer is
  open. Show mode and closing the drawer hide it. The projector shows it only if the drawer is open.

## 8. Demo mode

Demo mode runs the whole app without Supabase. `src/app/env.ts` picks it when any of these is true:

- The build or dev server runs with `--mode demo`.
- The URL has `?demo=1`.
- `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY` is missing.

In demo mode:

- Data comes from `src/data/repositories/memory/` (in-memory). The stage page keeps it in
  `localStorage` under `gst:demo:db`, so a reload keeps events and sign-in. The phone and host pages
  do not write to it; a stale copy written from them would overwrite the stage's events.
- Room traffic uses `MemoryRoomTransport` through `BroadcastRoomHub`, so a demo phone in another tab
  of the same origin reaches the stage.
- The Playwright suite builds and serves in demo mode (`playwright.config.ts`), so CI needs no
  Supabase project.

## 9. Testing layers

| Layer                  | Tool                           | Location                                 | Covers                                                                                                        |
| ---------------------- | ------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Engine rules           | Vitest                         | `src/engines/**/*.test.ts`               | Each rule in the rules documents. Seeded RNG and fixture content.                                             |
| Selectors              | Vitest                         | `src/engines/**/selectors.test.ts`       | Audience view leaks nothing hidden.                                                                           |
| Judging and content    | Vitest                         | `src/judging`, `src/content`             | Answer matching, normalising, content schema and pickers.                                                     |
| Protocol and transport | Vitest                         | `src/realtime/*.test.ts`                 | zod schemas, team topics, memory transport contract, reconnect and backoff.                                   |
| Data                   | Vitest                         | `src/data`                               | Repositories (in-memory and fake Supabase), persistence, debounce and max wait.                               |
| Stage, host and phone  | Vitest, Testing Library, jsdom | `src/**/*.test.tsx`                      | Stage screens and games, host view, phone screens, director lease.                                            |
| Database and RLS       | SQL with pgTAP                 | `supabase/tests/rls.sql`, `director.sql` | Cross-tenant reads denied, team topics, phones cannot write the stage topic, join rate limit, the lease RPCs. |
| End to end             | Playwright (Chromium)          | `e2e/`                                   | Demo-mode flows: event, phones, Feud, Wheel, puzzle, finale, host view, resume, resilience, bundle size.      |
| CI                     | GitHub Actions                 | `.github/workflows/ci.yml`               | `npm run validate` and the Playwright suite. The SQL tests are not in CI.                                     |

There are 128 test files across `src/` (`*.test.ts` and `*.test.tsx`). Run them with `npm test`. Run
the SQL tests with `supabase test db` against a local stack, or with `psql` against a migrated
database (each file explains both). The e2e specs are listed in the [README](../README.md).

## 10. Open items

- The hosted setup: apply both migrations, set the Auth and Realtime settings, create the GitHub remote
  and the Vercel project (see [DEPLOYMENT.md](DEPLOYMENT.md)).
- The known gaps are listed in [CHANGELOG.md](../CHANGELOG.md#known-gaps).
- **Open question Q-001:** the puzzle game's name. "Capsule Clinic" is a working title pending the
  owner's approval. Q-005 (its scoring) is also open. The proposed rules are in use.
