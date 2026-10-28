# Tasks: Cloud rewrite of Game Show Takeover

> Status: tasks:draft · Last updated: 2026-10-28 · Design: `design.md`
> Each task: owner agent, requirement coverage, dependencies, acceptance, files, verification.
> Verification for every task: the task's tests pass and `npm run validate` is green.

## Slice 0 — Foundation

- **T1 Scaffold and tooling** (enabling; NFR-008) — Vite + React 19 + TS strict, ESLint flat,
  Prettier, Vitest + jsdom + Testing Library, Playwright, `npm run validate`, GitHub Actions
  CI, `vercel.json`, `.nvmrc`, `.editorconfig`, README skeleton, LICENSE. Content JSON and
  audio copied in. _Accept:_ `npm run validate` passes on an empty app; CI file lints.
- **T2 Design system** (FR-071, NFR-007) — `tokens.css`, `global.css`, primitives (Panel,
  Button, Marquee, Badge, Stripes, Inset, Label, NumberDisplay, Dialog, MemoryCardMenu,
  BootScreen), `Stage` 1920x1080 scaler, scanline/CRT layers, reduced-motion. `docs/DESIGN.md`.
  _Accept:_ a storybook-like `/design` dev route renders every primitive; contrast checked.
- **T3 Content module** (FR-055) — zod schemas for both JSON files, pickers (round-size
  preferences, no-repeat, Frenzy category rule, Bonus categories), `validateContent()`.
  _Accept:_ tests assert counts (115/79/331) and every rule in `docs/reference/CONTENT_SCHEMA_V1.md`.
- **T4 Audio module** (FR-070) — cue registry from `docs/reference/AUDIO_CUES_V1.md`,
  Web Audio player (overlap, loop, timed beds, pause/resume, stopAll). _Accept:_ unit tests
  with a fake AudioContext; a missing file never throws.
- **T5 Realtime transport** (FR-020..029 protocol) — `RoomTransport` interface, zod
  `schemas.ts`, `MemoryRoomTransport` (multi-client in one process), `SupabaseRoomTransport`
  (private channels, presence, reconnect, token refresh), `roomCodes.ts`. _Accept:_ protocol
  tests on the memory transport; a contract test runs the same suite against both.
- **T6 Data layer and Supabase migrations** (FR-001..007, NFR-006) — `0001_init.sql`
  (tables, RLS, RPCs `open_room`, `join_room`, `leave_room`, `keepalive`, realtime.messages
  policies), repositories (Supabase + memory), `persistence.ts` (debounce, rev guard,
  localStorage cache), auth provider (email/magic link, anonymous). _Accept:_ SQL RLS tests;
  repository contract tests on memory impl.

## Slice 1 — Event shell (playable hub with phones)

- **T7 Event engine** (FR-003..006, FR-050..055, FR-037/045 crediting) — `eventReducer`,
  `tournament.ts`, `doors.ts`, `plinko.ts`, schema + migrations of `EventSession`.
  _Accept:_ reducer tests for every action, bracket for 3-8 teams, GAME_WON idempotence.
- **T8 Auth and events UI** (FR-001, FR-002, FR-006, FR-007) — sign up/in screens, event
  list, create event, resume/new. _Accept:_ component tests; e2e sign-in on memory repo.
- **T9 Setup, doors, hub, scoreboard, pause, show mode** (FR-010..012, FR-015, FR-019,
  FR-050, FR-051) — stage phase router, Setup (teams, QR, room code, roster), DoorSelection,
  Hub with memory-card menu, sidebar Scoreboard, PauseCard (F8), show mode (F9), two-tap quit,
  director lease. _Accept:_ e2e: create event → doors → hub; pause freezes a fake clock.
- **T10 Phone app** (FR-021..024, FR-026, FR-028) — `/play`: join by code (QR link), team
  picker, BUZZ screen with states, podium screen, waiting/offline/room-not-found states,
  persistence of room/team. _Accept:_ e2e: two phones join, buzz, see ack and off-labels.
- **T11 Host panel and host view** (FR-012, FR-013, FR-017, FR-018) — F2 drawer, `/host`
  view, `hostChannel.ts` (Supabase topic + BroadcastChannel mirror), hello/snapshot/command
  with stamps, Lost-contact banner, Settings dialog (music, show mode, CRT curve, voice,
  answers-from, game settings). _Accept:_ e2e: host view sends pause/resume and a buzz.

## Slice 2 — Family Feud

- **T12 Feud engine** (FR-030, FR-032) — `board.ts`, `feudEngine.ts`, selectors incl.
  audience/host views and `gameEndReport`. _Accept:_ a test per rule bullet in
  `docs/FAMILY_FEUD_RULES.md` §Main game; illegal actions return same state; undo bounded.
