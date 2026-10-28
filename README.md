# Game Show Takeover

A live, host-run team game show played in the browser and hosted in the cloud. One screen (a
projector or TV) shows the stage. The host runs the show from a host panel on a laptop or a second
device. Teams play from their phones after scanning a QR code. Nothing is installed, and no PC acts
as a server.

The show has Family Feud and Wheel of Fortune episodes (with a Wheel Bonus Round), a Speed Round, a
Plinko finale, and an original falling-block puzzle game (working title "Capsule Clinic"). The look
is a 16-bit game-show cartridge with a first-generation PlayStation menu layer.

> **Screenshots:** none yet. When they are added, they go in `docs/screenshots/`.

**Status: 2.0.0-alpha.0.** Every game and finale screen is registered on the stage, and the
per-team phone topics, the director lease and the settings are in place. The app is built and tested
locally, but it is not deployed: the two Supabase migrations are not applied to the hosted project,
and there is no GitHub remote or Vercel project yet. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md),
section 0, for the setup state, and [CHANGELOG.md](CHANGELOG.md) for the known gaps.

## What is in the app

- **Stage (`/`).** Sign in by email, create events, name and colour 2 to 8 teams, pick the play order
  at the door game, then play from the hub: Family Feud (a bracket for three or more teams, with
  Fast Money), Wheel of Fortune (Classic or Fortune Frenzy, Speed-Up, Bonus Round), the Speed Round,
  Final Plinko, Capsule Clinic and the winner screen. Settings, pause, show mode and an F2 host drawer.
- **Host view (`/host`).** A second device signed in to the same account. It mirrors the stage, sends
  the host's commands and holds the answer and voice settings.
- **Phones (`/play`).** Anonymous. Join with a four-letter room code or the QR code, pick a team,
  buzz, type Family Feud answers when the host allows it, and use the Wheel and podium controls.
- **Saving.** Each event is saved to Postgres after a short pause, with a two-second ceiling, and a
  local cache makes a reload instant. A game in progress resumes at the same question or puzzle.
- **One stage per event.** A director lease lets only one stage tab write an event; a second stage
  tab is read-only until the first one lets go.
- **Demo mode.** With no Supabase configured, the whole app runs in memory in one browser, with a
  cross-tab hub so a phone in a second tab reaches the stage.

## Quick start (demo mode needs nothing)

You need Node 22 (see `.nvmrc`) and npm.

```bash
npm install
npm run dev        # http://localhost:3000
```

With no Supabase variables set, the app runs in **demo mode**: in-memory data, no network and no
account. Demo data is kept in this browser's `localStorage` (`gst:demo:db`), so a reload keeps it.
Demo mode is also chosen by `npm run dev -- --mode demo` or by adding `?demo=1` to a URL. To try a
phone, open the stage, read the room code on its join panel, then open
`http://localhost:3000/play?demo=1&room=<CODE>` in a second tab of the same browser.

To run against a real Supabase project, copy `.env.example` to `.env.local` and fill in
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The publishable key is public by design;
row level security protects the data. Never put a secret or service-role key in a `VITE_` variable.
Apply both migrations in `supabase/migrations/` in order (see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), section 2).

## Scripts

