# Design: Cloud rewrite of Game Show Takeover

> Status: design:draft · Last updated: 2026-10-28
> Implements `requirements.md` (FR/NFR ids referenced inline). Steering: `.ai/steering/*`.

## 1. Approach in one paragraph

A single Vite + React 19 SPA served statically by Vercel, with three entry routes: the stage
(`/`), the host view (`/host`), and the phone (`/play`). Supabase provides identity (email for
hosts, anonymous for phones), Postgres for persistence (events, snapshots, rooms) and
Realtime Broadcast + Presence on private, RLS-authorised channels for the room traffic. Every
game rule lives in a pure TypeScript engine; the stage window is the single authority that
runs the engines, persists snapshots, and publishes a redacted "audience snapshot" to phones
and a full "host snapshot" to host views. The host view sends commands; phones send presses
and podium actions; the stage validates everything.

Alternatives considered (TD-001): Cloudflare Workers + Durable Objects (cheapest at scale,
but no connector and a second platform to learn); a Node WebSocket server on Fly.io (closest
to the old relay, but an always-on process costs money and re-introduces a server to run).
Supabase was chosen because the owner has the account, it is free at this scale, and
Realtime Authorization removes the impersonation hole of a shared room code.

## 2. Requirements mapping

| Area                          | Requirements                  | Design sections |
| ----------------------------- | ----------------------------- | --------------- |
| Accounts, events, persistence | FR-001..007, NFR-006          | 4, 5, 7         |
| Stage, host panel, host view  | FR-010..019, NFR-002          | 3, 6, 8         |
| Rooms and phones              | FR-020..029, NFR-001, NFR-005 | 5, 6            |
| Family Feud                   | FR-030..037                   | 8.1             |
| Wheel of Fortune              | FR-040..045                   | 8.2             |
| Event wrapper                 | FR-050..055                   | 8.3             |
| Puzzle game                   | FR-060..063                   | 8.4             |
| Audio, visuals                | FR-070..071, NFR-007          | 9, 10           |
| Quality, ops                  | NFR-008..010                  | 11, 12          |

## 3. Runtime topology

```
 Projector/TV        Host laptop or tablet         Team phones (up to 8)
 ┌───────────┐       ┌─────────────────┐           ┌──────────┐
 │  STAGE /  │       │  HOST VIEW /host │           │ PHONE    │
 │  engines, │       │  console +       │           │ /play    │
 │  audio,   │       │  stage snapshot  │           │ BUZZ,    │
 │  F2 drawer│       └────────┬────────┘           │ podium   │
 └─────┬─────┘                │                     └────┬─────┘
       │ supabase-js          │                          │ anonymous JWT
       ▼                      ▼                          ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │ Supabase: Auth · Postgres (events, snapshots, rooms, members)   │
 │ Realtime private channels  room:<code>:stage  room:<code>:host  │
 │                            room:<code>:phones:<team 1..8>        │
 └─────────────────────────────────────────────────────────────────┘
       ▲ static files
 ┌─────┴─────┐
 │  Vercel   │  dist/ (SPA fallback, security + cache headers)
 └───────────┘
```

- The **stage** is the only writer of game state. Exactly one stage per event may hold the
  "director" lease (a row lock in `events.director_session`, heartbeat every 10 s); a second
  stage tab becomes read-only with a banner (TD-002). This prevents two stages fighting.
- **Host views** are thin: they render the host snapshot and send commands. Any number may
  connect (FR-018).
- **Phones** render the audience snapshot subset they need (controls, team list) and send
  presses and podium actions.
- Local dev and tests use an **in-memory transport** and an in-memory repository, so the whole
  app runs with `npm run dev -- --mode demo` and no Supabase project.

## 4. Data model (Postgres, schema `public`)

```sql
profiles        (id uuid pk = auth.users.id, display_name text, created_at)
events          (id uuid pk, owner_id uuid -> profiles, name text, status text
                 ['setup','live','finished'], created_at, updated_at,
                 director_session text null, director_seen_at timestamptz null)
event_state     (event_id uuid pk -> events, rev bigint, state jsonb, saved_at)
                 -- the whole EventSession (teams, scores, chips, phase, used ids,
                 -- play order, bracket) plus the running game's engine snapshot
host_settings   (owner_id uuid pk -> profiles, feud jsonb, wheel jsonb, app jsonb)
rooms           (code text pk CHECK (code ~ '^[BCDFGHJKLMNPQRSTVWXZ]{4}$'),
                 event_id uuid unique -> events, owner_id uuid -> profiles,
                 created_at, last_seen_at timestamptz)
room_members    (room_code text -> rooms, user_id uuid -> auth.users,
                 role text ['stage','host','phone'], team int null CHECK 1..8,
                 nickname text null, joined_at, pk (room_code, user_id))
join_attempts   (user_id uuid, attempted_at timestamptz)  -- rate limiting
```

