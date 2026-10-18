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


## Account withdrawal and developer notes release 188 (2026-10-18)

Runtime e63d9c5 / dep-dba7bv5g1s2s73b1s6lg is LIVE at 07:33:08 UTC. Explicit006 follows the881110-byte/91-table/5-file preservation snapshot. Only schema_version changes; other90tables and all5files match. Two new empty tables hold withdrawal tombstones and separately retained minimum identity. No real account was withdrawn and no financial transaction was created.

Self-service requires the current owner session, a login within ten minutes, same-origin JSON, a session-bound expiring challenge, acknowledgement and DELETE. Obligations and administrator responsibility block final withdrawal. Completed seller orders remain blocked until actual payout evidence exists; review approval never proves payment. Finalization clears normal account/profile/credential/analytics access, prevents administrator reactivation and background billing/mail, and preserves transaction/TEST/file references. Minimum completed-transaction identity is separately retained with a five-year expiry; this does not introduce automatic destruction of all pre-existing transaction, dispute, file or backup records. Existing legal/public-release checks still apply.

An isolated restore must fetch the current withdrawal registry, reapply deletion before any serving transition and purge expired retained identity. Registry unavailability blocks the restore. Prepare compatible additive schema before filtering older backups. Embedded PG and UI checks pass, with no real account deletion/provider calls. An unrelated optional saved-list HTTP check hit localhost EACCES; elevated rerun was rejected by automatic review and not retried. The historical result was restored from its manifest-verified identical preserved copy; its current failure evidence remains separately preserved.

The public developer page now shows stage10, seven implemented items and the remaining seller bank registration/payout-result/provider integration. Full stage completion and real payment/billing/refund/payout activation remain pending. No new paid resources or fixed fees; ordinary usage charges remain possible. See production188-report.json and screenshots.


## Seller payout preparation and TEST coverage release 190 (2026-10-18)

007 is explicitly additive after the 93-table/5-file,885030-byte operating snapshot. Five empty tables add encrypted seller registration, registration attempts, payout reservations/results, audit events and signed webhook pointers. Existing TEST source is ancestor372fe717; actual TEST source206files match it (two environment templates are intentionally omitted by Docker). No TEST-tracked path is removed:172identical,36updated for operating authority/UI and38new operating files. Final operating source is870f011; verify its246tracked paths against the live artifact, with only the two template exclusions. This is a source/deployment audit, not manual verification of every user/page combination.

Seller registration/update requires a separate approved payout contract, dedicated Toss live payout secret/security keys, independent local encryption key/id and confirmed recovery copy. Account input stays disabled until those conditions hold. Local payloads use AES-GCM bound to user id; API v2 POST uses direct A256GCM JWE with iat/nonce and Basic auth. Read APIs return masked account details; raw contacts/accounts are not logged or returned. Identity/KYC status comes from verified provider queries. Uncertain registration/update blocks another POST until lookup resolves it. Business type/registration-number changes require support.

Payouts are manual: verified completed order/current payment balance, no open refund/dispute, allowed settlement hold, amount-bound review approval and a fresh seller/account-version/balance check precede one durable reservation and one stable-idempotency POST. Results REQUESTED/IN_PROGRESS are not marked paid. Uncertain responses only query by provider/ref identifiers and never repeat a transfer automatically. Only verified COMPLETED adds paid totals and satisfies matching seller withdrawal obligations. Failed/canceled requests require a fresh explicit review. Approval can be withdrawn locally before posting; no local cancellation claims to undo a posted transfer. Payout reservations/completion prevent automatic refund execution; after-payout refunds, external chargebacks and recovery require contractual/manual support review.

Approval/execution is restricted to the designated operator novanoxx2026@gmail.com, not inherited TEST administrator identities; role delegation staysPhase2. Provider webhook HMAC validation covers raw body and transmission time, multiple v1 signatures and a replay window; only pointers/digests persist, followed by provider GET verification. The existing worker performs bounded lookups only. No automatic transfer scheduler is enabled.

Activation settings: NNX_SETTLEMENT_CONTRACT_APPROVED,NNX_PAYOUTS_CONTRACT_APPROVED,NNX_TOSS_PAYOUT_SECRET_KEY,NNX_TOSS_PAYOUT_SECURITY_KEY,NNX_PAYOUT_DATA_ENCRYPTION_KEY(32-byte base64),NNX_PAYOUT_DATA_KEY_ID,NNX_PAYOUT_KEY_RECOVERY_CONFIRMED and NNX_LIVE_PAYOUTS; matched ordinary live payment/reconciliation settings remain required. Preserve both payout key recovery materials separately. Register https://novanoxx.com/api/auth/payouts/webhook for seller.changed/payout.changed on the contracted payout merchant. No actual settings/keys were activated by this release. Contract capability/MID/API version, disclosure/consent and provider authentication must be confirmed before the owner's first actual flow. The provider can charge fees for live payout requests; no real registration, transfer or fee-bearing provider check was executed here.