| Script                 | What it does                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm run dev`          | Vite dev server on port 3000. Demo mode when the Supabase variables are absent.                           |
| `npm run build`        | Production build to `dist/`.                                                                              |
| `npm run preview`      | Serves `dist/` on port 4173.                                                                              |
| `npm run typecheck`    | `tsc --noEmit` with strict settings.                                                                      |
| `npm run lint`         | ESLint flat config with typescript-eslint (strict, type-checked) and react-hooks.                         |
| `npm run format`       | Prettier, write mode.                                                                                     |
| `npm run format:check` | Prettier, check mode.                                                                                     |
| `npm test`             | Vitest unit and component tests (jsdom).                                                                  |
| `npm run test:watch`   | Vitest in watch mode.                                                                                     |
| `npm run e2e`          | Playwright on Chromium. Builds and serves demo mode on port 4173.                                         |
| `npm run validate`     | Typecheck, lint, format check, unit tests and build. CI runs it on pushes to `main` and on pull requests. |

Other tools: `node --experimental-strip-types scripts/generate-puzzle-cues.ts` regenerates the
puzzle game's WAV cues in `public/audio/puzzle/`. It needs no install.

## End-to-end suite

The Playwright specs in `e2e/` run in demo mode. `npm run e2e` builds and serves the app itself.

| Spec                   | What it covers                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `smoke.spec.ts`        | The stage loads.                                                                            |
| `event-flow.spec.ts`   | Sign in, create an event, set up the teams, start, and use the host keys.                   |
| `phone-join.spec.ts`   | A phone joins by code, shows on the roster, rejoins after a reload and changes room.        |
| `feud-faceoff.spec.ts` | A Family Feud face-off: buzz, wrong answer, strike, the other team, undo.                   |
| `resume.spec.ts`       | Reopening an event mid face-off, and reloading the stage, both offer Resume.                |
| `host-view.spec.ts`    | The host view mirrors the hub, pauses and resumes the stage, and buzzes with key 1.         |
| `resilience.spec.ts`   | A stale host command is refused; a second stage tab for an event is read-only.              |
| `wheel-round.spec.ts`  | Round 1 of Wheel: spin, call a letter, a wrong solve, End unsolved; the phone at the wheel. |
| `wheel-bonus.spec.ts`  | Wheel through to the Bonus Round, the envelope, the winner and the chip on the hub.         |
| `puzzle.spec.ts`       | Capsule Clinic, 1 Player: the canvas draws, pause, resume, quit and back to the hub.        |
| `finale.spec.ts`       | Speed Round, Final Plinko and Announce the Winner.                                          |
| `bundle-size.spec.ts`  | First-load gzipped JavaScript: phone under 150 KB, stage under 600 KB (demo build).         |

`e2e/helpers.ts` and `e2e/wheel-helpers.ts` hold shared setup code.

## Project layout

| Path                 | Contents                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/`               | Application code: engines, games, stage, host, phone, realtime, data, design system.                               |
| `supabase/`          | Migrations (`migrations/`: 0001_init, 0002_director_lease), local CLI config, SQL tests (`tests/`: rls, director). |
| `e2e/`               | Playwright specs (see the table above).                                                                            |
| `docs/`              | Rules of record, design system, architecture, deployment, host guide.                                              |
| `.ai/`               | Spec-driven planning: steering, requirements, design, tasks and review.                                            |
| `public/`            | Audio cues, puzzle sprite sheet, favicon.                                                                          |
| `scripts/`           | Build-time generators. `scripts/legacy/` is reference only and is not used.                                        |
| `.github/workflows/` | CI (`ci.yml`) and the Supabase keep-alive (`keepalive.yml`).                                                       |
| `vercel.json`        | Vercel build settings, page rewrites, security and cache headers.                                                  |

## Documentation

- [docs/HOST_GUIDE.md](docs/HOST_GUIDE.md): how to run a show, screen by screen, with the keys and
  the settings.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): topology, module map, engine contract, realtime
  protocol, data model and RLS, persistence, demo mode, test layers.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): Supabase, GitHub and Vercel setup, verification and
  operations (pause risk, keep-alive, upgrade path, keys).
- [docs/DESIGN.md](docs/DESIGN.md): the visual system and the rules for keeping screens on model.
- [docs/FAMILY_FEUD_RULES.md](docs/FAMILY_FEUD_RULES.md),
  [docs/WHEEL_OF_FORTUNE_RULES.md](docs/WHEEL_OF_FORTUNE_RULES.md),
  [docs/PUZZLE_GAME_MECHANICS.md](docs/PUZZLE_GAME_MECHANICS.md): rules of record for the engines.
- [docs/reference/](docs/reference/): content schema, audio cue list, host feature inventory.
- [CONTRIBUTING.md](CONTRIBUTING.md): how to work on the code and open a pull request.
- [CHANGELOG.md](CHANGELOG.md): what the release contains, and its known gaps.

## Known gaps

The full list is in [CHANGELOG.md](CHANGELOG.md#known-gaps) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md),
section 10. The short version:

- The hosted side is not set up: the migrations, the Auth and Realtime settings, the GitHub remote,
  the Vercel project and the keep-alive secrets.
- The puzzle game's name ("Capsule Clinic") and scoring await the owner's approval. The open owner
  questions are in `.ai/sdd/specs/001-cloud-rewrite/owner-questions.md`.

## Licence

No licence has been chosen yet. `package.json` is marked `UNLICENSED`, so the code is not
licensed for reuse. The owner decides the licence. The audio, art, survey and puzzle content is
original (principle P-005): it contains no real show's music, logos, surveys or puzzles. The
bundled fonts (Press Start 2P, Pixelify Sans, Silkscreen) are licensed under the SIL Open Font
License.