RLS (NFR-006, FR-002, FR-025):

- `profiles`: owner reads/writes own row.
- `events`, `event_state`, `host_settings`: `owner_id = auth.uid()` for all operations.
- `rooms`: owner full access; `anon`/anonymous users read a room only through the
  `join_room(code, team, nickname)` RPC (security definer) which checks the code, the
  rate limit (5 failures / 10 min / user), inserts the membership with role `phone`, and
  returns the team list. `leave_room()` deletes it. Rooms are created by `open_room(event_id)`
  (security definer, owner only) which generates a unique code.
- `room_members`: a member reads rows of rooms it belongs to (so the stage sees the roster);
  only the RPCs write.
- `realtime.messages` policies (private channels; "Allow public access" off):
  - **select** on `room:<code>:stage` for any member of `<code>` (phones, host, stage read).
  - **insert** on `room:<code>:stage` only for members with role in ('stage','host') and
    `user_id = rooms.owner_id` (the stage and host views are the owner's sessions).
  - **insert** on `room:<code>:phones:<team>` (team 1..8): only for role 'phone' members whose
    `room_members.team` equals the topic's team (`split_part(topic, ':', 4)`, checked against
    `^[1-8]$` before the cast, and no fifth part). **select** on any `room:<code>:phones:<n>`
    for the owner's sessions. Presence on these topics is how the stage sees connected phones.
    The team is in the topic name because RLS cannot read the message payload: with a single
    shared phones topic any joined phone could publish `press`/`action`/`feud-answer` with any
    `team` number (review F1). With one topic per team, a phone can only speak for the team
    stored in its own membership row (FR-025, P-004). A phone that changes team calls
    `join_room` again (which updates the row) and reconnects on the new topic.
  - **select/insert** on `room:<code>:host`: owner's sessions only (host snapshot carries
    hidden information, so phones must not be able to read it).
  - `realtime.topic()` is parsed with `split_part(topic, ':', 2)` for the code, `3` for the kind
    and (phones only) `4` for the team.
- `keepalive()` RPC: `select 1`; called daily by a GitHub Actions cron (NFR-010).
- Expiry: a `pg_cron` job (or the same daily Action) deletes rooms with
  `last_seen_at < now() - interval '12 hours'` and their members (FR-028).

## 5. Realtime protocol

All payloads are zod-validated (`realtime/schemas.ts`); unknown or invalid messages are
dropped and logged. Every message carries `{ v: 1, from: 'stage'|'host'|'phone', sent: epochMs }`.

Topic `room:<code>:stage` (stage → everyone):

| event      | payload                                                                      | when                                      |
| ---------- | ---------------------------------------------------------------------------- | ----------------------------------------- |
| `teams`    | `{ teams: [{ id, name, color }] }`                                           | on join, on team edit                     |
| `controls` | `{ activeTeam, canBuy, canSpin, canSolve, turnName, buzzTeams?, offLabel? }` | on every change (debounced 50 ms)         |
| `ack`      | `{ team, pressId, accepted: boolean }`                                       | reply to a press/action                   |
| `audience` | `{ phase, paused, scores: [...], clock?: { endsAt, label } }`                | 1 Hz and on change; small, no hidden info |

Topics `room:<code>:phones:<team>`, one per team 1..8 (phone → stage). A phone joins `stage` and
only its own team's phones topic (and may read it: Realtime requires a read policy to join a private channel, see migration 0003); the stage joins `stage`, `host` and all
eight phones topics (10 channels, far below the 100 per connection limit); host views join
`stage` and `host`.

| event         | payload                                                      |
| ------------- | ------------------------------------------------------------ |
| `press`       | `{ pressId, team, at }`                                      |
| `action`      | `{ pressId, team, action: 'buy'                              | 'spin' | 'solve' | 'solve-start' | 'solve-cancel', answer? }` |
| `feud-answer` | `{ pressId, team, text }` (when "Answers from: phones/both") |