Essential embedded-PG/crypto/HTTP/UI, finance/subscription/withdrawal checks:12pass;1270registered translation keys, additional-locale missing0. Existing operating/TEST/files/original dirty checkout remain preserved. No new paid resource, scaling or fixed monthly fee. Evidence: production190-report.json, TEST/runtime manifests and test190-operating-coverage.json.

Official references: https://docs.tosspayments.com/guides/v2/payouts ; https://docs.tosspayments.com/reference/additional ; https://docs.tosspayments.com/reference/using-api/webhook-events ; https://docs.tosspayments.com/codes/org-codes .


190 최종 운영 반영: 870f011 / dep-dba855rrjlhs73cb4tq0, 2026-10-18 17:26:54 KST LIVE. 기존 93개 테이블 중 schema_version 표식만 변경, 파일 5개 변경 없음, 빈 지급 테이블 5개 추가. 운영 메일은 발송 키·암호화키·webhook 비밀값이 없어 비활성 상태이며 별도 외부 설정 대기. 지정 금융 관리자 계정의 지급 목록 서버 조회 정상, 다른 로그인 계정 접근 제한. 개발자노트 중앙 오차 0px/1040px, 기존 마켓 8/3/4 보존. 자세한 증빙은 production190-report.json 및 두 기존 인수인계 190번 참조.


## 191 — Operating mail enabled (2026-10-18)

Owner approved the existing domain-scoped sending credential and single free webhook cutover from TEST to https://novanoxx.com/api/auth/mail/webhook. Dashboard added seven mail variables and redeployed the existing 870f011 image once: dep-dbaa0sjrjlhs739foqd0 live 10:33:55Z. Public HTTPS mail status is enabled=true and the worker is unpaused. From no-reply@notify.novanoxx.com, Reply-To support@novanoxx.com. No messages were sent in this activation, so new delivery receipts remain unverified.

Pre-activation snapshot /data/.stage10-release191-20261018 contains 98 tables, five files and an 898577-byte database dump. All original table/file fingerprints match after activation. Twelve new public mail tables were created by the existing runtime. TEST remains unchanged with its current mail disabled and send paused. Production encryption key is separate, Windows-DPAPI protected and has a verified encrypted USB copy; actual offline private-key recovery was not exercised. Never disable enabled verification; pause sending instead. Preserve mail configuration/key fingerprint, tokens, queues and TEST budgets. No new paid resources or fixed fees; provider Free limits and paid-overage-off retained. See mail191-report.json and handoff191 for precise boundaries.


## 193 — Transaction notification and verified-capture completion audit

Final operating runtime b52716c26ca34db5a4752cb9b8ee908835e8f6d8 / dep-dbaaejlg1s2s73b4d990 live 2026-10-18T11:03:31Z. Snapshot /data/.stage10-release193-20261018 preserved 110 prior tables, five files and a 910654-byte dump; final comparison changed only schema_version and added notification_outbox. All original files and the 675 dirty-checkout fingerprints remain intact. Financial flags remain disabled.

Migration008 queues only newly emitted verified operating events transactionally; the existing mail worker moves intentions into the encrypted mail queue atomically and deduplicates source keys. No historical TEST events are replayed. Ordinary provider timeouts/ambiguous responses now require GET reconciliation; money POSTs are not automatically repeated. Financial administration defaults exclusively to the nominated owner. Captured but unlinked payments remain recorded/held with no file rights and can proceed through reviewed refunds rather than disappearing from the local refund workflow.

Twenty necessary isolated checks and 1272-key translation coverage passed with no real financial calls or new mail sends. Runtime248 files match, with two intentionally excluded environment templates. TEST ancestry has no missing tracked source paths. Subscription payment refunds and external billing cancellation reconciliation are still unimplemented pending the owner policy choice; already-paid seller fund recovery/chargeback terms require the contract. This release is not a claim that replacing a key alone completes every financial or launch condition. Full source/verification boundaries are in production193-report.json and handoff193.


## 194 — Reviewed subscription refunds

Owner approved member requests and administrator review of amount/access with no automatic proration. Operating runtime a189e64dd4772a77c3a29d135c50563cac43f4b5, deploy dep-dbabksflk1mc73cm59m0 live 2026-10-18T12:25:09.290217Z. Migration009 added billing_payment_sync, subscription_refunds and subscription_refund_events after preserving111 tables/five files and a913541-byte dump. Only the existing schema_version marker changed; original files/data remain intact. No financial flags were enabled and no provider money calls or new emails were sent. A dedicated NNX_LIVE_SUBSCRIPTION_REFUNDS gate supplements existing live billing/refund gates.

