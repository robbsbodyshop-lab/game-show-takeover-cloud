# Changelog

Newest first. Kept by hand, one entry per version. Dates are when the version was cut.

## 2.0.0-alpha.0 - 2026-10-28

First alpha of the cloud rewrite. A Vite and React 19 app, hosted on Vercel, with Supabase for sign-in,
Postgres and Realtime. Not yet used for a live event.

### Added

- Three entry points: the stage (`/`), the host view (`/host`) and the phone (`/play`), each in its
  own lazy-loaded chunk. A dev-only design gallery at `/design`.
- Demo mode with no Supabase: in-memory data and room traffic, with a cross-tab hub so a demo phone in
  another tab reaches the stage. Chosen by `--mode demo`, `?demo=1`, or missing Supabase variables.
- Email sign-in for hosts, with sign-up, password and magic link. Anonymous sign-in for phones.
- Events: create, name teams, edit teams, save and reopen. Each save is a compare-and-set on a revision
  number, and a debounced write flushes when the page hides.
- Stage shell: the 1920 by 1080 scaled stage, a phase router, the hub, the setup screen, the door
  game for play order, a scoreboard, pause, settings, two-tap quit, and a winner screen.
- Room sharing: a four-letter room code from 20 consonants, with a join link and QR code.
- Phone app: join, team picker, buzz screen with optimistic feedback, podium screen, Feud answer box,
  and a silent rejoin after a reload.
- Host view: a second device signed in as the host, a host channel with hello and snapshot messages,
  a console registry, a settings dialog, and an F2 drawer on the stage.
- Realtime layer: a `RoomTransport` interface, a Supabase transport on private channels with
  reconnect and backoff, an in-memory transport, and zod schemas for every message.
- Event engine: teams, doors, hub, tournament bracket, Speed Round, Plinko finale with injected draws,
  and the event reducer that credits game results once.
- Family Feud engine: the main game with face-off, play or pass, strikes, steal, Sudden Death, round
  summary and game won, plus Fast Money. A controller with timing, clock, speech input and saved state.
  Typed-answer judging with normalising, stemming, synonyms and answer matching.
- Wheel of Fortune engine, controller, spin plan and puzzle provider. **In progress.**
- Capsule Clinic puzzle game (working title): a deterministic engine with versus scoring, a canvas
  renderer, sprites, title and setup screens, and synthesised cues.
- Speed Round, Plinko finale and winner screens (components).
- Content: 115 Family Feud surveys and 331 Wheel of Fortune puzzles, validated with zod.
- Persistence: debounced saves to Postgres, a local cache for an instant reload, and a snapshot of the
  running game inside the saved session, so a game resumes mid-round.
- Database migration `0001_init.sql`: profiles, events, event state, host settings, rooms, room
  members, rate-limit records, row level security, six Realtime authorisation policies, and the RPCs
  `open_room`, `join_room`, `join_room_as_host`, `leave_room`, `touch_room`, `keepalive` and
  `purge_expired_rooms`. **Not yet applied to the hosted project.**
- Design system: tokens, global CSS, primitives (Panel, Button, Marquee, Badge, Dialog, Stripes and
  others), boot screen, memory-card menu, ordered dither, and a reduced-motion hook.
- Audio: a cue registry and a Web Audio player, with the existing cues and new puzzle cues from a
  TypeScript script.
- Tooling: Vite, TypeScript strict, ESLint with typescript-eslint, Prettier, Vitest with jsdom and
  Testing Library, and Playwright with a smoke test.
- GitHub Actions: CI (`validate` on every push and pull request, Playwright as a second job) and a
  daily Supabase keep-alive workflow.
- `vercel.json`: single-page rewrite, security headers, and cache headers for assets and audio.
- Documentation: README, ARCHITECTURE, DEPLOYMENT, CONTRIBUTING, this changelog and the pull request
  template.

### Known gaps

- The Family Feud and Wheel of Fortune screens are not registered on the stage yet, so a game shows a
  stub. The Speed Round, Plinko, puzzle and winner screens are not registered either.
- The director lease heartbeat is not written yet. A second stage tab is noticed on its first save.
- The Wheel of Fortune engine is in progress.
- The end-to-end suite has one smoke test.
- Auth, Realtime settings, the database migration and the GitHub and Vercel projects are not set up
  on the hosted side yet. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
- `docs/HOST_GUIDE.md` is not written yet.
- The puzzle game's name (Q-001) and scoring (Q-005) await the owner's decision.