Presence on `room:<code>:phones:<team>`: `{ team, nickname, ua }`, tracked by the phone on its own
team topic; the stage merges the presence of the eight topics into one roster (FR-027).

Team attribution: `RoomTransport` stamps every inbound phones message with `topicTeam`, the team
of the topic it arrived on (`ParsedMessage<'phones'>.topicTeam`), and drops (with a logged
warning) a message whose payload `team` differs from it. The stage (`phoneBridge`) attributes
presses, actions and typed answers to `topicTeam`. `ack` stays on `room:<code>:stage` and carries
`team` + `pressId`, so every phone still sees it. `parseTopic` returns `{ code, kind, team? }`
and `topicFor(code, 'phones', team)` requires the team. The in-memory transports (tests, demo
mode, Playwright) mirror the same split: a phone's messages carry its own team as the topic team.

Topic `room:<code>:host` (stage ↔ host views):

| event      | dir        | payload                                                     |
| ---------- | ---------- | ----------------------------------------------------------- |
| `hello`    | host→stage | `{ hostId }` every 2 s; 6 s silence = "Lost contact" banner |
| `snapshot` | stage→host | `{ kind: 'hub'                                              | 'feud' | 'wheel' | 'puzzle' | ..., gameRev, inputLocked, data }` on change and on hello |
| `command`  | host→stage | `{ cmdId, target: kind, gameRev, teamId?, name, args }`     |
| `result`   | stage→host | `{ cmdId, applied: boolean, reason? }`                      |

Rules: the stage re-validates every inbound message against the engine (P-004); a `command`
is dropped if `gameRev` is stale or `cmdId` repeats within 500 ms (FR-017); presses are
rate-limited to 1 per 150 ms per team (FR-029). Payloads stay under 32 KB (limit 256 KB).

Reconnection: `SupabaseRoomTransport` re-subscribes with exponential backoff (1 s → 10 s) and
refreshes the JWT before it expires. The stage re-publishes `teams`, `controls` and the host
snapshot on every (re)subscribe. Phones show "Waiting for the game screen…" when no `controls`
arrives for 8 s and no stage presence is seen; after 2 minutes they return to the code screen
(FR-026). The host snapshot is also mirrored over `BroadcastChannel('gst-host')` so a host
view in another tab of the same browser works even offline (zero cost).

## 6. Module structure

```
src/app/            main.tsx, routes.ts, providers (Auth, Transport, Repo), ErrorBoundary
src/design/         tokens.css, global.css, primitives: Panel, Button, Marquee, Badge,
                    Stripes, Inset, Label, NumberDisplay, Dialog, MemoryCardMenu, BootScreen
src/engines/event/  eventReducer.ts (EventSession), tournament.ts, doors.ts, plinko.ts
src/engines/feud/   board.ts, feudEngine.ts, fastMoney.ts, selectors.ts, types.ts
src/engines/wheel/  wheels.ts, bonus.ts, puzzleState.ts, boardLayout.ts, letters.ts,
                    wheelEngine.ts, selectors.ts, solve.ts, types.ts
src/engines/puzzle/ puzzleEngine.ts (board, capsule, matching, scoring, versus), types.ts
src/judging/        answerMatching.ts (Feud), normalize.ts
src/games/feud/     FeudController.ts, FeudGame.tsx, FeudBoard, FaceOffPanel, StrikeOverlay,
                    FastMoney*, FeudConsole.tsx, cues.ts, settings.ts
src/games/wheel/    WheelController.ts, WheelGame.tsx, GameWheel, PuzzleBoard, Podiums,
                    BonusRound, WheelConsole.tsx, cues.ts, settings.ts
src/games/puzzle/   PuzzleGame.tsx, PuzzleBoard.tsx, sprites.ts, cues.ts
src/games/speed/    SpeedRound.tsx      src/games/plinko/  PlinkoScreen.tsx
src/stage/          Stage.tsx (1920x1080 scaler), StageApp.tsx (phase router), Setup, Doors,
                    Hub, Scoreboard sidebar, Winner, PauseCard, Director lease
src/host/           HostDrawer.tsx (F2), HostView.tsx (/host), SettingsDialog, hostChannel.ts
src/phone/          PhoneApp.tsx, JoinScreen, TeamPicker, BuzzScreen, PodiumScreen
src/realtime/       RoomTransport.ts (interface), SupabaseRoomTransport.ts,
                    MemoryRoomTransport.ts, schemas.ts, roomCodes.ts
src/data/           supabaseClient.ts, repositories (EventRepo, SettingsRepo, RoomRepo)
                    with Supabase and in-memory implementations, persistence.ts (debounced)
src/audio/          cues.ts (SoundName registry), player.ts (Web Audio), beds.ts
src/content/        family_feud.json, wheel_of_fortune.json, schema.ts (zod), pickers
src/lib/            logger, storage, dom, timers (pausable clock), rng (seeded), ids
supabase/           config.toml, migrations/0001_init.sql ... , seed.sql, tests/*.sql
e2e/                stage-host-phone.spec.ts, feud.spec.ts, wheel.spec.ts, puzzle.spec.ts
```

