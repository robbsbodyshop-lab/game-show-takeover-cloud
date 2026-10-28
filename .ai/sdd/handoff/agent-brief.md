# Brief for implementation agents

Repo: `/home/user/game-show-takeover-cloud` (greenfield rewrite). Read first, in this order:
1. `.ai/steering/conventions.md` and `.ai/steering/principles.md` (short).
2. `.ai/sdd/specs/001-cloud-rewrite/design.md` (architecture, module map, protocol, data model).
3. The task text assigned to you in `.ai/sdd/specs/001-cloud-rewrite/tasks.md`.
4. The rules or reference doc named in your task under `docs/`.

Hard rules:
- Work only inside the directories your task names. Do not edit `package.json`, lock file,
  `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, CI files, or other
  agents' directories. If you need a new dependency, stop and report it instead of installing.
- TypeScript strict; no `any`; named exports; one component per file; tests beside code as
  `*.test.ts(x)`; no `console.log` (use `src/lib/logger.ts`).
- Engines (`src/engines/**`, `src/judging/**`) import nothing from React, DOM, Supabase.
  Plain serializable state, `(state, action) => state`, illegal action returns the same
  object, presentation events with monotonic `seq`, injected randomness and content.
- Do not copy code from `/home/user/game-show-takeover-` (the old repo). You may read its
  docs under `docs/` of this repo. The owner chose a greenfield rewrite.
- Do not commit. Do not push.
- Before reporting: run `npm run typecheck`, `npx eslint <your dirs>`, `npx prettier --write
  <your dirs>` and `npx vitest run <your dirs>`. Quote the commands and results.
- Report: files created, test count, anything in the spec you could not implement or found
  ambiguous (do not guess product rules; list them as open questions).

## Integration contracts (wave 2 onward)
- Services: `useAppServices()` from `src/app/AppContext.ts` gives `{ mode, data, createTransport, audio, version }`.
- Games implement `GameProps` from `src/stage/gameContract.ts` and talk to phones/host only through
  `PhoneBridge` and `HostBridge` (`src/host/hostProtocol.ts`). Never import `src/realtime` or
  `src/data` from `src/games/**`.
- Engines are done: `@/engines/event`, `@/engines/feud`, `@/engines/puzzle` (Wheel in progress).
  Content: `@/content`. Audio: `@/audio/cues`, `@/audio/player`. Design primitives: `@/design`.
- Team ids are integers 1..8 everywhere (event engine, realtime schemas, SQL).
