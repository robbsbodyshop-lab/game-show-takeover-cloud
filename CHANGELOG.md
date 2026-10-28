# Changelog

Newest first. Kept by hand, one entry per version. Dates are when the version was cut.

## 2.0.0-alpha.0 - 2026-10-28

First alpha of the cloud rewrite. A Vite and React 19 app, hosted on Vercel, with Supabase for sign-in,
Postgres and Realtime. Built and tested locally. Not deployed yet and not used for a live event.

### Added

- Three pages, each its own chunk: the stage (`/`, `index.html`), the host view (`/host`, `host.html`)
  and the phone (`/play`, `play.html`). A dev-only design gallery at `/design`.
- Demo mode with no Supabase: in-memory data, kept in `localStorage` (`gst:demo:db`), with a cross-tab
  hub so a demo phone in another tab reaches the stage. Chosen by `--mode demo`, `?demo=1`, or missing
  Supabase variables.
- Sign-in: email and password, magic link and sign-up for hosts; anonymous sign-in for phones.
- Events: create, name and colour 2 to 8 teams, edit teams, Resume or Start a new event, and a read-only
  view of a finished event.
- Stage shell: the 1920 by 1080 scaled stage, a phase router, the hub, the Setup screen, the door game
  for play order, a scoreboard sidebar (with the room code, join address and a QR code), pause, show
  mode, settings, two-tap quit and abandon, and the F2 host drawer.
- Family Feud, registered on the stage: the main game (face-off, play or pass, strikes, steal, Sudden
  Death, round summary, game won), a bracket for three or more teams, Fast Money, host review of near
  misses, a question bank browser, and typed, spoken and phone answers.
- Wheel of Fortune, registered on the stage: Classic and Fortune Frenzy openings, rounds 1 to 4, the
  Triple Toss-Up, the Speed-Up, the Bonus Round with its wheel, a host console, and a turn timer.
- Speed Round, Final Plinko, the winner screen and Capsule Clinic (a puzzle game, working title: one
  or two players, versus first to three rounds), all registered on the stage.
- Settings: stage and host view settings in the `app` group of `host_settings` (music, volume, show
  mode, CRT curve, voice, answers from, verbose logging). Next-game settings for Family Feud and Wheel of
  Fortune in the `feud` and `wheel` groups, shown in the stage Settings, the F2 drawer and the host view.
  A change in the host view reaches the stage at once.
- Host view: a second device signed in as the host. It receives the stage snapshot, sends commands
  (checked for staleness and repeats on the stage), and works from a same-browser mirror if the network
  drops.
- Room sharing: a four-letter room code from 20 consonants, a join link and a QR code, on Setup and in the
  sidebar.
- Per-team phone topics (`room:<code>:phones:<team>`). Row level security checks that a phone publishes
  only on its own team's topic, so a phone cannot press, act or answer for another team.
- Director lease: one stage tab per event writes game state. A heartbeat every 10 s and a 30 s lease;
  a second stage tab is read-only.
- Audience heartbeat every 3 s, so a phone does not think the stage has left. A phone that hears nothing
  for 8 s shows "Waiting for the game screen".
- Persistence: a 500 ms debounced save with a 2 s maximum wait, so a fast change stream still reaches
  the cloud. Each save is a compare-and-set on the revision. The page flushes on hide, and a local cache
  gives an instant reload. The running game's engine snapshot is saved inside the session, so a game
  resumes mid-round.
- Realtime layer: a `RoomTransport` interface, a Supabase transport on private channels with reconnect
  and backoff (1, 2, 4, 8 s, then every 10 s), an in-memory transport, and zod schemas for every message.
  After a reconnect the stage sends its teams, controls, audience and host snapshot again.
- Event engine: teams, doors, hub, tournament bracket, Speed Round, Plinko finale with injected draws,
  and an event reducer that credits each game result once.
