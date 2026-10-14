# Ledger — plan: docs/superpowers/plans/2026-10-12-production-readiness.md

Executed inline (no worktree, no subagents) per user's token-budget instruction.

Pre-flight: tasks mostly independent; Task 7 consumes Task 6; Task 8 frontend consumes Task 8 backend /auth/me (same task); later tasks (9-14) share no interfaces with earlier ones. No conflicts found.

Task 1: complete (commit 2970b76, tests: npm test → 8/8 pass)

Ruling: Task 2 (Resend) blocked on marketplace terms acceptance (browser, user action) — reordered to do independent tasks (13, 12, 10, 11, 9) first, resume 2/3/4/5/6/7/8 once terms accepted. Cost if wrong: none, just reordering.

Task 13: complete (commit 8dd7f40, tests: grep alt="" → no matches)

Ruling: backend/venv broken (base Python 3.14 uninstalled); pinned requirements.txt pydantic-core has no wheel for system Python 3.15, fails to build from source (no Rust/link.exe toolchain). Installed latest unpinned versions into system Python 3.15 instead for test execution. Cost if wrong: installed versions may drift slightly from requirements.txt's exact pins; not touching requirements.txt pins themselves (out of this plan's scope).

Task 10: complete (commit 2396261, tests: npm test → 10/10 pass)
Task 11: complete (commit 1dc9ab2, tests: npm test → 12/12 pass, npm run build → succeeds, /sitemap.xml and /robots.txt present)

Ruling: no local MongoDB available in this environment (conftest.py refuses non-localhost URLs for safety, and no mongod/docker was installed). Downloaded a portable MongoDB 7.0.14 Windows binary to C:\Users\USER\mongodb-portable and started it on 127.0.0.1:27017 for test execution going forward. Cost if wrong: none — purely local dev/test infra, not committed to the repo (outside the git working directory).

Task 12: complete (commit f8d6196, tests: pytest -q → 60/60 pass)

Task 9: complete (commit dbd7868, tests: pytest -q → 61/61 pass). Step 8 (manual production Sentry verification) deferred — needs SENTRY_DSN provisioned (blocked on same marketplace terms acceptance as Resend) and a real Vercel deploy; not code, flagged as a pending manual check, not a code gap.

Ruling: Vercel Blob uses a newer OIDC-based auth model (BLOB_STORE_ID + VERCEL_OIDC_TOKEN), not the BLOB_READ_WRITE_TOKEN the plan's Setup note assumed. No code depends on the specific token env var name (the @vercel/blob SDK reads it automatically), so this didn't change any task code, only the provisioning step actually run. Cost if wrong: none observed, build succeeded.

Task 8: complete (commit 54f341c, tests: backend pytest -q → 63/63 pass, frontend npm test → 14/14 pass, npm run build → succeeds with /api/upload route present). Step 12 (manual live-upload verification) deferred to the end-of-plan manual verification pass.

Final: fixed Host-header-trust SSRF/auth-bypass in /api/upload (flagged by automated per-commit security review, not the plan's own Review Focus) — extracted resolveAuthMeUrl(), 3 new tests RED→GREEN, suite 17/17. Commit 082390c.

Task 14: complete (commit b79e74b, tests: pytest -q → 66/66 pass)

Remaining: Tasks 2,3,4,5,6,7 all blocked on Resend marketplace terms acceptance (user action, browser). 8/14 tasks done.

Final: fixed audit-log-fail-open (flagged by automated security review on Task 14's commit, not the plan's Review Focus) — record_audit() ran after the state change, so a failed audit write could leave a role/block change applied unaudited. Reordered to audit-first/change-second (fail closed); 2 new tests (role + block) RED→GREEN, suite 68/68. Commit 0bbe458.

Final: Ruling: audit-log-evasion-truncation (GET /users/audit-log caps at 200 most-recent entries, no pagination) — a malicious admin could bury an incriminating entry by generating 200+ later entries. Not fixed: building pagination/retention is disproportionate scope for this app's realistic admin-count/change-volume; ledgered as a known limitation rather than built. Cost if wrong: an audit trail gap is possible at very high admin-change volume, which this app has never approached.

Ruling: Resend requires a domain (resend.dev sandbox domain is shared/already-registered and can't be claimed per-account via the Vercel Marketplace checkout flow). User provisioned Resend directly (resend.com signup, not via Vercel Marketplace) and supplied a real RESEND_API_KEY, pasted into backend/.env. FROM_ADDRESS uses onboarding@resend.dev (Resend's own sandbox sender, works without domain verification, delivers only to the account's own verified address until a real domain is verified - user declined to use their company's Hostinger domain for this project). Cost if wrong: emails only deliver to the account owner during testing; a real domain can be verified later with no code change beyond FROM_ADDRESS.

Task 2: complete (commit 2c69c13, tests: pytest -q → 71/71 pass)
Task 3: complete (commit 00be410, tests: pytest -q → within full suite, test_orders.py 20/20 pass)

Final: Ruling: sensitive-data-in-logs finding on email_service.py (recipient email logged on warn/error) — automated security review flagged it; judged as standard, low-severity operational practice (not a secret/credential), not fixed.

Task 4: complete (commit fa9ab03, tests: pytest -q → 75/75 pass)

Final: fixed resource-exhaustion-blocking-call on orders.py + contact.py (flagged by automated security review) — send_email() made a blocking HTTP call inline inside async handlers; moved both to BackgroundTasks. Existing tests (TestClient runs background tasks before returning) still pass unchanged, confirming the fix: 23/23 on orders+contact, suite 75/75.

Final: Ruling: pii-in-logs on orders.py (same category as email_service.py's finding) — same reasoning, not fixed.

Final: Ruling: unverified-recipient-email-abuse on orders.py — registration (auth.py) never verifies email ownership (pre-existing, not introduced by this plan); automatic order-confirmation emails give a slightly larger blast radius for registering-with-a-victim's-email spam. Building email verification at signup is a substantial separate feature, disproportionate to add unprompted here; ledgered as a known pre-existing gap, not fixed.

Task 5: complete (commit c524fb7, tests: backend pytest -q → 77/77 pass, frontend npm test → 19/19 pass)

Final: fixed html-injection + header-log-injection on contact.py (flagged by automated security review) — user-supplied name/message interpolated unescaped into the HTML email body (stored-HTML-in-email risk), subject line not stripped of CR/LF (defense-in-depth against header injection). Added html.escape() + sanitize_subject(); 2 new tests RED→GREEN, suite 77/77.

Final: Ruling: abuse-rate-limit on contact.py (5/minute per-IP, same slowapi pattern as /auth/register and /auth/login) — consistent with the rest of the app's already-documented, already-accepted rate-limiting design (see limiter.py's own extensive comments on its known per-process/multi-worker limitation); not a new issue, not fixed differently here.