Member creator-plan and administrator operations finance panels expose the workflow. Requests explicitly stop future renewal. Shared subscription holds block renewal/retry/card changes; duplicate or uncertain cancellation results reconcile through provider GET. Full refunds end only their matching paid period, partial refunds require an access decision, and old-cycle refunds cannot end newer paid access. External cancellation hints use the existing finance webhook and require provider proof. Pending refunds/external-review obligations prevent withdrawal. Only the nominated owner can review or execute.

Twenty-three necessary isolated checks and1283-key translation coverage passed; private financial UI/money execution is not claimed as fully verified on operating provider accounts. Runtime253 files match plus two deliberately excluded environment examples. No TEST source path was lost. Existing contract/MID/key/webhook/KYC/first-owner-transaction, post-payout recovery terms and release/legal/offline-restore conditions remain. See production194-report.json and handoff194; this supersedes193 subscription-refund policy/development pending statements without rewriting historical evidence.


## 195 — Common MVP completion audit and exact post-contract work

확정된 공통 MVP 기능의 추가 필수 코드/배포 누락은 이번 대조에서 발견하지 않음. 계약 의존 미구현과 독립 출시 검수/소유자 참여 항목은 아래처럼 별도 유지.

Current runtime a189e64dd4772a77c3a29d135c50563cac43f4b5 / dep-dbabksflk1mc73cm59m0 remains LIVE. Current source after that runtime differs only in documentation; no newly missing runtime/TEST source paths were found. Public health, all existing connections, provider-configuration flags and mail status returned200. These GETs do not replace real financial or Naver-public-review evidence. No runtime edits, deployments, new tests, payment/provider calls, emails, infrastructure or data changes were needed in this audit. Existing194 isolated checks/source fingerprints are reused, not claimed as newly rerun.

### After the contract reply

**일반 상품·Brief 직접 결제 — IMPLEMENTED_DEPLOYED**
계약된 자금 흐름과 MID/결제창형 연동 권한·운영 키를 확인하고 일반 결제 승인/조회·환불을 활성화. 기존 TOSS_* TEST 키를 운영 키로 덮어써서 활성화하지 않음.
Configuration names (never paste secret values into chat/repo): NNX_TOSS_LIVE_CLIENT_KEY, NNX_TOSS_LIVE_SECRET_KEY, NNX_PAYMENT_CONTRACT_APPROVED, NNX_OPERATING_RECONCILIATION_APPROVED, NNX_LIVE_PAYMENTS, NNX_LIVE_REFUNDS
Provider webhook: https://novanoxx.com/api/auth/finance/webhook
https://novanoxx.com/api/auth/commerce/return (서버가 회차/요청별 successUrl/failUrl 생성)
Owner verification: 본인이 첫 결제·취소/환불 실행, 주문1개/권한/수수료 원 미만 버림/정산 보류와 제공자 내역 대조.

**구독 자동결제·실패 복구 — IMPLEMENTED_DEPLOYED**
자동결제 계약과 해당 MID의 운영 키를 일반 결제와 구분해 등록. 별도 빌링키 암호화 키 및 복구 사본을 보존한 뒤 자동결제 동의·카드 등록·첫 청구 확인.
Configuration names (never paste secret values into chat/repo): NNX_BILLING_CONTRACT_APPROVED, NNX_TOSS_BILLING_LIVE_CLIENT_KEY, NNX_TOSS_BILLING_LIVE_SECRET_KEY, NNX_BILLING_ENCRYPTION_KEY, NNX_BILLING_ENCRYPTION_KEY_ID
Provider webhook: https://novanoxx.com/api/auth/finance/webhook (해당 빌링 MID에도 등록)

Owner verification: 최초 등록/회차 청구/다음 청구일/해지 예약/한도, 실패 확정 후 본인 재결제와 불명 결과 조회. 일반 결제 활성화도 선행. 키 하나로 자동 활성화하지 않음.

**구독 결제 환불 — IMPLEMENTED_DEPLOYED**
일반 환불·빌링 활성화와 계약 확인 후 구독 환불 전용 승인 설정. 회원 신청→관리자 금액/이용 기간 검토→승인액만 환불, 자동 일할 계산 없음.
Configuration names (never paste secret values into chat/repo): NNX_LIVE_SUBSCRIPTION_REFUNDS
Provider webhook: https://novanoxx.com/api/auth/finance/webhook

Owner verification: 부분/전액 결과 및 해당 기간 권한 확인. 진행 중인 환불 중복 POST·자동갱신 방지 확인.

