# PostgreSQL cutover

The deployed backend is selected by DATABASE_BACKEND. SQLite remains the default until Render environment variables are applied. PostgreSQL preserves the complete legacy schema and IDs, including all TEST/LIVE distinctions and contract metadata. Uploaded files stay on the existing /data Render persistent disk.

## Implemented
- pg client in a worker provides compatibility for the current synchronous repositories. Transactions acquire an advisory transaction lock to preserve existing serialized SQLite writes. This is an initial small-site bridge; an asynchronous repository/pool is the next scaling step.
- DATABASE_BACKEND=postgres, DATABASE_URL=<private internal Render URL>, MIGRATE_SQLITE=1 enable the cutover.
- Startup takes a consistent SQLite backup in /data/backups, checks integrity, copies all user tables in one PostgreSQL transaction, compares every table's row count and canonical SHA-256 digest, resets identity sequences and records sqlite-v1 in nnx_migrations.
- Occupied target databases and mismatched tables are rejected. Failed imports roll back. Restarting after success does not re-import SQLite or overwrite new PostgreSQL data.
- /api/health reports backend and migration verification, without credentials or personal data. Deployment logs contain only table names/counts.
- Render stops the old instance before starting a new one when a persistent disk is attached. Therefore old SQLite writes stop before the final backup. Reference: https://render.com/docs/disks

## Operation
1. Deploy compatibility code while still on SQLite; verify site health.
2. Save the internal DATABASE_URL privately on the existing novanoxx web service, then DATABASE_BACKEND=postgres and MIGRATE_SQLITE=1; redeploy.
3. Verify successful import in logs and PostgreSQL health; check catalogue, session, wallet and order history in the site.
4. Retain the SQLite backup and uploaded files. After PostgreSQL receives writes, do not switch back to the stale SQLite copy. Restore/reconcile PostgreSQL instead.
5. No R2 credentials or file moves are required. No extra disk/database resource is provisioned by this code.

## Validation
Real PostgreSQL engine tests (PGlite): full legacy-schema migration/restart, aliases, binary avatars, rollback/uniqueness, creator upload/review, contest persistence, topup amount/ownership/idempotency, purchase balances/orders and original-access authorization. Existing SQLite tests also remain applicable. Final production verification still requires the Render cutover.

## PRD follow-up
001-foundation.sql is a future normalized PRD schema proposal, not an automatic migration. Do not apply it to the legacy database as-is. Full LIVE settlement/refund, analytics/search/subscription event histories and checkout/delivery timers require further application work. User decisions supersede older PRD: 12% total seller fee including PG and VAT, EXCLUSIVE/MULTI, AI_TOOLS, contract snapshots and contests. 1 NEON = 100 KRW; TEST credits do not become paid balances or original-file entitlements.

## Workspace
Saved Codex NNX project: D:\AI asset market. Code checkout: D:\AI asset market\novanoxx-live. Older preview checkout is preserved. Current chat's environment may still advertise the old F: path; explicitly target D: and reopen the saved project to refresh the chat context.

## Verified production cutover — 2026-10-11
Render deployment dep-db5q62vlot8c73fqsmng migrated and verified 19 tables. Existing rows: users 4; identities 5; sessions 7; login_events 17; creator_profiles 1; creator_assets 1; creator_files 2; account_status 3; test_wallet 2; test_topups 7; test_orders 3; test_ledger 3; test_grants 2; review_audit 1; catalog_links 1; other tables empty. Public health reports postgres + migrationVerified=true. Catalog asset 1001 still has MULTI sale mode; its existing preview returns HTTP 200 (9,137 bytes). SQLite backup is retained privately on the existing Render disk. Final PG driver numeric-sum parser fix is deployed separately without recopying the legacy data.


## 179 — 2026-10-18 review deployment and operating schema boundary

The owner authorized deployment of the review site onto the already-running TEST service. Reuse the existing web service, 5 GB disk and TEST Postgres instance; preserve the old database and disk directories. The local and deployed review entry points use the same sandbox-engine-core.cjs. This separates records and financial authority, rather than maintaining a second website implementation.

Use render.yaml as the updated configuration source for that existing Blueprint. Its service and database names, region, plans and allocated storage match existing resources. The database connection can derive the new logical database name from the already-held SANDBOX_PG_URL without copying credentials into code. Explicitly provision only nnx_review_20261018 and /var/data/nnx-review-20261018 before switching the service. Disk initialization must run in the service Web Shell, not a pre-deploy command or one-off job.