- **T13 Fast Money engine** (FR-031) — `fastMoney.ts` + tests per rule bullet §Fast Money.
- **T14 Answer matching** (FR-033) — normalisation, aliases, plural/tense stems, synonyms,
  accept/review/miss. _Accept:_ table-driven tests incl. the "alias must not stand for two
  answers" guard.
- **T15 Feud controller + UI** (FR-034..037, FR-014, FR-016) — `FeudController` (timers,
  cues, voice listenKey, answersFrom, host commands, phone controls), `FeudGame.tsx`, board,
  face-off, strikes, steal, round summary, bracket screen, game-over card, cues wiring.
  _Accept:_ controller tests with fake timers; audience-view leak test; e2e full round.
- **T16 Feud console** (FR-036) — stage drawer + host view console: board with answers,
  stake lines, clocks, rulings, replace survey, multiplier, skip FM (two taps), duplicate
  buzzer, question browser. _Accept:_ component tests; e2e ruling from host view.

## Slice 3 — Wheel of Fortune

- **T17 Wheel data + puzzle board** (FR-040, FR-042) — `wheels.ts`, `bonus.ts`,
  `boardLayout.ts`, `puzzleState.ts`, `letters.ts`. _Accept:_ wedge counts/values, 12/14/14/12
  fitting tests.
- **T18 Wheel engine** (FR-040, FR-044, FR-045) — plan builder, stage reducers, host tools,
  selectors. _Accept:_ a test per rule bullet in `docs/WHEEL_OF_FORTUNE_RULES.md`.
- **T19 Solve judging** (FR-041) — word-for-word matcher with lead-ins → correct/close/wrong.
- **T20 Wheel controller + UI** (FR-042..045) — spin animation with deterministic draw and
  peg ticks, puzzle board lighting, podiums, toss-up reveals, Mystery/Express/Wild Card
  dialogs, Bonus Round with envelope, Speed-Up, phone podium controls, cues. _Accept:_
  controller tests; e2e spin → letter → solve; audience leak test.
- **T21 Wheel console** (FR-043) — puzzle, legal actions, next puzzle, host tools, live
  turn timer, Wheel pause menu. _Accept:_ component tests; e2e throw-out puzzle from host view.

## Slice 4 — Finale games and puzzle game

- **T22 Speed Round, Plinko, Winner** (FR-052..054) — screens on the event engine; music bed
  pause; Plinko animation from draws. _Accept:_ e2e: award speed points, drop chips, announce.
- **T23 Puzzle engine** (FR-061, FR-062) — deterministic tick reducer per
  `docs/PUZZLE_GAME_MECHANICS.md` with corrections; scoring; versus garbage. _Accept:_ tests
  for rotation kicks, full-board matching incl. last row/column, split halves, cascades,
  top-out, versus rounds; replay from a seed is bit-identical.
- **T24 Puzzle game UI + assets** (FR-060, FR-063) — canvas renderer, original sprite sheet,
  title/level/speed memory-card menus, 1P/2P, pause, new WAV cues via `scripts/generate-cues.ts`.
  _Accept:_ e2e start a 1P game and clear a germ; assets contain no Nintendo names.

## Slice 5 — Hardening, docs, deployment

- **T25 End-to-end suite and resilience** (FR-005, FR-026, NFR-001..005) — reload mid-round
  restores clocks; stage offline → phones wait → reconnect; stale command dropped; bundle
  size budget check in CI. _Accept:_ all e2e green; `size-limit` under budgets.
- **T26 Docs** (NFR-010) — README, `docs/HOST_GUIDE.md` (from the inventory, minus hardware),
  `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md` (Supabase, Vercel, env, keep-alive, pause risk,
  Pro path), `docs/DESIGN.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, PR template.
- **T27 Provision and deploy** (NFR-010) — Supabase project + migrations + auth settings;
  Vercel project linked to the GitHub repo, env vars, preview deploys; keep-alive workflow;
  smoke test on the deployed URL with a real phone flow. _Accept:_ production URL serves the
  stage; a phone on mobile data joins and buzzes.
- **T28 Independent review** — `sdd-kit:reviewer` against requirements/design; findings fixed
  or logged; `review.md`; `sdd-brief.md`.

## Dependencies

T1 → T2..T6 (parallel) → T7 → T8, T9, T10, T11 (parallel) → T12..T16 → T17..T21 → T22..T24
→ T25..T28. Slices 2 and 3 can run in parallel once Slice 1 is done. Puzzle engine (T23)
depends only on T1.

## Readiness check

- Every Must requirement has a task: FR-001..007 (T6, T8), FR-010..019 (T2, T9, T11),
  FR-020..029 (T5, T6, T10), FR-030..037 (T12..T16), FR-040..045 (T17..T21), FR-050..055
  (T7, T9, T22, T3), FR-060..063 (T23, T24), FR-070..071 (T4, T2), NFRs (T1, T25..T28).
- Open questions Q-001 (puzzle name) and Q-005 (puzzle scoring) are Should-level and do not
  block; working title and proposed rules are used until the owner answers.