Dependency rule: `engines/` and `judging/` import nothing from React, Supabase or the DOM.
`games/` import engines and design, never `data/` or `realtime/` directly; they get callbacks.
`stage/` composes everything.

## 7. State ownership and persistence

- `EventSession` (engines/event): teams, scores, chips, phase, availableGames,
  completedGames, usedContentIds, playOrder, bracket, settings snapshot, `gameInstance`, and
  `game: { kind, state } | null` for the running engine. Pure reducer, zod schema, versioned
  (`schemaVersion`), with migrations for future changes.
- The stage dispatches to the event reducer; game controllers dispatch to their engine and
  report `onGameEnd` exactly once (same contract as before: winnerId, points, extraScores,
  bonusChips). The engine snapshot is embedded in the session after every action.
- `persistence.ts` debounces saves at 500 ms and flushes on `visibilitychange`/`pagehide`;
  writes `event_state` with `rev = rev + 1` and a `WHERE rev = :expected` guard; a conflict
  (another stage saved) demotes this tab from director (TD-002). Local `localStorage` keeps
  the last snapshot as a cache so a reload renders instantly before the cloud copy arrives.
- Clocks are stored as `{ endsAt, remainingMsWhenPaused }` so a reload resumes with the right
  time (FR-005); timed audio beds restart with an offset.
- Hidden information lives in engine state but is only exposed through `selectors.hostView()`;
  `selectors.audienceView()` is what stage components receive (FR-014). A unit test asserts
  the audience view contains no unrevealed answer text or puzzle letters.

## 8. Engines

Common contract (P-003): `reduce(state, action): state`, illegal action returns the same
object; `events: PresentationEvent[]` with monotonic `seq` (never rewound by undo); history
of 30 for `UNDO`; randomness injected (`action.draw`), content injected (`PROVIDE_*`).

### 8.1 Family Feud (FR-030..037)

Phases: `pre-game → round-intro → face-off → play-or-pass → control → steal-confer →
steal-answer → round-decided → round-summary → (next round | sudden-death | game-won) →
fast-money → game-over`. Actions: `START_ROUND{survey}`, `BUZZ{team}`, `FACEOFF_ANSWER{slot|miss}`,
`PLAY|PASS`, `ANSWER{slot|miss|repeat}`, `STEAL_ANSWER{slot|miss}`, `REVEAL_NEXT`, `REVEAL_ALL`,
`NEXT_ROUND`, `SET_MULTIPLIER`, `REPLACE_SURVEY`, `FAST_MONEY{sub}`, `SKIP_FAST_MONEY`, `UNDO`.
Judging is outside: `FeudController` turns text (typed, phone, voice) into `slot|miss|review`.
Voice: `listenKey` derived from (phase, answering player, revision); the controller starts a
recognizer session tagged with that key and discards results whose key no longer matches
(FR-034). Setting `answersFrom: 'host'|'phones'|'both'` (FR-035).

### 8.2 Wheel of Fortune (FR-040..045)

Plan of segments built from settings (`buildPlan(settings)`), stages `tossup | frenzy | round |
bonus`, each a sub-reducer; actions `SPIN{draw}`, `CALL_LETTER`, `BUY_VOWEL`, `SOLVE_START`,
`SOLVE{verdict}`, `SOLVE_CANCEL`, `BUZZ`, `PLAY_WILD_CARD`, `MYSTERY{keep|flip, draw}`,
`EXPRESS{play|pass}`, `RING_BELL`, `TIME_OUT`, `LATE_SOLVE`, `HOST_SOLVE_OVERRIDE`,
`SKIP_TURN`, `SET_TURN`, `THROW_OUT_PUZZLE`, `END_ROUND_UNSOLVED`, `ADJUST_BANK`,
`SET_TURN_TIMER`, `PROVIDE_PUZZLES`, `BONUS_*`, `UNDO`. Wheel layout and the Bonus Wheel are
data tables with tests asserting counts and values from the rules doc.

