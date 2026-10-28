# SDD brief: Cloud rewrite of Game Show Takeover

Status: implementation:done, review:addendum (see `../specs/001-cloud-rewrite/review.md`). Not yet deployed.

- Requirements: `.ai/sdd/specs/001-cloud-rewrite/requirements.md` (draft, decisions D-001..D-010 from the owner)
- Design: `.ai/sdd/specs/001-cloud-rewrite/design.md` (Supabase private channels per team, pure engines, director lease)
- Tasks: `.ai/sdd/specs/001-cloud-rewrite/tasks.md` (T1-T28; all implemented except T27 deployment, which waits on the owner)
- Review: `.ai/sdd/specs/001-cloud-rewrite/review.md` (3 blockers found and resolved; non-blocking list remains)
- Owner decisions still open: `.ai/sdd/specs/001-cloud-rewrite/owner-questions.md`

Verification: `npm run validate` (2121 tests) and `npx playwright test` (17 flows) green on 2026-10-28.

Blocked on the owner: create the GitHub repo and grant push access; approve applying `supabase/migrations/0001_init.sql` and `0002_director_lease.sql` to project `qkolbdllyinnycyqygrm`; create the Vercel project from the repo with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Runbook: `docs/DEPLOYMENT.md`.
