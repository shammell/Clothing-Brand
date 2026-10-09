# Site Expansion — Progress Notes

Saved mid-work on 2026-10-08 so this can be resumed later without
re-deriving context. Read this first if picking the work back up.
(This file currently lives on the `worktree-phase1-role-backend`
branch; it lands in the main checkout's root once that branch merges.)

## The goal

Full site expansion: three actor roles (Customer, Lister, Admin),
15-page professional storefront (replacing the current modal-heavy
3-route prototype), dummy payment UI (no Stripe), CSS-only
micro-animations. Full design reasoning lives in:

- **Spec:** `docs/superpowers/specs/2026-10-08-site-expansion-design.md`
- **Plans (5 phases, each independently shippable):**
  1. `docs/superpowers/plans/2026-10-08-phase1-role-backend.md` — role enum + RBAC backend
  2. `docs/superpowers/plans/2026-10-08-phase2-frontend-role-wiring.md` — auth-store rename
  3. `docs/superpowers/plans/2026-10-08-phase3-page-restructuring.md` — modals → real pages + animations
  4. `docs/superpowers/plans/2026-10-08-phase4-lister-and-admin-users.md` — /lister dashboard + admin Users tab
  5. `docs/superpowers/plans/2026-10-08-phase5-static-pages-and-cleanup.md` — /about, /contact, /policies + dead-code sweep

**Execution method agreed with user:** Subagent-driven for Phase 1 and
Phase 3 (foundation + largest diff). Native (inline, single reviewer at
the end) for Phases 2, 4, 5.

## Where things stand right now

**Phase 1 is complete**, including the final whole-branch review's fix
wave, run via `superpowers:subagent-driven-development` in an isolated
git worktree:

- Worktree: `C:\Users\USER\clothing store\.claude\worktrees\phase1-role-backend`
- Branch: `worktree-phase1-role-backend` (not yet merged to `main`)
- SDD ledger (full detail, rulings, task-by-task log): `.superpowers/sdd/2026-10-08-phase1-role-backend/progress.md` (inside this worktree)
- **Baseline:** 38 backend tests passing before any task started.

Task-by-task status (Phase 1 has 7 tasks total):

| Task | Status | Commit | Notes |
|---|---|---|---|
| 1. User model (`role`, `is_blocked`, `created_at`) | ✅ complete, review clean | `760811e` | — |
| 2. `auth_service.py` role claim + `require_role` | ✅ complete, review clean | `5e15882` | Full suite intentionally red here (34 pass/6 fail) — expected |
| 3. `auth.py` routes — register/login use role, blocking | ✅ complete, review clean | `f343abe` | Full suite still 6 failing — root cause below, fixed by Task 4 |
| 4. `conftest.py` fixtures (`make_admin`→role, add `make_lister`) | ✅ complete, review clean | `0094645` | Fixed the 6 failing tests |
| 5. Lister product permissions (`products.py`) | ✅ complete, review clean | `4920e9c` | — |
| 6. Admin Users API (new `routes/users.py`) | ✅ complete, review clean | `b4b304e` | — |
| 7. Production migration script | ✅ complete, review clean | `cb72f94` | One-time, run by hand against Atlas after deploy — not part of the test suite |

All 7 tasks passed their own task-scoped review, and the final
whole-branch review's findings were fixed in a consolidated wave after
Task 7 (see `.superpowers/sdd/2026-10-08-phase1-role-backend/final-fix-report.md`
for the detail).

## Deployment note

**Phase 1 is backend-only and must NOT be deployed to production on
its own.** The frontend admin UI (`frontend/app/page.tsx`,
`frontend/app/admin/page.tsx`) still reads `is_admin` from the login
response, which Phase 1's backend no longer sends (it sends `role`
instead). Deploying Phase 1 alone would make every admin appear as a
non-admin in the UI until Phase 2 (frontend role wiring) also ships.
Phase 1 and Phase 2 must go out together, or Phase 1 held back until
Phase 2 is ready.

**Why the suite is red right now, and why that's expected, not a bug:**
Tasks 1-3 updated the model, the JWT-reading code, and the auth routes
to use `role` instead of `is_admin`. But `backend/tests/conftest.py`'s
`make_admin` fixture still writes `is_admin: True` to the test database
and never sets `role: "admin"` — so every test that needs an admin
token (in `test_orders.py`/`test_products.py`) currently gets a
customer-role token back and fails with 403. Task 4 fixes exactly this.
Independently confirmed by both the Task 2 and Task 3 reviewers.

**One self-correction worth knowing:** when dispatching Task 3's
implementer, the controller (this session) wrongly said the full suite
should go green after that task. It doesn't — only Task 4 closes that
gap. The implementer caught the discrepancy itself, correctly left
`conftest.py` alone (not its file to touch), and flagged it as a
concern instead of guessing. Recorded as a ruling in the SDD ledger.

## To resume

1. Read the SDD ledger's "Task log" section for the exact history and
   any rulings.
2. Continue the `subagent-driven-development` loop starting at Task 4,
   through Task 7.
3. After Task 7's review is clean, run the final whole-branch review
   (most capable model) per the skill, then
   `superpowers:finishing-a-development-branch` to merge
   `worktree-phase1-role-backend` back into `main`.
4. Then move to Phase 2 (Native execution — `superpowers:executing-plans`),
   Phase 3 (Subagent-driven again), Phase 4 (Native), Phase 5 (Native),
   in that order — each phase's own plan file has its own completion
   checklist at the bottom.
5. Phase 1's one-time production migration script (Task 7) must be run
   by hand against the real Atlas database after Phase 1 deploys — do
   not forget this; it is not automatic.

## Nothing is lost if this session ends

Everything above is either committed to git (on
`worktree-phase1-role-backend`, not yet merged to `main`) or recorded
in the SDD ledger. `git log --oneline` on that branch and the ledger's
"Task log" section are the source of truth over this summary if they
ever disagree.
