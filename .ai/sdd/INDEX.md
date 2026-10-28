# SDD Index

## Upstream Handoffs

- `.ai/strategy/handoff/strategy-brief.md`: missing (decisions were taken in chat on 2026-10-28; see `requirements.md` Decisions)

## Plan

- `.ai/sdd/PLAN.md`: missing (single-feature project; the spec below is the plan)

## Ideas

| ID  | Name | Status | Path |
| --- | ---- | ------ | ---- |

## Feature Workspace

| Field            | Value | Notes                                                |
| ---------------- | ----- | ---------------------------------------------------- |
| Next Feature ID  | 002   | Recompute from filesystem before creating a new spec |
| Numbering Issues | none  |                                                      |

## Specs

| ID  | Feature                             | Status              | Requirements                              | Design                              | Tasks                              | Review                                                                 |
| --- | ----------------------------------- | ------------------- | ----------------------------------------- | ----------------------------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| 001 | Cloud rewrite of Game Show Takeover | implementation:done | `specs/001-cloud-rewrite/requirements.md` | `specs/001-cloud-rewrite/design.md` | `specs/001-cloud-rewrite/tasks.md` | `specs/001-cloud-rewrite/review.md` (not ready: 3 blocking gaps F1-F3) |

## Handoff

- `.ai/sdd/handoff/sdd-brief.md`: generated after approved tasks or completed review

## Next Actions

- [ ] Owner records approval of `requirements.md`, `design.md`, `tasks.md` (all still headed `draft`)
- [ ] Spec 001 blocking gaps from `review.md`: F1 FR-025 team impersonation (spec decision first), F2 save starvation under a fast change stream (FR-004), F3 DEPLOYMENT.md omits migration 0002
- [ ] Refresh stale docs (`review.md` F12) and add the missing e2e flows (F13), then re-review
- [ ] T27 provision and deploy (owner approval pending), then settle `review.md` R1 and R2