**판매자 계좌·지급 — COMMON_ADAPTER_IMPLEMENTED_DEPLOYED_CONTRACT_COMPATIBILITY_PENDING**
지급대행 계약·권한·지급 가능 자금 출처/주기 확인. 전용 운영·JWE 보안키 및 별도 계좌 암호화키/복구 사본, 판매자 신원·계좌 인증(KYC) 확인. 계약 API가 준비된 v2와 다르면 해당 차이 추가 반영.
Configuration names (never paste secret values into chat/repo): NNX_SETTLEMENT_CONTRACT_APPROVED, NNX_PAYOUTS_CONTRACT_APPROVED, NNX_TOSS_PAYOUT_SECRET_KEY, NNX_TOSS_PAYOUT_SECURITY_KEY, NNX_PAYOUT_DATA_ENCRYPTION_KEY, NNX_PAYOUT_DATA_KEY_ID, NNX_PAYOUT_KEY_RECOVERY_CONFIRMED, NNX_LIVE_PAYOUTS
Provider webhook: https://novanoxx.com/api/auth/payouts/webhook

Owner verification: 판매자 인증·계좌 등록 후 본인이 첫 지급 실행. 제공자 이체 결과/정산 내역 일치와 불명 결과 재송금 차단 확인. 수수료/예치·지급 자금/정산일은 계약 확인 전 임의 확정 금지.

**실운영 NEON 충전·잔액 결제·잔액 환급 — TEST_WALLET_ONLY_OPERATING_MONEY_LEDGER_NOT_IMPLEMENTED**
선불 충전·보관·환급 허용 여부, 한도/부분 사용/환불/정산/해외 결제 조건을 계약으로 먼저 결정. 허용되는 모델에 맞춰 실운영 충전 원장·잔액 차감/환급·주문 정산 연결을 추가 구현. 직접 원화 PG 구매 경로와 별개이며 키 교체로 완료되지 않음.
Contract-dependent implementation; there is no activation flag that completes this feature.


Owner verification: TEST 잔액/기록을 실운영 유상 잔액/권한으로 이관하지 않음. 일반 직접 결제 허용 계약만으로 NEON 선불 충전을 활성화하지 않음.

**송금 완료 후 환불금 회수·차지백/상계 — AUTOMATIC_RECOVERY_NOT_IMPLEMENTED_CONTRACT_POLICY_PENDING**
회수 주체·판매자 동의/책임·충당금·잔액 부족·차지백/상계 조건과 API를 확정한 뒤 필요한 회수·부채 원장/대사 처리를 추가 구현. 지금은 송금 중/완료 주문 자동 환불 차단과 운영 검토 유지.
Contract-dependent implementation; there is no activation flag that completes this feature.


Owner verification: 무조건 환불/송금 우회 버튼을 추가하지 않음. 일반 환불 활성화가 회수 기능 완료를 의미하지 않음.

### Independent launch and owner items

- NAVER_PUBLIC_REVIEW: 설정·개발 멤버 로그인 확인과 일반 이용자 대상 검수/승인은 구분. 임의 신청/제출하지 않음.
- CONTENT_AND_LAUNCH_REVIEW: 정식 개인정보 위탁·국외이전 등 법률/모국어 감수, 전체 브라우저·접근성/123동선 검수는 완료 주장 없음. 등록 번역1283키 누락0은 모든 미표시 레거시 문구와 모국어 감수 완료를 뜻하지 않음.
- OWNER_OFFLINE_RECOVERY: 기존 격리 복원과 암호화 USB 사본 보존 확인은 완료. 소유자 오프라인 개인키로 실제 복호화·재해 복구는 미실행. 운영 DB 교체 없이 소유자 참여 검수가 필요.
- CONTEST_PUBLICATION_INPUT: 기능은 연결됨. 실제 콘테스트 일정·심사 기준·상금/혜택·수상자 입력은 운영자 업무이며 임의 생성/공개/상금 지급하지 않음.
- PHASE2: 관리자 담당 계정별 역할 위임은 Phase2. 최근 본 목록/선택형 마케팅 이메일/검색 결과 없음 분석 등 후순위 항목은 현재 MVP 필수 개발에 포함하지 않음. 혼합결제·AI자동화/의미검색/실시간3D·채팅·앱 추가 없음.

Activation order: agree money model and fees/limits → preserve current database/files and existing keys → configure the contracted ordinary MID and its webhook → owner confirms first purchase/order/rights and refund → configure separate billing credentials/encryption/recovery and owner billing/refund checks → configure payouts/KYC/funding/webhook and owner first payout. Keep all inactive gates off until their own prerequisites pass. NEON and post-payout recovery need agreed design/code before activation. Use actual contracted API/key type; this site uses payment-window payment(), so do not substitute an unrelated widget-only key.

This audit creates no new paid resource or fixed fee. Contract fees, card/PG processing fees, billing/payout charges, funding and any storage/compute expansion must be checked and announced before activation. Existing ordinary resource usage still applies. Mail is already enabled; preserve its key/webhook and pause rather than disable if maintenance is needed.