### 8.3 Event wrapper (FR-050..055)

`eventReducer` actions: `SET_TEAMS`, `SET_PLAY_ORDER`, `START_GAME{kind}`, `GAME_ACTION{...}`,
`GAME_WON{...}`, `ABANDON_GAME`, `SCORE_CHANGE`, `CHIP_CHANGE`, `CONTENT_USED{ids}`,
`SPEED_ROUND_RESULT`, `PLINKO_DROP{team, draw}`, `ANNOUNCE_WINNER`, `NEW_EVENT`, `RESET_SCORES`.
Doors: each team picks a door 1..N; the draw maps doors to order; a flourish reveals.
Plinko: a 9-peg-row board, drop column chosen by the team, 50/50 bounces from the draw,
slots worth 100/200/300/500/1000/500/300/200/100 (TD-004, owner may change in Settings).

### 8.4 Puzzle game (FR-060..063; `docs/PUZZLE_GAME_MECHANICS.md`)

Working title **"Capsule Clinic"** (Q-001, owner to approve). Deterministic tick reducer with
the corrected algorithm from the mechanics doc: `tick` does clear → fall → lock → gravity;
rotation checks free space and kicks left/right/up; full-board match scan; `next` preview;
scoring 100 per germ × (1 + cascade index) × speed factor (1/1.5/2); level +1 on clear;
versus garbage per FR-062; top-out ends the round; first to 3 rounds, crown markers.
Rendering is a canvas at 2x pixel scale with an original sprite sheet (capsule halves, three
germ designs that wiggle every 500 ms, clear flash) drawn as SVG-authored pixel art.

## 9. Design system (FR-071, NFR-007)

Tokens in `design/tokens.css` (`--c-gold #FFD23F … --c-ink #0B0620`, same role names as the
old palette so the reused audio and fonts still fit), fonts Press Start 2P / Pixelify Sans /
Silkscreen (digits re-pointed at Silkscreen). SNES layer: flat fills, 3-4 px ink outlines,
two-tone bevels, hard offset shadows, square corners, chasing marquee bulbs, 3 px scanlines,
stepped motion. PS1 layer: a 2-second boot screen (ink → spectrum sweep → logo chime) on the
stage's first load, memory-card style tiled menus for the hub and settings, ordered-dither
gradients (CSS `image-rendering: pixelated` on tiny gradient PNG/SVGs), a "CRT curve" toggle
(subtle barrel vignette via SVG filter), and a flat-shaded "polygon" look for the wheel hub,
Plinko pegs and the puzzle game frame drawn in 2D. Phones use the same tokens at a responsive
layout. Every animation is `steps()` and disabled under `prefers-reduced-motion`.
`docs/DESIGN.md` of the new repo is the reference; `website-design` skills are used to check
contrast and consistency before polish.

## 10. Audio (FR-070)

`audio/cues.ts` registers the reused files under the same cue names; `player.ts` uses one
`AudioContext`, decodes lazily per game, and offers `play(name, {overlap})`, `loop`, `bed(name,
{offset})`, `pause/resume`, `stopAll`. New cues (puzzle game, boot chime, memory-card tick)
are synthesized by a small TypeScript generator script (`scripts/generate-cues.ts`, Web Audio
in Node via `node-web-audio-api` is avoided; instead an offline PCM synth writes WAV, then
`ffmpeg` is optional) — TD-005: ship them as WAV under 50 KB each to avoid an encoder
dependency. The Python generator for the old cues is kept under `scripts/legacy/` for reference.

## 11. Verification strategy (NFR-008)

- Vitest: engines (every rule bullet in the rules docs has a named test), selectors (audience
  view leaks nothing), reducers, pickers and content validation, protocol schemas, transport
  (memory), controllers with fake timers, components with Testing Library.
- SQL tests (`supabase/tests/*.sql`, run with `supabase test db` when Docker is available, else
  via the Supabase MCP `execute_sql` against a branch): RLS denies cross-tenant reads, phones
  cannot insert on the stage topic, a phone on team 2 cannot insert on `:phones:1` but can on
  `:phones:2`, `join_room` rate limit.