- Engines: the Family Feud main game and Fast Money; the Wheel of Fortune engine, spin plan and puzzle
  provider; the Capsule Clinic engine (deterministic, with scoring and versus garbage). All are pure
  reducers with injected randomness and content.
- Content: 115 Family Feud surveys with a Fast Money list, and 331 Wheel of Fortune puzzles, validated
  with zod.
- Database migrations, in order: `0001_init.sql` (profiles, events, event state, host settings, rooms,
  room members, join attempts, row level security, six Realtime authorisation policies, and the RPCs
  `open_room`, `join_room`, `join_room_as_host`, `leave_room`, `touch_room`, `keepalive` and
  `purge_expired_rooms`) and `0002_director_lease.sql` (`claim_director` and `release_director`).
  **Neither is applied to the hosted project yet.**
- Design system: tokens, global CSS, primitives (Panel, Button, Marquee, Badge, Dialog, Stripes and
  others), boot screen, memory-card menu, ordered dither, and a reduced-motion hook.
- Audio: a cue registry and a Web Audio player, with the existing cues and new puzzle cues from a
  TypeScript script.
- Tests: 128 Vitest test files (unit, component and contract tests, jsdom). SQL tests for row level
  security and the director lease in `supabase/tests/`. A Playwright suite of 12 spec files in `e2e/`
  (16 tests) that runs in demo mode.
- Tooling: Vite, TypeScript strict, ESLint with typescript-eslint, Prettier, Vitest and Playwright.
- GitHub Actions: CI (`validate` on pushes to `main` and on pull requests, Playwright as a second job)
  and a daily Supabase keep-alive workflow.
- `vercel.json`: page rewrites for `/play` and `/host`, a single-page fallback, security headers, and cache
  headers for assets and audio.
- Documentation: README, the host guide (`docs/HOST_GUIDE.md`), ARCHITECTURE, DEPLOYMENT, CONTRIBUTING,
  this changelog and the pull request template.

### Known gaps

Hosted side, not done yet:

- The two migrations are not applied to the Supabase project. Until `0002_director_lease.sql` is applied,
  a stage shows no room code.
- The Auth and Realtime settings ("Allow public access" off, anonymous sign-ins on, Site URL), the GitHub
  remote, the Vercel project and the keep-alive secrets are not set. The keep-alive workflow has never run
  against the project. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), section 0.
- The SQL tests (`supabase/tests/`) are not run in CI. Run them by hand.

Behaviour that is weaker than the requirements say:

- Anonymous sessions can create events and save a state of any size. The 1 MB budget is not enforced.
- Expired rooms are removed only when a host opens a room or the optional cron job runs. Phones that
  joined an expired room keep read access to its stage topic until then.
- The wrong-code limit is per anonymous session, so a new session resets it. The press limit is per team
  on the stage; the per-phone limit exists only in the phone's own code.
- A save whose response is lost can look like a second stage, which makes the stage read-only (the
  dropped-connection case).
- Some audience text is still under 18 px: the hub tile titles are 16 px.
- The Speed Round challenge text is not saved across a refresh, and the Speed Round's host extras
  (+/-5 s, reset, participant picker) are not modelled.
- The stage does not show the banner for the Realtime connection limit that the design asks for.
- The audience `clock` field is not sent yet. The latency targets (press to stage 300 ms p95, snapshot to
  host 500 ms p95) are not measured, and there is no timing instrumentation.
- Only Chromium is tested end to end. There is no iOS Safari or Android Chrome checklist. The bundle-size
  spec measures the demo build; the Supabase build was measured by hand (phone 147.0 KB gzipped against a
  150 KB budget).
- Settings flow one way only. A change on the stage does not reach an open host view until the host view
  is reopened, and a save from the host view writes its whole settings copy back, so the last save wins.

Open decisions for the owner:

- The puzzle game's name (Q-001, "Capsule Clinic" is the working title) and scoring (Q-005). The rest
  are in `.ai/sdd/specs/001-cloud-rewrite/owner-questions.md`.
- The licence. No licence has been chosen, so the code is not licensed for reuse.
