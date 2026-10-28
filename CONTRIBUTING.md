# Contributing

Thanks for working on Game Show Takeover. This guide covers setup, the rules the code follows, and
how a change gets to `main`. The steering rules are in `.ai/steering/`, and the decisions behind the
architecture are in `.ai/sdd/specs/001-cloud-rewrite/design.md`.

## Set up

You need Node 22 (`.nvmrc`) and npm.

```bash
npm install
npm run dev          # http://localhost:3000, demo mode, no Supabase needed
npm run validate     # typecheck, lint, format check, unit tests, build
npm run e2e          # Playwright, Chromium
```

Demo mode is the default when no Supabase variables are set. You only need a Supabase project to
test sign-in or the database. Copy `.env.example` to `.env.local` for that. Never commit `.env.local`.

## Branches and pull requests

- Trunk-based. Branch from `main`, keep the branch short-lived, and open a pull request into `main`.
- CI must pass before merge. CI runs `npm run validate` and the Playwright suite.
- Each SDD task is one pull request sized unit of work. Put its verification evidence in the pull
  request body (see the template in `.github/PULL_REQUEST_TEMPLATE.md`).
- Do not push to `main` directly.

## Commit messages

Use conventional commit subjects: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, and so on. Keep the
subject short and say what changed. The body can explain why.

## Before you open a pull request

Run these and paste the results into the pull request:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run e2e          # when the change touches a screen, a flow or the realtime path
```

`npm run validate` runs the first five. Principle P-008: "done" means the task's tests pass and
`npm run validate` is green, with the command and its result quoted.

## Code rules

From `.ai/steering/conventions.md`:

- TypeScript in strict mode, with `noUncheckedIndexedAccess`. No `any`. No non-null assertions (`!`)
  except in tests, where a comment says why.
- Named exports only. One React component per file, and the file name matches the export.
- Prettier defaults with a 110 column line length, single quotes and trailing commas.
- No `console.log`. Use `src/lib/logger.ts`. Lint allows `console.warn` and `console.error` only.
- Comments explain why, not what. Engine files start with a short header naming the rules document
  they implement.
- Tests sit beside the code as `*.test.ts` or `*.test.tsx`. Engines are tested with seeded
  randomness and fixture content, not with snapshots of markup.
- Components render state and dispatch actions. They never compute rules.
- Components never call Supabase directly. Persistence goes through `src/data/repositories`.
- No user-supplied string is rendered as HTML.

## Engine rules

Engines are the rule books. They are the most important code in the project.

- An engine is `(state, action) => state`. It is plain, serialisable data with no functions, `Set`
  or `Map`.
- An illegal action returns the same object.
- Randomness and content arrive in the action. Engines never roll dice or pick content.
- Engines and `src/judging` import nothing from React, the DOM or Supabase. Check this in review.
- Every rule bullet in the rules documents in `docs/` has a named test.
- Hidden information stays in host-only selectors. Add a test that the audience view leaks nothing
  when you touch a selector (principle P-002).

## Phones and realtime

- The stage re-checks every phone press and action (principle P-004). Greyed buttons on a phone are
  only a display.
- Validate every realtime payload with the zod schemas in `src/realtime/schemas.ts`. An unknown or
  invalid message is dropped and logged, never thrown.
- Keep payloads under 32 KB.

## Database changes

- Add a new migration file in `supabase/migrations/`, numbered after the last one. Never edit a
  migration that has been applied anywhere.
- Every table has RLS on. Clients write through security definer RPCs, not directly.
- Every function sets `search_path = ''` and uses schema-qualified names.
- Add or update the cases in `supabase/tests/rls.sql` for any policy change.
- Describe the change in the pull request, and say whether it must be applied before the code is
  deployed. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), section 9.6.

## Dependencies

Principle P-007: prefer the platform and a few well-known libraries. Add a dependency only when
there is a clear reason, and say that reason in the pull request. Runtime dependencies add to the
phone's download, so check the size. Do not change `package-lock.json` by accident. Use
`npm install <pkg>` and review the lock file diff.

## Content and assets

- Original assets only (principle P-005). No real show's music, logos, surveys or puzzles. No
  Nintendo names, characters or sprites.
- Content lives in `src/content/*.json` and must pass the zod schema. Run `npm test` after editing
  it.
- This is a greenfield rewrite. Do not copy code from the previous version of the app. Its docs in
  `docs/` are reference material.

## Documentation and the changelog

- Update the docs in `docs/` when a behaviour or a rule changes. For architecture changes, update
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). For deployment steps, update
  [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
- `CHANGELOG.md` is kept by hand. Add a line under the unreleased version for any user-visible change.
- The SDD planning files are in `.ai/sdd/specs/001-cloud-rewrite/`. Keep the spec in step with a
  decision that changes it.

## Accessibility and the show

- Audience text is 18 px or larger on the 1920 by 1080 stage. Phone tap targets are 44 px or larger.
- Focus is visible everywhere. Every animation is off under `prefers-reduced-motion`.
- The show never stalls (principle P-001): every host action has a keyboard path, every ruling can be
  undone, every clock can be paused, and a refresh restores the screen.
