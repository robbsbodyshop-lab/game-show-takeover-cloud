# Project Principles

> Status: Active · Last Updated: 2026-10-28

## Purpose

Decision rules for everyone (human or agent) working on Game Show Takeover.

## How to Use These Principles

- `MUST`: non-negotiable unless the owner changes it.
- `SHOULD`: strong default; exceptions need a written reason.
- `MAY`: allowed option.

## Principles

### P-001: The show never stalls

**Level:** MUST
**Rule:** Every host action has a keyboard path; every ruling can be undone;
every clock can be paused; a refresh or reconnect of any device restores
exactly where it was.
**Reason:** A live audience is watching.

### P-002: The audience never sees hidden information

**Level:** MUST
**Rule:** Answers, puzzle solutions, the question queue and the sealed envelope
exist only in host-only selectors and host surfaces.
**Reason:** It is the whole game.

### P-003: Rules live in pure engines

**Level:** MUST
**Rule:** Game rules are implemented once, in framework-free reducers, tested
against the rules documents. UI, phones, host views and hotkeys all dispatch
the same actions and the engine rejects anything illegal.
**Reason:** One source of truth; deterministic tests.

### P-004: The game has the final say over phones

**Level:** MUST
**Rule:** Phone controls (greyed buttons, "not your turn") are presentation;
the stage re-checks every press. Private channels stop impersonation; the
engine stops out-of-turn play.
**Reason:** Phones lag and users tap early.

### P-005: Original assets only

**Level:** MUST
**Rule:** No real show music, logos, surveys or puzzles; no Nintendo names,
characters or sprites. Show names are used only to describe the formats.
**Reason:** This is a public, multi-tenant site.

### P-006: Free tier by default, honest about its limits

**Level:** SHOULD
**Rule:** Stay within Vercel Hobby and Supabase Free; document the pause risk
and the upgrade path instead of hiding it.
**Reason:** The owner chose free tiers.

### P-007: Small, boring dependencies

**Level:** SHOULD
**Rule:** Prefer the platform (CSS, Web Audio, Web Speech, BroadcastChannel)
and a handful of well-known libraries over frameworks for routing, state or
styling.
**Reason:** Longevity and a bundle phones load fast.

### P-008: Verify before claiming

**Level:** MUST
**Rule:** "Done" means the task's tests pass and `npm run validate` is green,
with the command and result quoted.
**Reason:** Trust.

## Decision Rules

1. Safety, privacy and the owner's explicit decisions come first.
2. Approved requirements beat implementation preference.
3. The simpler design wins unless it fails a requirement.
4. When unsure, ask the owner; never infer a product decision.

## Review Expectations

- [ ] Requirements respect every MUST principle.
- [ ] Design justifies any exception to a SHOULD principle.
- [ ] Tasks include verification for hidden-information and realtime work.
