## Summary

<!-- What changes, and why. One or two sentences. -->

## Linked task or spec

<!-- For example: T12 in .ai/sdd/specs/001-cloud-rewrite/tasks.md, or "none". -->

## Changes

<!-- The main files or modules touched, and anything a reviewer should look at first. -->

-

## Verification

<!-- Paste the commands you ran and their results. Principle P-008. -->

```
npm run typecheck      # result:
npm run lint           # result:
npm run format:check   # result:
npm test               # result: (number of tests passing)
npm run build          # result:
npm run e2e            # result: (if a screen, flow or realtime path changed)
```

## Checks for this change

- [ ] Engines and `src/judging` import nothing from React, the DOM or Supabase.
- [ ] Hidden information stays out of audience views (principle P-002). A test covers it if a selector changed.
- [ ] Every realtime payload is validated with the zod schemas. Payloads stay under 32 KB.
- [ ] Phone presses and actions are re-checked by the stage (principle P-004).
- [ ] Original assets only (principle P-005). No copied code from the previous version.
- [ ] No `console.log`. No `any`. No non-null assertions outside tests.

## Database and deployment impact

- [ ] No migration in this change.
- [ ] Migration added in `supabase/migrations/`. It must be applied before this code is deployed:
      <!-- say which migration, and whether `supabase/tests/rls.sql` covers it -->
- [ ] New or changed environment variables (say which, and where they must be set):
- [ ] No new dependencies. (If there are, say why and what they add to the phone bundle.)

## Documentation

- [ ] `CHANGELOG.md` updated under the unreleased version, if the change is visible to users.
- [ ] `docs/ARCHITECTURE.md` or `docs/DEPLOYMENT.md` updated, if the change affects them.
- [ ] Rules documents in `docs/` still match the code, if an engine rule changed.

## Screenshots

<!-- Required for any visible change to the stage, the host view or the phone. Use the 1920 by 1080 stage and a phone-width view. -->
