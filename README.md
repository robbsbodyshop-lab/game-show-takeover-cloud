# Game Show Takeover

A live, host-run team game show played in the browser and hosted in the cloud. One screen (a
projector or TV) shows the stage. The host runs the show from a host panel on a laptop or a second
device. Teams play from their phones after scanning a QR code. Nothing is installed, and no PC acts
as a server.

The show has Family Feud and Wheel of Fortune episodes, a Speed Round, a Plinko finale, and an
original falling-block puzzle game (working title "Capsule Clinic"). The look is a 16-bit game-show
cartridge with a first-generation PlayStation menu layer.

> **Screenshots:** placeholder. Stage, host view and phone screenshots go in `docs/screenshots/`
> once the game screens are wired in (see the status list below).

**Status: 2.0.0-alpha.0, rewrite in progress.** The event flow, phones, host view, engines and
persistence exist. The Family Feud and Wheel of Fortune screens are not yet connected to the stage.
The full list is in [CHANGELOG.md](CHANGELOG.md).

## Quick start (demo mode needs nothing)

You need Node 22 (see `.nvmrc`) and npm.

```bash
npm install
npm run dev        # http://localhost:3000
```

With no Supabase variables set, the app runs in **demo mode**: in-memory data, no network and no
account. Demo mode is also chosen by `npm run dev -- --mode demo` or by adding `?demo=1` to a URL.
To try a phone, open the stage, read the room code on its join panel, then open
`http://localhost:3000/play?demo=1&room=<CODE>` in a second tab of the same browser.

To run against a real Supabase project, copy `.env.example` to `.env.local` and fill in
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The publishable key is public by design;
row level security protects the data. Never put a secret or service-role key in a `VITE_` variable.
The full setup is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Scripts

| Script                 | What it does                                                                      |
| ---------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`          | Vite dev server on port 3000. Demo mode when the Supabase variables are absent.   |
| `npm run build`        | Production build to `dist/`.                                                      |
| `npm run preview`      | Serves `dist/` on port 4173.                                                      |
| `npm run typecheck`    | `tsc --noEmit` with strict settings.                                              |
| `npm run lint`         | ESLint flat config with typescript-eslint (strict, type-checked) and react-hooks. |
| `npm run format`       | Prettier, write mode.                                                             |
| `npm run format:check` | Prettier, check mode.                                                             |
| `npm test`             | Vitest unit and component tests (jsdom).                                          |
| `npm run test:watch`   | Vitest in watch mode.                                                             |
| `npm run e2e`          | Playwright on Chromium. Builds and serves demo mode on port 4173.                 |
| `npm run validate`     | Typecheck, lint, format check, unit tests and build. CI runs this on every push.  |

Other tools: `node --experimental-strip-types scripts/generate-puzzle-cues.ts` regenerates the
puzzle game's WAV cues in `public/audio/puzzle/`. It needs no install.

## Project layout

| Path                 | Contents                                                                             |
| -------------------- | ------------------------------------------------------------------------------------ |
| `src/`               | Application code: engines, games, stage, host, phone, realtime, data, design system. |
| `supabase/`          | Migrations (`migrations/`), local CLI config, SQL tests (`tests/rls.sql`).           |
| `e2e/`               | Playwright specs.                                                                    |
| `docs/`              | Rules of record, design system, architecture, deployment.                            |
| `.ai/`               | Spec-driven planning: steering, requirements, design and tasks.                      |
| `public/`            | Audio cues, puzzle sprite sheet, favicon.                                            |
| `scripts/`           | Build-time generators. `scripts/legacy/` is reference only and is not used.          |
| `.github/workflows/` | CI (`ci.yml`) and the Supabase keep-alive (`keepalive.yml`).                         |
| `vercel.json`        | Vercel build settings, single-page rewrite, security and cache headers.              |

## Documentation

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
- [CHANGELOG.md](CHANGELOG.md): what changed in each version.
- `docs/HOST_GUIDE.md`: the host's guide to running a show. In progress; not written yet.

## Licence

No licence has been chosen yet. `package.json` is marked `UNLICENSED`, so the code is not
licensed for reuse. The owner decides the licence. The audio, art, survey and puzzle content is
original (principle P-005): it contains no real show's music, logos, surveys or puzzles. The
bundled fonts (Press Start 2P, Pixelify Sans, Silkscreen) are licensed under the SIL Open Font
License.