Product checkout validates server prices and terms and opens the Toss test CARD window. Subscription checkout uses the existing 3,000/6,900/9,900 KRW monthly prices and test requestBillingAuth. Return state is bound to the account, order, amount/customer and expiry; it is explicitly unverified and never treated as payment approval. The owner opened an individual test-client-key page; no provider application, key regeneration, real charge or payout was authorized or performed. Financial approvals, billing-key storage/charges and settlement need further operating adapter implementation and provider contract verification. A key change alone does not complete those adapters.

The prepared database/002-operating-engine.sql is NOT the old 001 foundation migration and is never applied at startup. It adds a separate nnx_operating_v1 namespace, preserves public user IDs and old TEST records, and enforces KRW amounts and 12 percent fees floored below one won. It contains orders/payments/provider deduplication/files/entitlements/subscriptions/encrypted billing references/cycles/held settlement/outbox structures. No operating repository or financial adapter is bound to it yet; setting NNX_OPERATING_ENGINE=1 is rejected. Apply later only with approved snapshot, mapping, code compatibility and reconciliation/rollback steps.

Costs observed before deployment: existing web compute USD 7/month and TEST DB compute USD 6/month, plus existing storage. No new fixed-charge resource or scaling is planned. Pipeline usage was 25/500 included minutes. Workspace bandwidth had already exceeded its 5 GB allowance (13.39 GB, USD 1.35 accrued), so zero additional variable usage cost is not promised. Restrict external verification to essential pages and payment-window entry; do not replay large videos or run load/capacity experiments.

Review deployment completed on the existing TEST service. Initial commit 21e37b3e4bea32feb6e6ae246def911fe9285aee was live; the billing dialog obscured the provider iframe, so the official windowTarget self option was applied in commit 372fe7175ed4345b872e10a45c8d0acec2fae63f. The deployed card window showed the synthetic 1,000 KRW product and returned CANCELED_NO_APPROVAL. PLUS 3,000 KRW/month opened the actual Toss test billing card-entry screen; no card data, provider terms, billing key or charge was submitted. Original TEST table fingerprints matched across all 100 tables; all 675 original local files remained unchanged. Auto-deploy and Blueprint Auto Sync are off. Historical TEST data and original operating resources are retained; novanoxx.com was not rebound.

## 180 — 2026-10-18 actual operating deployment and custom domain

The owner clarified that the target must be the existing production service, not the TEST site. Production srv-db5aqunlk1mc739bi0m0 now runs commit d986dd7b64e366d93c98bb52f9898b364deaba09 through main, deploy dep-db9sprhsrm7s739t4m80 live at 2026-10-17T19:32:27.214394Z. Both https://novanoxx.com and the existing onrender address return HTTP 200, productionSite true, reviewOnly false, PostgreSQL and verified legacy migration. www redirects to the root domain, both certificates issued.

Before deployment, the existing writer gate drained requests while a private pg_dump and five uploaded-file copies were made under /data/.stage10-release180-20261018. Archive listing and file hashes were checked; a full restore was not run. After deployment all twenty pre-existing public table fingerprints and all five original upload hashes matched. Existing SQLite, private backup vault, original TEST DB/site and dirty local checkout were retained. New public feature tables were added, and the empty nnx_operating_v1 schema was explicitly prepared; no TEST order/balance/rights were transferred.

production-runtime.cjs binds nonfinancial Brief/contest/admin/file functions to the original identities but refuses simulated purchase/paid-plan/paid-delivery mutation, live activation, data collection and financial scheduling. financial-provider.cjs prepares confirm/query, billing issue/charge, refund, subscription-bound authenticated encryption and exact won fee/settlement calculation. It remains unbound to paid order/entitlement repositories and schedules; real finance is not completed by replacing a key alone. Contract, atomic paid workflow handoff, recurring-cycle orchestration and actual payout remain. No card data, live key or provider charge was used.

The workspace showed Hobby custom domains 0/2 before adding root and www, so no domain or TLS monthly charge was added. Only root A 216.24.57.1 and www CNAME novanoxx.onrender.com were added as DNS-only, preserving nine mail records. Existing compute/storage plans remain unchanged; bandwidth had already exceeded its allowance, so variable usage costs are not guaranteed zero.

Trusted production hosts normalize same-origin requests to the established API origin; test review services keep their original binding. Checkout return URLs stay on the current trusted host. OAuth registrations have not been expanded to new callback origins; social providers remain available using the original onrender configuration and require separate domain registration before enabling them on novanoxx.com. This is recorded as remaining work, not a completed social-login migration.

## 182 — 2026-10-18 production social login and category-menu fix

