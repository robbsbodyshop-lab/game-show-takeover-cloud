# Conventions Steering

> Status: Draft for owner review · Last updated: 2026-10-28

## Code Style

- TypeScript strict, `noUncheckedIndexedAccess`, no `any`, no non-null `!`
  except in tests with a comment.
- Prettier defaults with 110-column lines, single quotes, trailing commas.
- Named exports only; one React component per file; file name matches the
  export (`FeudBoard.tsx`, `feudEngine.ts`).
- No `console.log`; use `lib/logger.ts` (`debug` is silent in production).
- Comments explain _why_, not _what_. Every engine file starts with a short
  header naming the rules document it implements.

## Architecture Patterns

```
src/
  app/            entry, router, providers, global styles
  design/         tokens.css, primitives (Panel, Button, Marquee, Badge...)
  engines/        pure rule engines: feud/, wheel/, puzzle/, event/ (no React)
  games/          one folder per game: components + controller + cues
  stage/          the 1920x1080 stage, hub, setup, scoreboard, finale
  host/           host panel, host view, settings dialog
  phone/          the team phone app
  realtime/       RoomTransport interface, Supabase and in-memory transports,
                  message schemas (zod)
  data/           Supabase client, repositories, session persistence
  audio/          cue registry and player
  content/        JSON content + pickers + validation
  lib/            logger, storage, dom, timers, rng
supabase/         migrations, seed, config
e2e/              Playwright specs
docs/             rules, host guide, architecture, design, deployment
```

- **Engines** are `(state, action) => state`, plain data only (no Set/Map/
  functions), illegal actions return the same object, presentation events
  carry a monotonic `seq`. No randomness or content picking inside: draws and
  content arrive in actions.
- **Controllers** (one per game) own timers, cues, voice and host commands and
  translate them into engine actions. They are framework-free classes exposed
  to React with `useSyncExternalStore`.
- **Components** render state and dispatch; they never compute rules.
- **Realtime payloads** are validated with zod on receipt; unknown messages
  are dropped and logged, never thrown.
- **Persistence** goes through `data/repositories`; components never call
  Supabase directly.
- Hidden information (answers, puzzle solutions, envelopes) is derived by
  host-only selectors and never passed to stage components.

## Testing Rules

- Tests live beside the code in `__tests__/` or as `*.test.ts(x)` and cover:
  every engine transition named in the rules docs, every selector, content
  validation, reducers, the transport protocol, and each screen's happy path.
- Engines are tested with seeded RNG and fixture content; no snapshot tests
  of markup.
- Playwright drives a stage, a host view and two phones in one browser
  context against the in-memory transport for the end-to-end flows.
- A task is not done until its tests pass locally and `npm run validate`
  passes.

## Accessibility / Security Rules

- Audience text 18 px or larger on the 1920x1080 frame; phone tap targets
  44 px or larger; focus visible everywhere; every animation off under
  `prefers-reduced-motion`.
- RLS on every table; policies tested with the Supabase CLI test harness or
  SQL assertions in migrations.
- Room codes are 4 letters from 20 consonants (160,000 codes), expire 12 hours
  after the last activity, and joining is rate limited per anonymous user.
- No user-supplied string is rendered as HTML.

## Workflow Rules

- Trunk-based: short-lived branches, PRs into `main`, CI must pass.
- Conventional commit subjects (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Each SDD task is one PR-sized unit with its verification evidence in the
  PR body.
- Version in `package.json`; `CHANGELOG.md` kept by hand.