- Playwright: one browser context hosts stage + host view + two phone pages on the memory
  transport (`?demo=1`): join, buzz, Feud face-off to round win, Wheel spin-letter-solve,
  pause/resume with clock, reload mid-round restores, host command from the host view.
- CI (GitHub Actions): `npm ci`, `npm run validate`, `npm run e2e`, upload `dist`.
- Manual before an event: the host guide's checklist (reduced from the old one).

## 12. Deployment and operations (NFR-010)

- Supabase project `game-show-takeover` in org `robbsbodyshop-lab's Org`, region us-east-1
  (closest to the Vercel default region). Migrations applied via Supabase MCP during build-out,
  then via CLI in CI (`supabase db push` with a service token stored as a repo secret).
- Vercel project `game-show-takeover-cloud` linked to the GitHub repo; env vars
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (anon/publishable key is public by design).
  `vercel.json`: SPA rewrite, security headers, immutable asset caching.
- Auth config: email confirmations on, anonymous sign-ins on, site URL = Vercel domain,
  redirect URLs include preview deployments.
- Keep-alive: `.github/workflows/keepalive.yml` daily `curl` to the `keepalive` RPC with the
  publishable key; README documents the 7-day pause rule and the Pro upgrade.
- Observability: Supabase Realtime/Auth reports; client `logger` with `gst:debug`.

## 13. Edge cases

- Two stage tabs: director lease; the loser shows "Another stage is running this event".
- Host view opened before the stage: shows "Looking for the stage…" and waits.
- Phone joins before teams exist: team picker shows "Host is still setting up".
- Team count changes after phones joined: phones on a removed team are sent back to the picker.
- Stage offline mid-round: the engine state is already saved; on reload the controller
  recomputes clocks from `endsAt` and re-publishes controls.
- JWT expiry on a 4-hour event: supabase-js refreshes; the transport re-sends the token.
- Browser without Web Speech with voice on: setting shows "Not available in this browser",
  falls back to typing.
- Quota exceeded (`too_many_connections`): banner on the stage with the count; phones queue.

## 14. Risks and mitigations

| Risk                                                     | Mitigation                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Free project paused before an event                      | daily keep-alive; README + in-app banner if the API is unreachable; Pro upgrade documented              |
| Realtime latency spikes on mobile data                   | optimistic "BUZZED (waiting)" state on the phone; stage orders by `at` timestamp within a 150 ms window |
| RLS policy complexity slows channel joins                | policies are single `exists` lookups on indexed `room_members`                                          |
| Vite 8 / plugin-react 6 incompatibility at scaffold time | fall back to Vite 7 line; pin exact versions                                                            |
| Scope: two full engines plus a puzzle game               | build order in `tasks.md` delivers a playable Feud with phones first                                    |

## 15. Technical decisions

| ID     | Decision                                                  | Why                                               |
| ------ | --------------------------------------------------------- | ------------------------------------------------- |
| TD-001 | Supabase Realtime over a custom WebSocket server          | no server to run; RLS-authorised private channels |
| TD-002 | Director lease for the stage; host views are thin clients | one authority, no state merge                     |
| TD-003 | Engine snapshot embedded in the saved session             | mid-game resume (FR-005)                          |
| TD-004 | Plinko and doors as pure reducers with injected draws     | testable, replayable                              |
| TD-005 | New cues as small WAV files from a TypeScript synth       | no native encoder dependency                      |
| TD-006 | Plain CSS tokens + CSS Modules, no Tailwind               | bespoke pixel system; smaller phone bundle        |
| TD-007 | Own 4-route router                                        | three entry points; no dependency                 |
| TD-008 | zod at every boundary (content, saves, messages)          | invalid data can never crash a live show          |

## 16. Implementation FAQ

- _Where do I add a host control?_ Engine action → selector exposure → console button →
  command name in `hostChannel.ts` → stage handler; add a test for the illegal case.
- _How do I show something to phones?_ Extend `controls` in `realtime/schemas.ts`; the stage
  computes it in the game controller's `phoneControls()` selector.
- _How do I run without Supabase?_ `npm run dev -- --mode demo` uses the memory transport
  and repository; `/play?demo=1&room=DMKT` opens a demo phone in another tab.