Production commit 4b7c36a23827cd78c1ce02b91b672954f0ea4284, deploy dep-db9t79nlk1mc73caefdg became live at 2026-10-17T20:00:26.877366Z. novanoxx.com is the canonical authentication origin; the old home redirects with HTTP 308. Google existing administrator and Naver existing development-member sign-ins returned successfully to the real production site. Kakao reached its first email-consent page and awaits the owner; no account linking was performed. Naver public release still needs provider review.

The navigation overflow container clipped dropdown categories. Header overflow is now visible, navigation wraps on narrow widths, and the mobile submenu uses the available height. At 600px all six categories and their children were visible, nav client/scroll widths both 527px. Prototype fixture cards/media are omitted in production HTML; their original source remains. Two explicit TEST listings are hidden, public preview access denied, and ordinary production wallet/history omit TEST balances/transactions.

Before changes, /data/.stage10-release182-20261018 received an 838474-byte custom pg_dump and five original upload copies, with archive listing/hash checks. An additive nnx_test_archive_v1 copy preserves all six TEST/review tables; counts and row digests match the retained public source tables. No source rows were deleted or original files moved. After real login checks, 56 of 59 original table fingerprints matched; session/login tables changed as expected, and one absent default Free/0 status row was initialized. Read-only extraction of the original account_status table from the dump confirmed all three old plan/balance rows unchanged. Original five upload hashes and the original dirty checkout's 675 fingerprints match. A full restore was not performed.

Existing encrypted automatic backup health is good, last success 2026-10-17T18:00:59.794Z. Its existing 7-daily/4-weekly policy is unchanged. This does not activate the future 90-day raw discovery backup or analytics collection, which remain unfinished together with the operating restore/deletion replay connection. Verified financial order/entitlement and subscription/payout orchestration also remain unfinished; only swapping provider keys is not sufficient. Partial paymentAuthority edits in sandbox-engine-core.cjs are preserved uncommitted and were excluded from this deploy.

No paid resource, instance or disk increase was created. One existing-service deploy was announced before execution; existing usage-based charges remain possible.

## 183 — Kakao administrator linking verified

After explicit action-time owner approval, Kakao was added to the existing novanoxx2026@gmail.com account, retaining Google. A full logout and Kakao-only sign-in returned to the same administrator; the signed-in UI showed Kakao as current provider and Google/Kakao as connected providers at 2026-10-18 05:13:14 KST. No source/runtime deployment, new user/admin role, paid resource or financial transaction was performed. Naver public review and the other unfinished finance/discovery/restore work from 182 remain.

## 184 — Original marketplace and contest presentation restored

The owner requested restoration after TEST filtering also removed the original presentation. Production commit 4c3bdd6b014cf25782536f704b41b89a817b102e, deploy dep-db9tmhh42hec73d30lo0 live at 2026-10-17T20:33:00.212546Z restores the original marketplace HTML body (3 picks, 4 award slides and 8 original asset cards), retaining canonical-domain metadata and the two explicitly hidden TEST listings. An empty connected contest feed now falls back to the original introduction, film area and searchable entry list. No DB migration, record/file deletion, social-login change or payment activation was performed. Existing uncommitted engine edits remain excluded. Future TEST cleanup must not remove the existing display assets or design. Live health/provider checks and both actual screens were verified, with no app error logs. No paid resource or fixed-price upgrade was added; normal restored-video bandwidth may increase usage.


## 185 — Operating connections deployed; live finance remains contract gated

Production runtime 2625f919d6d4a1028776753edbf7cf1697186261, deploy dep-db9u3ajrjlhs73c3ed5g, live 2026-10-17T21:00:15.632793Z. General sales and agreed Brief checkouts verify the provider's order, amount, currency and approved payment before creating paid workflow records. Final access requires current delivery completion and a granted operating entitlement; downloads recheck provider cancellations. Uncertain approvals recover by provider lookup rather than another approval request. TEST credit/orders never become operating rights. Order attachment access remains participant-only.

Monthly subscriptions now have encrypted billing credentials, stable per-cycle identifiers, uncertain-result reconciliation, agreed prices, UTC month-end handling, cancellation scheduling, plan limits and explicit asset selection after downgrade. Ordinary payment and billing MID keys are separate. Real payment/billing flags remain off. Settlement accrual uses won-floor fees and held/review records; seller bank payout is not connected until the provider and contract details are confirmed.

Discovery is default-off per account, excludes IP, retains live records for120 days, stores only a digest in generic request history, and uses separately encrypted90-day raw backups under discovery-v1/. Normal future PostgreSQL backups exclude raw event data. New-prefix-only cleanup, row/size/storage/monthly budgets and credential renewal monitoring apply; existing backup deletion rules are unchanged. The R2 bucket lifecycle configuration itself was not changed. The first encrypted empty snapshot was stored/read back (716bytes, three recorded operations); production readiness is true without enabling consent for the owner.

Before additive003, /data/.stage10-release185-20261018 preserved an848383-byte custom dump,60public-table fingerprints and five files. An actual restore to the non-serving nnx_restore_20261018_185 on the existing PostgreSQL instance succeeded; all60public-table digests match. Operating source after-deploy60tables/fivefiles and original675local files remain unchanged. The isolated DB is retained. Existing encrypted automated backup stays healthy; its owner private key was not used or uploaded. Recovery helpers authenticate/decrypt a capture locally and create an isolated candidate, reapply current privacy cutoffs and disable consent; if current privacy state cannot be obtained they discard raw analytics, never infer historical consent. No operating DB replacement was performed.

Existing marketplace8assets/3picks/4award selections, categories, contest presentation, social providers and explicit TEST archive remain. Essential integration/recovery and related checks passed; registered1098translation keys have no missing additional-locale keys. This is not a real-payment, full legal/accessibility, or whole-stage completion claim. Two announced existing-service deploys, no new paid resources/scaling/fixed monthly fee; ordinary usage charges remain possible. See existing evidence production185-report.json and three screenshots. Remaining: contract/MID/live-key activation; billing contract and encryption-key recovery setup; provider-specific seller payout/KYC/account/cancellation terms; existing Naver public review and formal release checks.


## Operating finance release 186 (2026-10-18)

Explicit additive004 follows the857572-byte snapshot at /data/.stage10-release186-20261018:84existing tables and5files. Existing82table digests and all5files match; schema marker2→3 and admin read-audit3→9 are expected additions. Four finance tables are new; no production transaction rows or TEST records were promoted. Snapshot oldCommit/oldDeploy fields inherited legacy helper defaults; actual pre-release runtime was2625f919 / dep-db9u3ajrjlhs73c3ed5g. Final deployment738e58e / dep-dba5h3142hec73d9arbg is LIVE.

Seller estimates, admin live-order/refund/subscription/audit views, buyer refund requests, approval/version guards, timer suspension/restoration, verified full/partial cancellations and access effects are connected. Uncertain cancel outcomes reconcile through GET and never automatically repeat POST. Default NNX_LIVE_REFUNDS remains disabled and requires the existing live-payment contract/key gates. Actual payout transfers are not implemented by this release. General-payment webhook pointers are durably queued/deduplicated and verified through provider lookup; no general-payment HMAC signature is invented. Register https://novanoxx.com/api/auth/finance/webhook for the contracted live MID when available; bounded polling uses the existing worker, no new service. Estimates after refunds do not settle contractual PG refund costs. No real charge, refund or transfer was executed. See production186-report.json.


## Recovery and analytics release 187 (2026-10-18)

005 explicitly adds card-reauthorization requests, owner repayment attempts and aggregate daily views after the871131-byte/88-table/5-file snapshot. Final5b347d9 / dep-dba5vu2vcj2c739tabt0 is LIVE. Only the existing schema_version changes; other87tables and5files match. No financial flags or paid resources changed.

Card replacement issues and stores a newly verified encrypted billing credential without charging. Definite failed cycles allow owner-confirmed, amount/period-bound repayment only after exact not-found lookup; uncertain attempts only reconcile via GET. Successful repayment starts a fresh monthly period with displayed terms and closes the old failed cycle. TEST archive assets do not consume operating plan limits. The creator dashboard reports live approved sales/current refunds, current favorites and aggregate views from activation for7/30/120KST days. Views persist only asset/day/count; dedupe uses ephemeral account keys and no IP. Old aggregates are removed when a new view is recorded. Published history only is listed; drafts and TEST archives remain preserved.

Essential embedded-PG integration, owner/amount/duplicate/unknown-response cases, scoped analytics, prior finance/order/delivery/subscription regression and empty-state UI checks pass with mocked providers. No operating payment/card/recovery transaction was created. Actual billing activation and first real owner flow remain pending. Membership withdrawal and seller bank registration/payout result/provider integration remain unimplemented; do not mark the whole stage complete. Official billing reference: https://docs.tosspayments.com/guides/v2/billing and exact lookup errors: https://docs.tosspayments.com/reference/error-codes . See production187-report.json and the two screenshots.
