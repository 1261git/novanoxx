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


## 196 — Targeted launch/accessibility review

Runtime febe712c5a583cafaaadd8682137b2de07d248e4 / dep-dbaclpu7bikc73eg8re0 live 2026-10-18T13:35:30.465851Z. Frontend-only: translated skip link, route-heading focus (including asynchronous/early-return pages), profile disclosure state/Escape return, keyboard outlines and Brief placeholder contrast3.97→7.947. Operating desktop9/mobile390px5 screens and local320px7 screens plus six languages were checked. Relevant UI12 checks and1284-key translation coverage passed. Public file fingerprints match; index is compared after the existing production-page canonical transform. Health/mail remain healthy; no financial/DB settings or operating accounts changed. No new paid resource/fixed fee. This is not a full123-flow/WCAG/native-screen-reader/iOS/Safari/200%-zoom certification.

Owner actions:

**NAVER_REVIEW**

1. 네이버 개발자센터→Application→내 애플리케이션→기존 NovaNoxX 앱에서 현재 검수 상태 확인. 이미 승인됐다면 중복 신청하지 않음.
2. 개발 중/반려 상태라면 앱 소유자 또는 기존 테스터로 novanoxx.com의 네이버 로그인 버튼부터 로그인 완료까지 진행하고 각 화면 캡처. 본인 비밀번호/추가 정보제공 동의는 직접 처리.
3. 앱 이름/브랜드 로고, 서비스 URL https://novanoxx.com, 기존 callback https://novanoxx.com/api/auth/naver/callback 확인. 조회 권한을 임의 추가하지 않음. 코드가 사용하는 식별자·이메일·닉네임의 실제 계정/화면 활용처 자료 준비.
4. 검수 상태 탭에 로그인 과정·정보 활용처 자료를 첨부한 뒤 소유자께서 최종 검수 요청과 결과 확인. 반려 사유가 있으면 해당 부분만 수정.

이번에 앱 설정 변경·OAuth 동의·계정 연결·검수 신청은 실행하지 않음. 설정 true나 개발 멤버 로그인은 일반 이용자 승인 증거가 아님. 네이버 로그인에 별도 서비스 비밀번호를 요구하지 않는 현재 OAuth 흐름 유지.

Official reference: https://developers.naver.com/docs/login/verify/verify.md

**OWNER_RECOVERY**

1. 보관 중인 암호화 USB 사본과 소유자 오프라인 복구 개인키/암호문 및 잠금 암호를 소유자 기기에 준비. 키/암호는 채팅·저장소·서버 환경변수에 전달하지 않음.
2. 소유자께서 로컬에서 복구키 잠금을 해제한 뒤 암호화 사본을 빈 비공개 대상 폴더로 복호화. 파일 목록·무결성 지문을 대조하고 암호키 값은 로그에 남기지 않음.
3. 복호화 결과는 격리 복구 대상으로만 검수. 현재 탈퇴·수집 철회 목록을 재적용하고 수집/메일 발송/금융 작업을 비활성으로 유지. 운영 DB 주소나 파일 경로를 복구본으로 바꾸지 않음.
4. 최종적으로 사본 읽기·복호화·DB/원본 파일 무결성 및 복원 제외 조건이 확인됐는지 기록. 추가 저장 공간/서비스가 필요하면 먼저 용량·비용 안내. 실제 장애 복구 전환은 별도 결정.

이번에는 복구키 잠금 해제·실제 복호화·복원본 생성/운영 교체를 실행하지 않음. 기존 보존본 읽기와 격리 복구 증거를 새 소유자 복구 확인으로 대체하지 않음.


## 197. 2026-10-19 — 남은 출시 검수·네이버 검수 자료 준비

- 운영 코드 d1a552f52874ad321ce0baa2e474edc6b2ec7951 / Render dep-dbadr83m8hqs73b9p1dg, 2026-10-18 23:55:23 KST LIVE. 프런트5파일 배포: 프로필 메뉴 첫 클릭이 hover에 의해 닫히던 오류 제거, 관리자 검토 종류/대상 종류 입력 이름과5언어 번역, 개발자노트 갱신. DB 스키마·금융 코드/플래그 변경0. 새 유료 자원/추가 고정요금0, 일반 자원 사용량은 적용.
- 실제 운영 확인: 기존 Google 관리자 및 Naver 계정 로그인, 크리에이터7화면·관리자 금융4탭·정책/보호7화면, 내부 링크76개(알 수 없는 경로0), 관리자 이름 없는 입력0, 메뉴 첫/두 번째 클릭·Escape 복귀. 비동기 로딩이 끝난 제목/패널만 채택. 공개 콘테스트 없음 보호 화면 정상이며 응모/공개를 실행한 것은 아님. 추가 번역1286키/4언어 누락0, 정적 안내20조합 확인. 변경5파일 운영 지문 일치, health/mail 정상, 배포 후 오류 로그0.
- 보존: 원래 미커밋675지문 변경0. 운영/TEST 상품·거래·파일 자료 유지. 실결제/환불/송금·실계정 생성/탈퇴·수집 동의 변경·복구 전환0. 기존 계정 로그인 및 조회 감사 기록은 정상 생성됨. 로컬 합성 계정 검수 후 미리보기 종료.
- 네이버 기존 앱 KE9qQLch0JTK3R6vaKL9는 실제 개발 중. 기존 세션으로 로그인 성공, 새로운 비밀번호/동의 필요 없었음. 요구 정보 이메일/닉네임의 화면 활용처와 로그인 절차를 캡처. 비공개 자료 위치: D:/AI asset market/novanoxx-stage10-evidence-20261017/naver197-submission/제출안내.html 및 NovaNoxX_네이버검수자료_2026-10-18.zip. 저장소/공개 사이트에 자료를 올리지 않음.
- 소유자 제출 절차: ZIP 압축 해제→안내 확인→열어 둔 네이버 검수 탭의 제공 정보 활용처에03-email-nickname-usage.png, 로그인 절차에01-login-entry.png와02-naver-login-complete.png 첨부. 서비스 유형/규제 업종 해당 여부/결과 이메일을 본인이 확인하고 최종 검수 요청 직접 제출. 각 PNG5MB 미만. ZIP/HTML은 첨부 대상 아님. 파일 업로드/체크박스 선택/검수 요청은 아직 실행하지 않음. 기존 계정 로그인 검증이며 신규 실제 가입/일반 이용자 승인 완료를 뜻하지 않음. 03화면의 카카오 추가 연결은 선택 기능이며 네이버 필수 절차가 아님. 공식 기준 https://developers.naver.com/docs/login/verify/verify.md .
- 남은 구분: 네이버 소유자 최종 제출/결과, 소유자 오프라인 키 잠금 해제와 격리 복구, 실제 보조기기/iOS/Safari/200% 확대 및 전문 법률/모국어 감수. 이 환경의 확대 단축키는 실제 배율 변화가 없어 확대 검수 완료로 보지 않음. 전체123동선/WCAG 인증/10단계 전체 완료로 확대하지 않음. 계약 의존 NEON 실운영 원장·송금 후 회수 미구현 및 PG/빌링/지급 계약·운영키/웹훅/KYC/첫 실거래 확인 유지. 콘테스트 실제 일정/상금 입력과Phase2 위임도 기존 구분 유지.
- 증빙 production197-report.json, production197-source-report.json, release197-browser-report.json, translation197-report.json. 기존 두 인수인계에197 추가, 별도 인수인계 파일 생성 없음.


## 199. 2026-10-19 — 운영 전체 암호화 백업 완료·TEST 서버 중지 가능 여부 확인

- 운영 코드 d1a552f52874ad321ce0baa2e474edc6b2ec7951 그대로, 배포/증설/설정 변경0. 기존 백업 덮어쓰기/삭제0. 원래 미커밋675지문 변경0. 기존 운영114테이블·업로드5파일·TEST 자료 보존.
- 새 운영 백업: 2026-10-18T16:29:25.506Z UTC(2026-10-19 KST), 서버 /data/.private-nnx-backups/full199-SI5AOY 및 /data/.private-nnx-backups/packet199-aGTrG7. 코드255파일 tar.gz 76,359,457bytes, PG custom dump926,362bytes(검색/유입 원문은 제외하여 별도90일 보관), 업로드5파일553,174bytes, 일관성 SQLite online backup/integrity_check, 운영 환경설정/암호키를 포함한 설정은 암호화 상태로만 보존. env 예시2파일은 기존 Docker 미설치로 제외. 과거 백업 폴더/TEST2.89GB는 중첩 복사하지 않고 기존 위치에 유지.
- 외부 R2 novanoxx-private-backups / bundles/operating-candidate/a35dd932-c81c-40b4-b776-322546e63bb7/ 에12객체 78637977bytes(약78.64MB). indexAnchor 01f4f3b4e5bb724ddfe77d3e7bb852157fc491aaee74452eaf4eb3849a34d1e0. 기존 소유자 RSA3072 공개키(e4548fb47ea36e667dc915546b457d3559e538a0305533663e7b361f0eede6df)로 복구 메타데이터 봉인, AES256GCM 데이터 암호화. 각 암호문 외부 저장 후 재읽기 지문 확인, 로컬 평문/암호문 인증 확인. 키 값은 출력/저장소 공개하지 않음. raw discovery-v1/1792340935712.json.enc 716bytes, 이벤트0, 만료 2027-01-16T16:28:55.712Z; 기존90일 정책의 별도 namespace 사용. 수동 주 백업은 기존 자동 daily7/weekly28 정리와 별도 보존.
- 일관성: 기존 cooperative gate로 요청 배수 후 캡처,114테이블 행/카탈로그와 업로드 전후 지문 동일. DB 아카이브 목차와 전체 섹션 pg_restore decode 성공, SQLite integrity ok, 소스 tar 파일목록 대조. 이후 gate 해제, 임시 원문 작업폴더 제거 확인. 실제 소유자 오프라인 개인키 잠금 해제/전체 새 DB로 복원은 미실행이며, 파일 인증/아카이브 판독을 전체 재해복구 성공으로 확대하지 않음. 복구 시 새 격리대상에서 탈퇴·철회 목록을 재적용하고 메일/금융 비활성 유지. site-source.tar.gz는 앱 경로, data/*는 DATA_DIR로 구분; legacy SQLite를 운영 PG에 덮어쓰지 않음. runtime-settings.json의 플랫폼ID/임시소켓은 복구설정으로 그대로 재사용하지 않음.
- 사후 health200/production/postgres/기존연결true, 메일enabled=true, 소셜3개 설정true. 금융 실행4플래그false 유지, 운영 환경에 TEST 서비스/DB 참조 없음. 서버 여유5,037,412,352bytes. 외부 기존10,854,097bytes+이번78,638,693bytes=약89.49MB 예상(다른 정기 작업에 따라 변동 가능). 새 유료 자원/용량증설/추가 고정요금0, 일반 저장/전송/요청 사용량은 해당 계정 포함량 및 정책 적용. 계정 전체 최종 청구서0원을 보증한 것은 아님.
- TEST 실제분리: srv-db6essivcj2c73fu6460 / commit372fe7175ed4345b872e10a45c8d0acec2fae63f, 전용disk dsk-db83ih8n74is73dlco40 5GB /var/data, 전용DB dpg-db6esfivcj2c73fu4re0-a 1GB. review환경 실제DB nnx_review_20261018, DATA_DIR /var/data/nnx-review-20261018. SANDBOX_PG_URL에서 유도되므로 초기 DATABASE_URL 직접 조회는 undefined였고, review-environment.config()로 실제 연결을 재확인함. 운영DB 참조0/메일발송false·pausedtrue/backup automationfalse/autoDeployoff.
- TEST 디스크 총2,888,741,522bytes: nnx-isolated2,886,273,585, nnx-mail-evidence2,451,445, nnx-review-20261018 16,492. 해당 파일/시험기록 삭제0, 별도 외부 TEST 전체 백업을 만든 것은 아님. 운영백업 약78.64MB가 TEST 자료까지 포함한다는 안내 금지.
- 결론: TEST 웹 서버만 Suspend하고 이 전용DB·디스크·환경변수·브랜치를 유지하면 운영 사이트와 자료를 보존하면서 중지 가능한 구성. 이번 사용자 요청은 중지 가능 여부 확인이므로 실제 중지/삭제하지 않음. TEST 서버를 중지해도 전용DB·디스크의 기존 유지 요금은 남음. DB·디스크 삭제는2.89GB 시험자료 별도 반출/복구 검증·소유자 결정 전 진행하지 않음. 다른 단기검증2서비스는 이미 suspended. 재개 시 동일 전용DB/디스크와 메일/금융 차단 확인.
- 증빙 backup199-report.json, full-backup199-receipt.json, full-backup199-postcheck.json, test199-isolation.json, production199-health.json. 기존 두 인수인계에199만 추가, 새 인수인계 파일 없음.

- 199 최종 공간 정리: 외부/서버 완성 packet의 각 SHA256을 재대조한 뒤 이번 full199 캡처의 중복 암호문10개78,027,442bytes만 제거. 과거 백업/운영/TEST 원본 변경0. captureRoot에는 감사 manifest만 남으며 복구 원본은 packet199-aGTrG7 또는 외부 동일 packet을 사용. 최종 서버 여유5,115,461,632bytes(약5.12GB), 서버 신규 사용 약79.0MB/외부 완성본78.64MB.


## 200. 2026-10-19 — 미완료 항목 재정리·오늘까지 개발자노트 운영 게시

- 사용자 요청으로 기존 MVP 코드·계약 차단·운영 배포·인수인계195~199를 대조. 실제 추가 구현2개(NEON 유상 충전/잔액/환급 운영원장, 지급 완료 후 환불금 회수/부채·상계·대사)와 구현된 일반 PG/자동결제/환불/지급의 운영 활성화·첫 실거래 확인을 구분. 키 교체만으로 전부 완료되는 것으로 표시하지 않음. 계약 최종 API 차이는 추가 반영 필요.
- 개발자노트 assets/developer-notes-data.js와 표시기 assets/developer-notes.js 2파일만 변경. 최근 갱신2026-10-19, 오늘의 개발/검수·네이버 제출·최신78.6MB 백업·TEST분리 확인을 통합 기록. 기존 날짜별18개 기록 유지, 구현/범위확인10개는✓, 남은9개는○로 표시. 체크는 실결제·출시 전체 완료를 뜻하지 않는 설명 추가. 개인정보·복구키·서버ID/DB주소·외부백업 경로/지문은 공개 노트에 싣지 않음.
- 운영 07828690ee3f5940cf742375fb52fe59452e5566 / dep-dbafbcjrjlhs73ci9h10 LIVE 2026-10-19 01:37:52 KST. Render 기존 서버로1회 배포, 새 유료자원/용량증설/추가 고정요금0, 일반 빌드 사용량 발생. DB·금융/메일설정·TEST서비스 변경0. 운영 수정2파일 지문 일치, health200/PostgreSQL/기존연결true, 메일enabled=true, 실제 운영노트 날짜와○9/✓10·가로넘침0 확인. Node syntax·diffcheck 통과, 원래 미커밋675지문 변경0.
- 현재 잔여:①계약조건 후NEON원장 추가개발②지급후회수/상계 추가개발③일반PG/빌링/환불/지급 계약·운영키·웹훅·암호화/복구키·판매자KYC/자금/소유자 첫 실제거래④네이버 검수 결과⑤소유자 오프라인키 실제복호화·격리복원⑥실제 화면읽기/iOS·Safari/200%확대·전체거래동선 및법률/모국어감수⑦실제콘테스트 일정/심사/상금·혜택입력⑧Phase2 관리자역할위임⑨TEST웹서버 중지 결정(분리확인만 완료). 최근 본 목록·선택형 마케팅메일·검색결과없음분석 등 후순위 추가는 현 MVP 필수 개발로 확대하지 않음.
- 네이버 이력 정리:197 추가 당시 사용자 제출 보고만 있었지만, 후속 브라우저에서 검수요청/최종요청2026.10.19와 계정설정 마스킹 이메일을 직접 확인했음. readiness의 미제출/직접미조회 오래된 표현을 해당 접수 확인으로 보완. 이번 새 신청/설정변경 없음, 일반 이용자 승인 완료 아님.
- 기존199 전체백업은 노트 게시 전 운영 코드d1a552f를 보존하며, 오늘 노트2파일 변경은 이번 Git커밋에 보관. 작은 노트 갱신 때문에 전체백업을 다시 만들거나 기존 사본을 덮어쓰지 않음. 실제 전체PRD/출시/WCAG·소유자키복원 완료로 판정하지 않음.
- 증빙 production200-report.json/production200-source-report.json/developer-notes200-audit.json/developer-notes200-browser.json/developer-notes200.png. 기존 두 인수인계에200추가, 새로운 인수인계 파일 없음.


## 201. 2026-10-19 — 공개 이미지 워터마크·해상도 제한 강화 운영 반영

- 사용자 승인 범위: 공개 미리보기 이미지에 워터마크·저해상도 보호, 구매 원본 보존, 비용 사전 안내·개발자노트 갱신. 기존 서버/FFmpeg만 이용, 새 유료자원·증설·추가 고정요금0(일반 빌드·변환 사용량 적용). 운영 코드 6040e416f92272d6b83f25f3f491ac70841dd98a / dep-dbanat0ae00c739v9pig LIVE 2026-10-19 10:43:03 KST. server.cjs/creator-api.cjs/public-image-preview.cjs/assets/developer-notes-data.js 4파일 배포, TEST배포/금융설정/DB스키마 변경0.
- 공개 미리보기만 실제 이미지픽셀에 로고3위치 합성, 긴변960px 이하·입력보다 확대하지 않는JPEG/q8·메타데이터 제거. 기존 CSS워터마크는 유지. 정적 마켓이미지7개(/assets의 abstract/architecture/car/city/forest/space/perfume-face) 및 승인된 preview/thumbnail의 /api/catalog/file 이미지응답에 적용. 기존 주소·추천/어워드/카드/상세·포스터가 보호응답을 사용. 브랜드로고/아이콘/소셜공유이미지 제외. 영상/음원/PDF 응답은 이번 변경하지 않음. OS스크린샷 차단/DRM으로 설명 금지.
- 구매원본 /api/auth/original/download의 인증·구매권한·private/no-store·Content-Disposition·원본 스트림 코드 동일(줄바꿈정규화 후대조), 관리자/판매자 원본경로도 미변경. 기존업로드5개SHA256이199백업과 모두동일. 정적 소스이미지도Git상 변경0. 공개파일id는 기존 preview/thumbnail+공개상태+보호증명 검사를 통과해야 하며 original kind를 공개하지 않음. 실패시503/Retry-After·원본fallback없음.
- 파생캐시 DATA_DIR/.public-image-previews-v2, 버전+원본내용지문 기반 재사용·동일요청중복합침·직렬변환·최대대기16·FFmpeg1스레드,96파일/32MiB상한·최소여유128MiB. 오래된 생성캐시만 정리, 원본/과거백업 삭제없음. 검수 후cache7개322,504bytes(약0.32MB). 캐시는 재생성 가능하며 원본에 덮어쓰지 않음.
- 필요한 실제 로컬확인: 합성2000x1200→960x576,320x180확대없음,3영역 로고색픽셀2292/2424/2412, 원본지문불변·캐시재사용, 공개GET/HEAD/Range로 원본우회안됨·직접정적주소보호·로고대상제외·손상입력failclosed. 최초일반sandbox localhostfetch권한실패는 실행권한확인후 동일검수재실행PASS. 초기다운로드코드prefix비교는CRLF/LF차이로거짓불일치였고 줄바꿈정규화후동일확인. 새 유료시험없음.
- 운영 실제Linux확인:7이미지200/image/jpeg/image-baked-960-v2/모두960이하(640x960·960x640·960x639·960x912·960x463), 노트원문일치, health200/production/postgres기존연결true·mailenabledtrue, 비로그인 원본401. 현재공개업로드상품0이므로 실제상품 생성/업로드·구매없이 해당공개분기코드+공통변환HTTP로 검증. 합성검수를 실제유료구매증거로확대하지않음. 마켓카드8·표시이미지정상·가로넘침0, 스크린샷market201-protected.png. 기존미커밋675지문변경0.
- 개발자노트2026-10-19에 이번보호기록/체크항목추가, 기존구현·계약·추가개발·승인/복구/기기검수잔여유지. 최신전체백업199와노트200기록보존. 기존두인수인계에201추가, 새인수인계파일없음. 증빙 production201-report.json/production201-public-report.json/image201-test-report.json/image201-preservation.json/image201-browser.json.

- 201 최종 보완/확인: 정적 이미지 원본 우회를 막기 위해 실제 파일 경로를 정규화하고 GET/HEAD 외에는405로 처리. 디코딩된 /assets/%2Fforest.jpg도 보호파생응답이며 POST로원본을받을수없음. 로컬 fixture도 실제서버와같은URL디코딩으로확인. 최종코드 ace0bf95764188ea9ea72287c2ffa6a70b230c07 / dep-dbancr142hec73dqgut0 LIVE2026-10-19 10:47:20KST, 이번총2회배포. 최종7이미지200/960이하·보호헤더, 경로별칭200보호·POST405·비로그인원본401·노트일치·health/mail정상. 운영에첫반영후마지막우회경로점검에서발견한보완이며, 이전201의최초코드/배포를이최종버전으로대체. 원본다운로드코드/원본파일은이보완에서도변경없음. 오류로그0.


## 203. 2026-10-19 — v1.8 계약 회신 없이 가능한 계정 기능·기록 기반 분석 운영 반영

- 운영 최종 a949a7db5da37e9234f5962f52c1633ba890b668 / dep-dbap0nh42hec73drrv9g, 2026-10-19 12:37:53 KST LIVE. 최초 통합 7239ff6/dep-dbaordbm8hqs73bl0elg 후 기존 기록 지표의 누락된 화면 표시를 보완하여 이번 총2회 배포. 새 서비스/요금제/용량증설/추가고정비0, 실제 금융·메일 설정 변경0. Render 34/500분·빌드 초과료0 확인. 기존 전송16.62/5GB·누적전송료1.80USD(당시 계정누적11.82USD)를 배포 전 안내. 계정전체0원이나 사용량비용0원으로 설명하지 않음.
- SH-01 최근 본 에셋: 프로필 메뉴, 계정별 기기 로컬7일/최대30개, 현재 공개목록만 표시·삭제 가능. 서버 추가 조회이력 수집0. SH-02 선택형 메일: price/SOLD/찜한 에셋 크리에이터의 새 공개를 명시적으로 선택. 기본모두해제·재설정시새기준·과거소식소급0. 주간08~21시, 종류별 하루1개 요약, 사이트전체 재시도포함24시간5회/31일100회; 기존 앱발송량80/2400 상한 접근시 새선택형큐 생성중단. 로그인 없는 서명된 철회 링크와 제공자 One-Click 헤더, 발송직전 동의/제한 재검사, 필수메일과분리. 테스트·실회원 대상 실제 선택형 메일 발송0/운영 outbox해당row0. 새public테이블2개 추가, 기존행재작성0.
- SH-04 동의 검색 결과0 키워드·유입도메인7/30/120일 집계. 개인ID/IP/개별원문응답0, 기존120일/원문백업90일·철회삭제 유지. D-08 승인GMV/환불·완료거래수수료·구독결제/환불/순매출·구매자/판매자·평균주문액·동일주문생성기간 승인전환율·활성구독/에셋상태를 관리자 집계로 연결. 실제은행입금/PG비용차감후회계순이익/방문자전환율과구분. 추가개인행동/검색클릭 추적은 기존동의항목밖이므로 자동활성화하지 않음. D-09/D-10 완료독점의 공개후ACTIVE시간 및 승인→COMPLETED를 기록으로 계산. PAUSED/RESERVED·MULTI/Brief판매기간 제외, 과거예약/재개이력불충분표본/완료시각없음은추정하지않음. 현재 운영검색/승인주문/구독결제0건이며 이0건을유료검수성공으로표시하지않음.
- A-06 정정: 기존 creator-draft-wizard.js의 계정/초안별 브라우저자동저장·7일복원이 이미구현. 서버는명시적임시저장, 파일·계약동의자동제출없음. 신규서버자동저장으로중복구현하지않음.
- 탈퇴시 새알림동의/관찰행 정리·기존메일취소. 격리복원시 선택형동의는해제하여 옛동의재활성화방지; 실운영복구/소유자키복호화는미실행. docs/operator-and-api-guide.md에 경로/권한/오류·집계기준·배포/복원·운영매뉴얼 통합. v1.8 PRD와기능정의서 상태도갱신하며123ID유지. 사용자가 Word에서열어둔 기존기능정의서는보존하여 ACM_Function_v1.8_2026-10-19_203갱신.docx/PDF로저장. PRD동일v1.8파일갱신. 새인수인계파일생성0.
- 필요한 확인: 합성SQLite/PG의동의기준·가격/SOLD/신규공개·철회전송차단·서명변조·TEST숨김·개인별권한·검색집계/120일제외·양수거래기간/일시중지·구독부분환불집계·복구동의해제, 기존금융/탈퇴회귀 총9검사PASS. 1323UI키4추가언어누락0(한국어/영어포함6언어). 합성메일운송만사용. 운영health200/PostgreSQL/기존연결true/mailenabledtrue, 새API비로그인401·GET철회405, 노트게시·메뉴각1·기존카드8유지, 콘솔오류0. 현재옆브라우저는일반회원이라관리자UI차단정상; 실제관리자추가로그인/권한부여0. 운영Shell직접읽기로 새SQL전체집계정상 및최종코드확인. 원본5파일SHA256이199백업과동일, 기존미커밋675불변. 임시로컬서버4프로세스종료, 이번 engagement203/ui203 합성fixture9개203917678bytes만경계확인후정리; 기존운영/TEST/백업삭제0.
- 남은 구분: 계약의존 NEON유상원장·지급후회수/상계, PG/빌링/지급 계약·운영키/웹훅/KYC·재원/첫실거래. 해외제공자·환율/국가정책, 추가개인행동/클릭수집범위 결정, 네이버결과·소유자오프라인복호화/전체격리복원·전문기기/모국어/법률검수·Figma원본/외부계정/계약상기술납품물확인은별도. Phase2관리자위임/TEST중지결정유지. 전체123요구/실결제/출시전체완료로확대하지않음.
- 증빙 production203-report.json, public203-report.json, cost203.json, translation203-report.json, engagement.test.cjs, docs18/audit203.json 및렌더페이지. 기존두인수인계203만추가.

## 205. 2026-10-20 — 관리자 전용 대시보드·회원 수·기간별 그래프 운영 배포

- 사용자 요청으로 /#/admin-dashboard 및 관리자 프로필/심사 페이지 링크 구현. 운영 373fed1a417eee543caab81e747a127821d1a81c / dep-dbbb8nqvcj2c739ldr30 배포성공 및 실행커밋 확인. 기존 /#/admin-reviews·심사/거래/환불/정산 관리 유지.
- GET /api/auth/admin/dashboard?days=7|30|120, 기존 root/관리권한 정책 재사용(401/403/405/잘못된기간400). 개인회원/검색원문 행 추가반환0. 계정총수(탈퇴제외),기간가입,탈퇴,가입시각미기록과 기존 상품/구독 금액 및 검색·유입 집계 표시. Asia/Seoul 오늘포함N일 자정~현재,미래기록제외. 일별 가입·LIVE상품승인금액·승인일별현재누적환불·검색 그래프와 접근가능한 동일수치표. 구독은 기존 주기시작일 기준 별도 집계,실제환불실행일별지출/은행입금과 구분. 오래된 가입일추정/개인ID노출없음. 관리자·기존TEST계정은 운영DB계정수에 포함됨을 명시;임의식별/삭제없음.
- 실제 운영 READ ONLY 트랜잭션으로 SQL실행/ROLLBACK 확인: 계정4·가입시각미기록4·기록된기간가입0·30일·승인주문/상품금액/환불0·방문수집false. 과거회원 가입0명으로 확대해석하지 않음. 새이메일/소셜가입 생성시각 기록 경로 기존구현확인. 현재브라우저 일반회원 Uyunia는 관리자접근차단정상,권한/세션변조0. 운영관리자 로그인 UI자체는 이번에새로실행하지않음. 비로그인API401/health200/새화면JS200.
- 방문자 새수집 비활성(null/준비중),기존동의ARRIVAL건수와고유방문자구분. 제안만기록: 회원·비회원포함,브라우저별KST하루1명,30분무활동후새방문,IP미수집,관리/내부확인제외. 개인정보동의/보존/세부수집범위미확정으로자동추적추가0. 여러기기/쿠키삭제중복한계설명필요.
- 필수검사5PASS: KST자정경계/탈퇴/가입시각누락/미래기록제외/권한·기간검증,실제PG방언LIVE/TEST금액분리 및 기존선택형메일·운영집계회귀. 6언어1345키누락0. 합성로컬UI4그래프·7일표·위험문자열텍스트처리·390px화면가로넘침없음. 실메일/실결제/송금호출0. 기존미커밋675changed[]유지. 새DB테이블/자원/요금제/고정비추가0,기존사용량과금유지. 운영·TEST자료/원본파일수정0. 검수합성자료를실제매출로사용하지않음.
- 개발자노트 및 docs/operator-and-api-guide.md 갱신,기존두인수인계205추가·별도인수인계파일없음. 증빙 production205-report.json,translation205-report.json,admin-dashboard.test.cjs. 실제금융활성화·NEON계약의존개발·네이버/소유자복구/전문검수와Phase2권한분리는기존남은범위유지.

## 206. 2026-10-20 — 승인한 방문자·방문 수 기준 운영 적용

- 사용자 확정(회원·비회원,브라우저별KST하루1명,30분무활동후새방문,IP미수집)을 운영 180de03fa793bb5508d5e6ce2ad7029f99006270 / dep-dbbbmp1srm7s73827bv0 LIVE로 반영. Render56.2초 배포성공. 기존 서버/DB 사용,새서비스/요금제/고정비0,사용량에따른DB·전송증가가능은배포전안내. 자동증설없음.
- 방문 통계는기존선택형정책과맞춰명시적허용후집계. 회원·비회원의로그인없는설정과하단허용/거부안내추가. 기존계정연결검색·유입동의는변경안함. 새collection API는동일Origin/JSON/버전/허용필드/512byte검사,IP·계정ID·이메일·페이지주소수집0. 원본브라우저난수는서버저장안하고일자별해시만사용. 관리자/식별가능bot제외(완전한bot차단보장은아님),서버분당300요청·신규일별10만브라우저부하상한;상한초과누락가능.
- 새public.visitor_browser_daily(일자/해시/마지막시각)과visitor_daily_totals(일자/방문자/세션수)만추가. 임시행은마지막활동후48시간정리,일별합계는120일. 동시/중복요청은SQLite트랜잭션/PGadvisorylock으로같은토큰원자적처리. KST자정넘김은하루방문자증가하되30분이내이면세션연속. 클라이언트활동/화면전환시분당최대1회전송,백그라운드지속핑없음. 철회즉시클라이언트전송중단·임시행삭제·지연요청메모리차단,이미집계된개인과연결없는총계유지. 여러기기/브라우저/저장소삭제/재동의는중복될수있음.
- 관리자대시보드7/30/120일에일별방문자합계·방문수카드/일별그래프2개/표추가. 기간고유인원과일별합계구분. 신규배포이후동의한접속만집계,과거방문역산없음. 앞으로전체백업은임시브라우저행데이터제외(스키마/총계만),기존백업불변. 격리복원필터는임시행초기화/120일지난총계제거,실운영복원/새전체백업실행0. 기존검색원문90일백업별도정책유지.
- 필수9검사: 새방문/중복/30분경계/KST자정연속/철회와지연요청차단/48시간·120일만료/허용필드·Origin/관리자·봇제외/SQLite·실PG방언/대시보드해시미노출,기존집계·선택메일·복원필터회귀PASS. 6언어1361키누락0. 로컬실제프런트스크립트확인:동의전0,허용후1브라우저/1방문,새로고침후동일,비회원설정/거부정상. 로컬합성자료는운영에전송0.
- 운영public정책enabledtrue/AsiaSeoul/30분/IPfalse/accountLinkedfalse,health200/visitGET405/관리자비로그인401. 운영데이터설정에독립방문설정/배너표시·콘솔오류0. 서버READ ONLY로최종커밋·30일대시보드·방문합계0/세션0/임시행0·백업임시행제외true확인,ROLLBACK/close. 실제방문늘리는시험0. 실제관리자권한부여/로그인변조/메일/금융설정변경0. 기존미커밋675changed[]유지,운영·TEST자료/원본삭제0. 이번로컬검수서버종료와새합성fixture/검수라이브러리만정리.
- 개발자노트·docs/operator-and-api-guide.md·readiness206 및기존두인수인계206추가. 새인수인계파일생성0. 증빙production206-report.json/public206-report.json/translation206-report.json,visitor-analytics.test.cjs. 기존계약·실금융·외부검수남은범위유지.

## 207. 2026-10-20 — 관리자 일별·시간별 차트·표 보기 개선 운영 배포

- 사용자요청(보기쉽게일별/시간별차트/표)에 따라 운영5b9829b07873c5ad3ed305a38c41b892e41cbc47 / dep-dbbc7uhsrm7s7382ndc0 LIVE(52.3초) 반영. 요약카드→집계단위/지표/날짜→단일차트와항상보이는수치표→검색/유입표→접힌상세지표로재배치. 기존지표삭제없음. 모바일카드2칸,표내가로/세로스크롤과고정헤더·날짜/시간열,접근가능라벨·키보드초점추가.
- GET /api/auth/admin/dashboard?days=7|30|120&date=YYYY-MM-DD. 선택기간내실제KST날짜만허용/미래날짜거절. 일별기간요약과선택일24시간시리즈분리. 가입/SEARCH/ARRIVAL/LIVE상품승인·현재환불은기존시각으로시간집계,실제환불실행시각별지출과구분. 구독은기존주기시작일요약/상세로유지하며상품시간별금액과혼합안함. 미래시간은—,가입시각미기록은기존과같이추정안함.
- 신규visitor_hourly_totals(date_hour/browsers/sessions)와visitor_analytics_meta(HOURLY_V1/started)만추가. 방문시간별은실제2026-10-20 10:30:15KST부터집계,그전방문시간은—. 당일최초방문시간에일방문자1명,세션시작시간에방문수1건;시간별활성고유방문자아님. 배포전일별방문합계보존·임의역산/보정없음. 개인정보필드/전송/동의범위확장0. 기존120일합계보존정리·격리복원필터에시간별총계정리추가,임시해시48시간/백업제외·IP미수집·30분세션유지. 실운영복구/새전체백업/TEST서버변경0.
- 필수9검사PASS: KST자정·선택일/미래/잘못된날짜/방문시간시작전미기록,실PG시각그룹/TEST제외/일별시간별합계,기존중복·세션·철회/만료/메일/집계/복원회귀. 6언어1383키누락0. 합성UI7일/시간24행/단일지표차트/지표와날짜변경/미래—/집계전방문—확인;390px문서폭375/카드2열. 실제운영관리자기존로그인화면(새로그인/권한변경0) 새로고침 후시간별차트1/표24/시작시각표시,10월19일조회시00:00방문—/기타0정상,콘솔오류0. 오늘로복원. 실제시험방문/금융/메일호출0.
- 배포전새고정비/유료서비스/요금제변경없음·기존사용량과금유지안내. 기존미커밋675changed[]보존,기존운영/TEST/원본자료변경없음. 로컬확인서버종료와새합성fixture/로컬검수의존성만정리. 개발자노트/운영매뉴얼/readiness207·기존두인수인계207갱신,별도인수인계파일없음. 증빙production207-report.json/translation207-report.json 및보완된admin-dashboard/visitor-analytics검사. 기존계약·실금융·외부검수남은범위유지.

## 208. 2026-10-20 — 첨부 소개 PDF 4페이지 권리·콘텐츠 정책 FAQ 공개

- 실제5페이지PDF중4페이지를pdfplumber로추출·PNG렌더확인(원본SHA256 fc22c754da833782ec152aa1bbb591fc5e27ad71bd6e02dd7a5eeca8c0909768,원본수정0). 지식재산권/콘텐츠관리정책의 권리확인·제3자소재고지·금지콘텐츠전체범주·상품별권리/납품표시·신고/조치·사이트내무단재판매금지·플랫폼검토보증아님/법령상의무책임유지 내용을 FAQ상단6문답으로추가. support@novanoxx.com mailto링크. 기존4FAQ그룹·Brief안내·판매계약보존.
- 운영7378361638136e021e1b981943fc4732e9e43fb9 / dep-dbbgnhrm8hqs738tq820 LIVE(56.1초). 실제 /#/faq 첫그룹faq-content-policy/6details·전체FAQ그룹5·신고문답펼침/메일링크확인. 모바일390px문서폭375/섹션337.5,콘솔오류0. 한/영참조경로모두삽입,6언어1397키누락0·구문확인. 저위험문구변경에DB/금융회귀시험을반복하지않음.
- 문서내제출전점검각주는공개FAQ에서제외하며메일시험발송/실제제재명령으로취급안함. 자동침해판정/삭제엔진신규구현주장없음. 새고정비/유료자원0,기존사용량요금유지. 실제계약/DB/권한/원본/운영·TEST자료변경0,기존미커밋675changed[]보존. 개발자노트·운영매뉴얼/readiness208·기존두인수인계208갱신. 증빙production208-report.json/translation208-report.json/pdf208-page4.png. 기존계약/외부검수남은범위유지.


### 2026-10-20 관리자 상세 조회 (211)

- `/api/auth/admin/dashboard-details?kind=members|signups|visits|sales|refunds|subscriptions|subscriptionRefunds&days=7|30|120&offset=0&q=...`는 기존 관리자 권한을 서버에서 확인하는 읽기 전용 조회다. 50건씩 표시하며 offset·검색어·기간을 검증한다. 세션 토큰·인증 해시·소셜 subject·결제 키·전체 계약 스냅샷은 반환하지 않는다.
- 회원 수는 탈퇴 제외 현재 계정, 가입 수는 선택 기간의 기록된 신규 계정으로 기존 합계와 맞춘다. 가입 경로와 연결된 로그인 수단은 별도 표시한다. 국가는 기존 프로필 직접 입력값이며 없으면 미입력이다. 국가 추정·IP 수집을 추가하지 않는다.
- 방문 카드의 부가 조회는 **기간 내 계정별 로그인 횟수**이며 브라우저 방문/재방문 통계와 다르다. 기존 login_events만 조회하고 계정별 방문 수집·새 동의창은 추가하지 않는다. 예전 방문 기록을 계정에 역연결하지 않는다.
- 상품 상세는 LIVE 승인/환불 결제의 승인일 기준으로 합계와 같은 기간을 사용한다. 구독 상세는 승인된 결제 주기의 period_start 기준이다. 환불 카드는 해당 결제들의 현재 누적 환불액이며 환불 실행일별 지출과 구분한다. 사이트 내 요청은 각 금액·처리 상태를 따로 표시하고 외부 환불은 누적액과 요청 기록이 다를 수 있음을 안내한다.
- 데이터 이동·삭제·추가 테이블·실제 결제·환불 실행·유료 자원 생성 없음. TEST 기록과 기존 운영 자료를 보존한다.


### 2026-10-20 첫 방문 통계 동의창 제거 (212)

- `assets/visitor-analytics.js`의 최초 방문 배너 생성만 제거했다. 처음 방문하거나 저장된 선택이 없을 때 자동 동의/식별 토큰 생성/선택형 방문 수집을 시작하지 않는다. 기존 유효한 허용 설정은 계속 적용하며 거부·만료·저장소 접근 실패는 수집하지 않는다.
- 회원·가입·기존 로그인 횟수·거래·환불·구독은 기존 운영 기록에 따른 자동 집계를 유지한다. 선택형 검색·유입·방문 수집은 하단 `검색·유입 데이터 설정`에서 직접 허용·철회한다. 기존 기록과 설정을 변경·삭제하지 않으며 보존·삭제·복구 정책도 유지한다.
- DB/스키마·수집 항목·비용 자원 변경 없음. 다섯 클라이언트 상태의 배너/자동 동의 없음과 유효한 기존 허용에서만 전송을 확인했다.


### 2026-10-20 운영 대시보드 인터랙티브 차트 (213)

- 각 카드의 작은 라인과 상세/기간별 라인·막대는 기존 일별/시간별 집계값을 사용한다. 현재 회원 수 카드의 작은 그래프는 **신규 가입 추이**이며 과거 회원 총수 추정이 아니다. 그래프 툴팁은 0값·미기록/미래의 —·금액 KRW를 구분하며 마우스·터치·키보드로 확인한다. 상세 그래프는 검색/페이지의 일부 행이 아닌 선택 기간 전체 추이다.
- 기존 login_events와 승인된 subscription_cycles/billing_payment_sync에서 로그인/구독·누적 구독 환불 시리즈를 추가 조회한다. 상품은 승인일, 구독은 결제 주기 시작일 기준을 유지한다. 원문/토큰/결제 키는 반환하지 않는다.
- 카테고리 파이는 기존 asset_view_days 합계이며 **고유 방문자/전체 클릭이 아니다**. 기존 로그인 회원 조회 수집 범위·30분 메모리 중복 억제·본인 작품 제외가 그대로 적용되고 새로운 수집은 없다. 현재 공개 분류 기준, ACTIVE/SOLD/PAUSED와 PUBLIC 공개 이력 작품 중 연결된 항목만 조회한다. TEST_ARCHIVE/초안/기간 밖·미래 데이터 제외. 상·하위10개에서 0조회 포함, 동률은 public_id 순으로 안정 정렬한다. 공개 시점/노출기간 차이는 보정하지 않으므로 인기나 품질 판단에 주의한다.
- 회원 상세의 테이블 존재 확인이 PostgreSQL 호환 계층에서 인식되지 않던 문제도 수정. 기존 권한/페이지/검색 규칙·데이터 보존을 유지하고 PostgreSQL에서도 가입경로/연결 제공자/입력 국가/로그인 횟수가 표시됨을 합성 DB로 확인했다.
- 추가 테이블/스키마·추적·동의창·유료 자원·금융 실행 없음.


### 2026-10-21 회원/비회원 카드 클릭·상세 조회 분리 및 국가 판별 검토 (214)

- 새 `public.asset_traffic_daily`는 (KST 날짜,작품 ID,CARD_CLICK/DETAIL_VIEW,MEMBER/GUEST,국가 코드)의 합계만 저장한다. `asset_traffic_meta`는 새 집계 시작 시각만 저장한다. 계정 ID/이메일/IP/브라우저 식별값/개별 이벤트 원문을 보관하지 않는다. 국가 코드는 현재 UNKNOWN 고정이며 IP 헤더를 읽거나 외부 IP 조회를 호출하지 않는다.
- 카드 클릭 POST는 동일 origin/JSON/512바이트/공개된 ACTIVE·SOLD/PUBLIC 연결 상품 검증, 서버 세션으로 회원 여부 판단, 관리자·본인 작품·알려진 봇·제한 계정 제외, 분당 총600건 한도다. 요청별 임의 nonce는 짧은 메모리 재전송 억제에만 사용하며 DB/백업에 넣지 않는다. 장치별/일별 고유 인원으로 해석할 수 없다. 클라이언트는 같은 이벤트 중복 호출만 100ms 억제하고 분석 쿠키·식별 저장소를 만들지 않는다.
- 기존 `asset_view_days`와 30분 상세 조회 억제는 보존한다. 기록된 상세 조회만 새 MEMBER/DETAIL_VIEW 합계에 같은 트랜잭션으로 반영한다. 원문 수정/이동·과거 국가/회원 분류 추정 없음. 비회원 상세 접근·납품 권한·금융 조건 변경 없음.
- 새 합계120일 보관 정리를 기존 시간별 backupGate 작업에 포함하고 격리 복원 시 만료 합계 재제거를 추가했다. 기존 운영·TEST·과거 백업 자료를 임의 삭제하지 않는다.

#### IP 국가 판별 검토 결과 — 현재 비활성

- 무료 로컬 DB 후보: DB-IP IP to Country Lite. 2026-10 배포 MMDB는 공식 페이지 기준8.0MB, 월별 갱신, CC BY4.0 출처 링크 필요. 유료 API/외부 사용자 IP 전송 없이 서버 내부 조회 설계가 가능하다. https://db-ip.com/db/download/ip-to-country-lite / https://db-ip.com/faq.php
- 제안 흐름: 신뢰 가능한 ingress가 제공한 요청IP를 메모리에서 로컬DB 조회→국가코드/회원구분/종류별 합계 증가→원문 IP·국가-계정 연결·브라우저 식별값·개별 이벤트 저장/외부전송 없음. 국가 DB 자체 다운로드/갱신만 별도 공개 데이터 전송이다. 약8MB DB 외에 리더 메모리/갱신 작업 사용량이 있어 현재 서버 여유 확인 후 도입한다. 추가 고정 서비스 비용은 불필요한 설계이나 기존 사용량 비용은 유지되며 요금제 증설 필요시 사전 안내한다.
- 사전 확인: Render 신뢰 프록시 경계/위조 전달헤더 방어를 확인하기 전 임의 X-Forwarded-For 값을 사용하지 않는다. MDN은 신뢰 프록시 경계 없이 XFF를 사용할 때의 문제를 설명한다. https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For
- 국가는 IP 위치의 근사값이며 국적/회원 프로필 국가가 아니다. VPN/프록시/모바일 회선/DB 미수록은 오차 또는 미확인으로 표시한다. 프로필/언어를 접속 국가로 대체하지 않는다.
- 사용자의 이번 선택은 IP 기반 국가 판별 **검토 희망**이며 운영 IP 처리 승인으로 간주하지 않았다. 기존 IP 미수집 안내 변경·처리 근거/공개 안내 검토·활성화 확인이 남는다. 현재 DB 다운로드/국가 판별 의존성 설치/원문 IP 열람·저장·외부전송·GeoIP 활성화는 하지 않았다. 파이 틀과 분류 합계는 준비했으나 국가 데이터는 UNKNOWN으로 명시한다.

## 215. 2026-10-21 — 운영자 발급 Toss 검수용 일반 계정

- 사용자 승인한 기존 운영 서비스와 workspace만 사용. 아이디 novanoxx_test, 내부 이메일 novanoxx_test@novanoxx.com. 로그인 경로 https://novanoxx.com/#/login?review=1 에서 아이디를 입력할 수 있으며 일반 로그인은 이메일 입력 유지. 기존 직접 회원가입은 이메일 인증 방식으로 제공된다.
- 비밀번호는 사용자가 마지막에 지정한 값을 scrypt salt/hash로만 일회 발급. 평문·salt/hash를 소스·개발자노트·인수인계·증빙에 기록하지 않는다. 임시 환경변수는 발급 확인 후 비워 재실행을 중지한다. 기존 계정이 있으면 덮어쓰지 않으며 nonce 감사 기록으로 중복 발급 방지.
- 일반 계정이며 관리자 권한·유료 잔액·주문·파일 이용 권한 부여 없음. 운영자 발급 검수 신원으로 인증 상태를 기록하며 실제 이메일 인증 메일 수신을 주장하지 않는다. Toss 신청 제출·계약·실금융 실행 없음. 새 유료 자원·요금제 변경 없음, 기존 사용량 과금 유지.
- SQLite/PostgreSQL 계정 검사2 PASS: 일반 권한/해시 보관/멱등성/기존 계정 불변/환경 및 입력 제한/아이디 정규화. 관련 통계7검사와 합계9 PASS.
- 최종 dep-dbc8akbncjis738msjq0 LIVE. 발급 요청 비움 후 로그인200/isAdmin false/FREE/NEON0/관리자 dashboard403/로그아웃200. 운영 로그인 UI 확인. 새 통계의 운영 관리자 조회는 현재 관리자 세션 부재로 미검증; 합성 UI 및 SQLite/PG 검사는 완료. 비밀번호 없는 증빙 production215-report.json/review215-login.png. 기존 미커밋675개 변경0.

## 216. 2026-10-21 — 사이트 내부 크리에이터 공개 프로필

- 외부 포트폴리오 주소 입력란/대시보드 외부 링크를 ‘내 공개 프로필 보기’로 대체. 원래 portfolio 컬럼/값은 보존, 필드 없이 저장할 때 기존 값을 유지한다. 이전 클라이언트의 명시적 포트폴리오 입력은 기존 검증 방식 유지. 외부 링크를 공개 프로필에 제공하지 않는다.
- creator_public_links(public_id UUID 문자열 PK,user_id UNIQUE)만 추가; 원래 계정 ID와 별개 공개 UUID를 동시성 안전하게 지연 발급. 기존 프로필·에셋·파일·지갑·주문·TEST 상태 변경 없음. 공개 URL #/creator?id=<public UUID>. 프로필 편집·대시보드·실상품 상세 크리에이터 이름에서 연결. 가상 데모 작품의 작가명을 실제 회원으로 추정 연결하지 않음.
- GET /api/catalog/creator 및 /api/catalog/creator/avatar: 로그인 없이 공개 소개/활동명/국가/언어/사진과 현재 ACTIVE·PUBLIC·catalog_links 연결 에셋만 반환. 이메일/계정ID/외부주소/원본경로 제외. users 존재·정지/탈퇴 차단. 임시저장/심사/중지/판매완료/TEST_ARCHIVE 제외. 미등록·잘못된 주소404, 비GET405. 판매 에셋이 없으면 사실대로 빈 목록. 사진은 기존 검증된 이미지 MIME만 제공.
- catalog의 기존 보호 미리보기 투영을 공용 함수로 재사용, 기존 마켓플레이스 ACTIVE/SOLD 공개 목록 유지. 공개 프로필 목록에서 원본 권한을 주거나 기존 상세 로그인 제한을 바꾸지 않음. 썸네일은 기존 /api/catalog/file 보호 경로만 사용.
- SQLite/PostgreSQL 필수2검사 통과: 공개 범위·기존 외부주소·계정정보 비노출·UUID 안정성·사진·정지/탈퇴 차단·빈 상태. 격리 로컬 HTTP에서 외부주소를 가진 프로필을 새 입력폼/실제 저장 후 DB 보존 확인. 실제 브라우저의 공개프로필→상품→기존 로그인 제한→상품상세 작가명→공개프로필 및 프로필편집/대시보드 링크 확인. 합성에셋2개·문자열 HTML 이스케이프·모바일390px 문서폭/스크롤375·외부 본문링크0·콘솔오류0. 6언어1457키 누락0. 운영 데이터로 시험 에셋/프로필 생성하지 않음.
- Render 배포는 기존 운영 서비스만 사용. 새 유료 자원/요금제 변경 없음, 기존 사용량 과금 유지. 운영 적용/최종 검증은 후속 기록 참고.
- 最終 운영 dep-dbc8mle7bikc73fpc7ng LIVE(51.3초), 7983ff70183fc6c5351225a7321ffbde1d671c1c. 새 JS/CSS/라우팅/대시보드/개발자노트200 및 줄바꿈 정규화 후 소스 일치. catalog200/실제회원연결상품0/includeDemo true(예시 유지), 잘못된 공개프로필404. 실제 운영 검수계정으로 프로필 초기폼의 외부주소 입력제거/자동모음안내·개발자노트·콘솔오류0 확인; 운영에 시험 프로필 생성/저장하지 않음. 현재 예시작품을 실제회원 소유로 임의 연결하지 않았으므로 본인 저장프로필의 링크나 추후 실제상품 작가명으로 진입. 증빙 production216-report.json/production216-smoke.json/profile216-local-screen.png. 사용자의 모든 공개활동명→판매중/판매완료 전체 모음 제안은 후속 의견이며 이번 배포는 ACTIVE만. 기존675파일 변경0.

## 217. 2026-10-21 — 크리에이터 이름 연결·전체/판매 중/판매 완료 탭

- 마켓플레이스 카드 작가 공개활동명을 개인 작품 페이지(#/creator?id=<공개UUID>)에 연결. 기존 상품 상세 작가명/프로필 수정/대시보드 연결 유지. 기존 콘테스트 목록도 실제 creator_profiles/users와 연결되고 정지/탈퇴가 아닌 작성자만 공개 활동명과 링크를 제공한다. 내부 계정 ID는 응답에서 제거하며 예시 작가를 실제 회원으로 추정하지 않는다.
- 기존 PUBLIC·catalog_links 연결 ACTIVE/SOLD 작품의 전체/판매 중/판매 완료 탭과 건수. 선택 탭 URL 보존/새로고침 복원, WAI-ARIA tablist/tab/tabpanel 및 방향/Home/End 키. 빈 탭과 미리보기 없음 사실대로 안내. 신규 DB 스키마/금융/거래 상태 변경 없음.
- 판매 완료 응답은 id/title/creator/공개UUID/category/subcategory/sold/보호 img·clip URL/previewDuration 화이트리스트로 축소. 가격·계약·설명 등 세부 투영 제외. 원본/구매자 정보/이용권한 노출 없음. 판매 완료 카드는 구매/상품상세 링크 없이 보호 미리보기 dialog만; 검증된 기존 /api/catalog/file 이미지·영상·음원 경로만 사용. 이미지 워터마크/최대960px 보호 유지. 미리보기 없음은 버튼 비활성. 닫기/Esc·미디어 종료 처리.
- 기존 원본 다운로드/상세 로그인 제한·TEST_ARCHIVE/초안/심사/중지 제외·정지/탈퇴 차단·기존 portfolio 자료 보존. SQLite/PostgreSQL 필수2검사 PASS: ACTIVE/SOLD, 화이트리스트, 보호썸네일만 투영/원본 public file404, 콘테스트 실제프로필 연결·개인ID제외, 공개범위/정지/탈퇴/자료보존.
- 격리 실제 브라우저: 전체3/판매중1/완료2, 클릭·키보드 전환/주소 새로고침 복원, 판매완료 구매링크0, 보호 이미지실제960px, 미리보기 없는 카드 비활성, 마켓 작가명→프로필 이동, 모바일390px 문서폭/스크롤375, 콘솔오류0. 운영 시험프로필/상품 생성 없음. 6언어1466키 누락0. 기존 미커밋675개 변경0. 새 유료 자원/요금제 변경0, 기존 사용량 과금 유지.
- 최종 dep-dbc8uc0u01pc73d0rcug LIVE(53.6초), 코드2a82bee787daf07fcc8b57d80c0c195ac68f293e. index 작가링크 및5개JS/CSS200·줄바꿈 정규화 후 일치, catalog/contest200·실제 공개연결상품/출품0, 미존재프로필404. 실제 운영 개발자노트 신규항목 확인/콘솔오류0. 실제 작품표시는 운영자료를 만들지 않아 격리 브라우저와 DB 검증으로 구분. 증빙 production217-report.json/production217-smoke.json/profile217-local-tabs.png. 기존675파일 변경0. 검수 임시서버 종료·새 검수의존성과 합성자료만 정리, 기존 TEST/자료 보존.

## 218. 2026-10-21 — 예시 작가 모음·프로필 활동명 클라이언트 갱신

- 예시8작품/7작가를 최초 정적 시안 데이터의 별도 스냅샷으로 그룹화. #/creator?demo=demo-<해당 작가 최소작품ID> 주소와 카드/상세/모음의 예시 크리에이터 배지·실제회원 비연결 안내·예시가격 명시. 실제회원 URL #/creator?id=<UUID>와 분리; 공개catalog의 includeDemo=false일 때 예시모음도 비활성. 예시를 users/creator_profiles/거래/TEST 원장에 삽입하거나 실제소유로 추정하지 않음. 동일 이름의 실제회원과 예시작가도 분리.
- 예시 모음도 전체/판매중/판매완료 탭·기존 보호 이미지/영상 경로 사용, 완료카드 구매링크 없음. 데이터/업로드/원본 추가복사 없음. 신규 API/DB스키마/유료자원 없음.
- 실제 상품API는 creator_profiles.display_name JOIN으로 이미 최신이름 반환. 원인은 저장 후 브라우저의 초기 assets 목록 미갱신. 프로필 저장응답의 공개UUID로 해당 실제작품만 이름 갱신하고 catalog를 새로 읽은 뒤 마켓카드를 렌더. 갱신요청 실패에도 저장된 이름을 현재 목록에 유지, 다른작가/예시 이름을 문자열로 매칭하지 않음. 기존 공개주소·소유자·상품metadata/상태·거래 원본기록 변경 없음. 열어둔 다른 기기에 실시간 push를 추가한 것은 아님.
- 필수3검사 PASS: 예시 불변스냅샷/동일이름 실계정 분리/UUID기준 이름 갱신, SQLite/PostgreSQL 최신 프로필명이 ACTIVE/SOLD의 catalog/공개모음에 반영·기존 metadata/원본보호/정지탈퇴 유지. 격리 실제폼 Original Creator→NovaNoxX 저장 후 실제ACTIVE/SOLD 카드2개 새이름/동일UUID, 예시NovaNoxX2작품은 별도주소·배지 유지 확인. 예시8카드 링크·Nova예시2/판매완료예시1·기존 보호이미지960px·모바일390px 문서폭/스크롤375·콘솔오류0 확인. 합성DB 상품행전체/외부portfolio 불변·예시회원생성0 확인.
- 6언어1469키 누락0/구문·diff 확인, 기존 미커밋675 changed[]. 운영시험프로필/상품 생성0. 기존사용량 과금유지, 새유료자원/요금제 변경0. 최종운영배포는 후속기록.
- 최종운영3f364de1663672eb3cee82d1dab8c1924c742faf / dep-dbc9et0u01pc73d1ejeg LIVE(50.6초). 새모듈/모음/CSS/라우팅/노트5파일200·줄바꿈정규화일치, catalog200/includeDemo true/실제연결상품0. 실제운영 카드8작가링크/배지8·이름클릭→Nova예시모음2작품/비연결안내/콘솔오류0 확인. 실제활동명 변경은 운영자료를 바꾸지 않고 격리실제폼/DB검증으로 구분. 증빙 production218-report.json/production218-smoke.json/profile218-preservation.json/profile218-production-example.png. 기존675파일변경0. 새 검수 임시서버종료·의존성/합성자료만 정리, 기존자료 보존.

## 219. 2026-10-21 — 상단 크리에이터 작가 목록·분야별 사양 step 오류 수정

- 기존 #/creators 상단에 작가목록을 추가하고 기존 크리에이터 시작/등록과 요금제 안내는 하단 유지. 실제 크리에이터/예시 작가를 섹션·배지·주소로 구분, 이름 클릭→개인작품, 판매중/판매완료 건수. 실제 목록은 users/creator_profiles/공개catalog ACTIVE/SOLD 연결 작품이 있는 크리에이터만이며 초안/심사/중지/TEST·정지/탈퇴 제외. 개인정보가 있는 비공개 프로필까지 전 회원 목록으로 노출하지 않음.
- GET /api/catalog/creators: 공개UUID·활동명·공개사진URL·공개작품 상태별건수만, 50건/더보기·안정 정렬·offset검증. 이메일/내부계정ID/외부주소/소개/국가/원본 제외. 기존 creator_public_links 지연발급 재사용, 새스키마/거래변경 없음. 예시는 기존8작품/7작가 스냅샷의 목록만 반환, 실회원생성 없음.
- 입력오류 원인은 공통 정수 input의 min=0.000001 / step=1 조합: 유효값이 0.000001+n이라 정수3000이 stepMismatch. 영상·2D 가로/세로,3D폴리곤,AUDIO샘플레이트,DOCUMENTS페이지수7항목에 공통영향. integer min=1/step=1, 소수4항목은 min=0/step=any + 기존 서버공용validate로 >0·유한수·상한검증, max=MAX_SAFE_INTEGER와 모바일 inputmode 지정. 빈 선택값 유지. 서버사양/저장자료·문자항목 기준은 그대로.
- 필수4검사PASS: SQLite/PostgreSQL 목록 공개범위·상태건수·정지/탈퇴·개인ID비노출·정렬/50+6페이지중복없음·offset/method, 예시목록분리, 6분야7정수/4소수 서버규칙. 실제 브라우저 공통사양 폼에서 11개 숫자입력 모두 3000/29.97 valid·stepMismatch false, 정수1.5/소수0 거절·빈값valid. 문자항목에는 step오류 없음. 실제 격리사이트에서 동명이 실제1명/예시7명 구분 및 상단메뉴·두프로필 이동, 모바일390px 문서폭/스크롤375·콘솔오류0. 숫자체크는 공통렌더러를 그대로 사용하는 최소폼 검수이며 운영에 상품 저장하지 않음.
- 6언어1475키 누락0, 구문/diff·기존675파일변경0 확인. 기존운영/TEST/상품/파일/미커밋 보존. 새 유료자원/요금제변경0·기존사용량 과금유지. 최종운영배포 후속기록.
- 최종1ebd669cc7b46e40a159570f7e35bd9a7e3bf1b1 / dep-dbc9p0rncjis73erpfs0 LIVE(61초). 6파일200·줄바꿈정규화일치, 작가목록API200/실제0·catalog200. 운영 실제목록빈안내/예시7명·이름클릭→개인모음2·콘솔오류0 확인. 사양11입력 검수는 동일 공통렌더러의 격리브라우저이며 운영상품 저장시험 없음. 증빙 production219-report.json/production219-smoke.json/numeric219-browser-report.json/directory219-production.png. 기존675파일변경0. 새 검수임시서버 종료·의존성/합성자료만 정리.


## 220. 2026-10-21 — 작품 등록 전체 입력 모바일 검수·초안/견적 보완

- 6개 분야/8단계 실제 폼에서 카테고리·하위분류 변경, 문자 길이 제한, 제작 요소7개, 가격·작업일 숫자, 파일 입력 저장 전/후 잠금, 초안 복원/서버 임시저장 확인. 모바일390(내용375) 전 단계 가로넘침0, 320(내용305) 가격입력 넘침0/16px. 실제 단말 모든 OS 검증과 구분.
- 비활성 추가작업·묶음 모드의 숨은 견적 숫자는 disabled/required 해제하여 이전 잘못된 값이 저장을 막지 않도록 함. 값은 지우지 않고 선택 복귀시 재사용. 항목별 금액0~1000000/작업일0~365/정수 유지, 기본 가격1~1000000/추가금액·기본일수0~MAX_SAFE 정수 입력·숫자키패드 명시(서버규칙변경0).
- 브라우저 초안 복원 뒤 숫자 input 검증/견적 change 상태 동기화. 복원된 영상길이0 customInvalid=true 확인, 항목별 금액5/작업일2 활성·묶음금액readOnly·계약/권리재확인false 유지. 업로드 실패 후 무조건 전체활성화 대신 이전 disabled 상태 복구. 모바일 등록 폼 글자16px/최소너비 조정.
- 격리 합성계정에서 DRAFT1건 저장해 제목/설명/납품/3000x3000/길이12/29.97fps/가격100/견적5·2/제작요소7/제3자선택/제작정보 DB일치. 파일 업로드·운영상품저장·외부결제/메일호출0. 콘솔오류0. 기존 미커밋675 changed[].
- 숫자 공통검사PASS. 기존 creator-api.test.cjs는 최신 필수 제3자소재 선택이 없고 이미지가 아닌 시험문자열을 preview에 올리는 오래된 fixture라 실패(제품 회귀로 판정하지 않음). 시험파일 원문 보존, PASS로 집계하지 않음. 이 작업은 클라이언트 수정이며 실제 격리 폼/서버저장 검증을 적용. 전체 기존 검사 통과라고 보고하지 않음.
- 개발자노트/운영매뉴얼/준비현황 갱신. 기존 Render 자원 재사용/새유료자원·요금제변경0·기존사용량 요금유지. 배포범위 등록 JS2/CSS1/노트. 최종 배포 확인은 후속기록. 증빙 mobile220-browser-report.json/mobile220-saved-draft.json/mobile220-result.json/mobile220-inputs.png.

- 최종220 afae8ab0352b582efc41ac312b051a7b0747bfe5 / dep-dbcb9smk1f9s73c09hh0 LIVE(61초). 변경4파일200·정규화본문일치/catalog200, 운영 신규개발자노트 표기·콘솔오류0 확인. 수정된 전체등록폼은 운영상품저장 없이 격리 브라우저/DB로 검증. 1475번역키 누락0/기존675변경0. 신규검수서버종료/이번 runtime·합성DB만 정리·증빙보존. 증빙 production220-report.json/production220-smoke.json/production220-notes.png.


## 221. 2026-10-22 — 오래된 등록 자동검사 해결·실제 기능 문제 구분

- 220에서 미통과로 남긴 creator-api.test.cjs 재현: 최신 필수 thirdPartyAssets 누락으로 계약 검사 전에 고지 오류, 일반 문자열을 PNG 미리보기로 제출, 번역 span/esc 문맥이 추가된 UI 함수를 과거 텍스트/정확한 마크업으로 비교하던 시험자료 불일치. 서비스 보호 규칙을 완화하지 않음.
- 실제 로컬 FFmpeg로 합성 PNG 생성해 원본 바이트 불변, 보호 JPEG 변환·증빙행, 손상 PNG 거부/미완료파일·행 정리, 고지 미입력/계약 미확인/권리 미확인 제출 차단, 다른 사용자 접근·수정 차단, 심사→관리자 승인→공개목록·원본 공개404까지 검증. UI 함수는 현재 번역 span과 문구를 함께 검증. 임시 DB close/자체 생성 디렉터리 정리·검사 프로세스 PATH 복구.
- creator-api.test.cjs + creator-metadata-input.test.cjs 필수2검사 모두 PASS(약1초). 실제 로컬 이미지 변환/격리 SQLite 범위이며 운영 상품 저장·외부결제·메일·PG 호출0. 제한 실행환경의 Windows 임시파일 rename EPERM은 로컬 실행권한 환경 문제로 별도 확인 후 정상 실행환경에서 통과. PostgreSQL·전체 사이트/모든 검사 통과로 확대하지 않음.
- 제품 기능 수정 필요 없음: 서비스코드·운영설정·DB/파일 변경0, 운영 재배포 불필요. 기존 LIVE afae8ab / dep-dbcb9smk1f9s73c09hh0 유지. 검사/기록만 [skip render] 보관하여 추가 배포 방지. 기존 미커밋675 changed[], 새유료자원·요금제변경0. 기존 운영·TEST 자료 보존.
- 증빙 creator221-test-output.txt/creator221-resolution.json. 220의 오래된 검사 미통과 항목은 이번 갱신으로 해결됨.


## 222. 2026-10-22 — AI 드라마 상영관·크리에이터 직접 공개·1/2화 무료/3화 NEON

- 마켓 VIDEO 하위분류 대신 상단 별도 상영관/#/theater, 작품·회차/#/drama?id=, 크리에이터 등록/#/drama-studio 및 기존 크리에이터 메뉴 연결. 제목·줄거리·장르·상영권/제3자소재 고지·회차 제목/순서/소개·가격 저장. 기존 에셋과 별도 권한/테이블/파일경로를 사용해 원본 판매와 상영권을 혼동하지 않음. 포스터는 제목 기반 기본 커버이며 업로드 기능 아님.
- 진행 중 사용자 변경을 반영해 관리자 사전심사 제거. 등록자는 영상/상영권 확인 후 직접 공개. 관리자는 사후 중지/사유 기록만. 기존 공개 회차는 유지하며 새 DRAFT 회차 추가/영상등록/개별 공개·중지 가능. 정지·탈퇴/프로필 없는 작가 작품은 공개 목록과 파일에서 제외. 기존 상품 상태/자료 변경0.
- 1·2화 무료 강제, 3화부터 정수 NEON 가격(초기 제안3, 직접변경 가능). 구매 전 유료회차 video/tracks URL 미제공, 파일ID 직접접근도 차단. 소유자·권한있는 관리자는 비공개 검수 가능. 검증된 NEON 차감영수증 이후 시청권 저장/재차감 방지 연결, 동일 계정·회차의 안정적 멱등키, 불명결과 UNKNOWN/재확인 경로 준비. TEST_WALLET 영수증은 거부. 운영 어댑터는 null로 실제 구매409/차감0. 이 구현이 NEON 유상 원장·충전·환급·판매자 정산을 완성한 것은 아님.
- 후보 영상은 20분/300MB 이하 H264(yuv420p)/AAC MP4, 후보전용600MB상한/최소여유공간/동시1업로드. VTT1MB/회차8언어·형식/시간검증/태그제거. 교체 이전 파일/행을 보존, 새 실패파일만정리. Range/HEAD·suffix/416·비공개접근검증. HLS 자동화질/CDN/DRM은 미연결. uploads_enabled는 운영기본false, 영상·자막 운영업로드 비활성: 비용/용량/백업예산 승인 후 적합한 영상전송서비스/공유용량보호 연결 필요. 새유료서비스/증설0.
- 이어보기는 계정구분한 이기기 localStorage30일/100회차, 마지막시청회차 선택·재생위치복원·완료회차정리·삭제/저장차단실패안전. 서버 시청/검색 추적 추가없음. 자막 켜기끄기/다음회차 링크/모바일16px·좁은화면.
- 최종 SQLite/PG(PGlite) 생명주기 및 이어보기3검사PASS. 실제 FFmpeg 합성MP4/ffprobe 사용. 직접공개·새회차연재·권한·손상파일·기존행불변·무료접근·유료파일차단·위조TEST영수증거부·가격변조·재차감방지·차감후타임아웃합성복구 확인. 합성단위 어댑터만사용/외부결제0. 전체격리사이트 모바일375px/스크롤375, 실제 등록폼 작품/회차/영상/VTT저장, 40초영상재생/자막ready2/켜기끄기/7초이어보기/2화전환·비회원2화무료·3화player없음 확인/콘솔오류0.
- public schema drama_series/episodes/media/reviews/entitlements/purchase_intents 추가(기존테이블변경0). media는 DATA_DIR/drama-media, 기존 일반파일 트리 백업과 public schema 덤프 대상에 포함되나 실제 이 기능 새영상 백업·복구 검증을 운영 완료로 표시하지 않음. 영상 활성화 전 총용량/백업비용 검토 필수.
- 운영금융/정산·메일·기존자료변경0, 기존미커밋675 changed[]. 6언어1544키누락0. 노트/운영매뉴얼/준비현황 갱신. 배포최종확인은 후속기록. 증빙 drama222-tests.txt/drama222-browser-report.json/drama222-result.json/drama222-mobile-player.png/drama222-paywall.png.

- 최종222 기능748c2eb / dep-dbck7cdg1s2s7385733g LIVE 후 상단추가메뉴 너비를 보완한 9037a9f2f5f49e2ad333642492292e5ba2d5381d / dep-dbck9761egvs73eqvaeg LIVE 확인. 변경8파일200·정규화일치/최종CSS200일치, drama/catalog200(운영공개작품0), studio익명401, 기존catalog200·예시유지·health200/PostgreSQL정상. 운영 상영관 메뉴/1·2무료/3화NEON정책·빈상태·새개발자노트 확인/콘솔오류0. 데스크톱1265px 7메뉴동일top19/가로넘침0, 태블릿1024(내용1009) 메뉴하단111<헤더124/넘침0. 운영시험상품·드라마·계정생성0, 기존675변경0. 이번 격리서버/합성DB/runtime만 정리·증빙보존. 최종증빙 production222-report.json/production222-smoke.json/production222-ui.json/production222-theater.png. 운영영상업로드/NEON실구매 활성화는 계속 대기.


## 2026-10-22 최신223 — NovaPlay 이름·기본3NEON 확정과 영상 비용 검토

- 사용자 확정: 상단 메뉴/상영관 제목 NovaPlay, 1·2화무료/3화부터 기본3NEON. 기존 기본값3 유지·회차별 입력 유지. 기존 해시주소/테이블/파일 변경없음.
- Render MCP 읽기조회: 운영 novanoxx 단일0.5CPU/512MB, /data 총5GB(여유5GB 아님). 최근 유휴 메트릭은 100명 성능근거로 사용하지 않음. 실제 잔여디스크/월간전송할당량은 MCP로 미확인. 기존미커밋675 changed[].
- 2–4Mbps 영상100명 직송 가정:200–400Mbps/10분15–30GB. 곧바로다운이라고 단정하지 않지만 현재 단일서버 안정성 보장불가. 유료/100인부하실험0. 홈페이지·인증·NEON권한은기존Render, 영상직접업로드/전송은전용CDN 권장. 전용서비스는 아직 미연결.
- Cloudflare Stream 공식2026-10-22: 저장1000분용량단위 월USD5/전송1000분USD1, 업로드·인코딩/전송대역폭포함. 10분10편 +100명한편씩=USD6, 100명전편=USD15(세금/환율/버퍼링/기존요금/백업별도). Render초과공개전송USD0.15/GB·디스크USD0.25/GB월 확인. 실제청구서/할당잔량은 확인하지 않음. 상세 docs/novaplay-capacity.md.
- 이번은 이름/기본정책기록/노트 기존서비스배포. 유료자원/증설0·영상업로드비활성/실NEON구매비활성유지. 유료연결 승인후 직접업로드·인코딩상태웹훅·서명재생/자막/이어보기·비용보호·복구범위 구현 필요. NEON유상원장·충전/차감/환불/정산 미완료 구분유지.
- 문법·번역1544키누락0/기존675불변 확인. 배포결과는 후속기록.

- 최종223 4a88a2dcb805614cf3ee1b0d6bd7ff20376acc98 / dep-dbckgm4s728c73amhkrg LIVE. 운영공개3파일200/원본일치(HTML정상canonical/운영flag주입만제외), catalog200/공개작품0 유지. 실제NovaPlay메뉴·페이지제목확인/7메뉴top19/가로넘침0. 증빙production223-smoke.json/production223-novaplay.png. 유료서비스/영상활성화/실NEON구매0.


## 2026-10-22 최신224 — Cloudflare Stream 업로드·상영 연결

- 사용자 월USD5기본+사용량조회/다운로드차단/기존보존 승인. Cloudflare 실제계정26fa9902e2359e7c8504081c66e34021의 Starter Bundle 구매완료화면 확인: 월5/저장1000분/월전송5000분포함/초과1000분USD1. 이전223의 개별Stream 요금계산과 달리 이 구독의 포함량을 적용. 기존 R2백업/도메인변경0.
- 사용자 실행직전 승인으로 NovaPlay전용 계정토큰 Stream Read/Write+Account Analytics Read 생성. 기존Render에 NNX_STREAM_ACCOUNT_ID/API_TOKEN/ENABLED=1 추가 Save only. 기존환경변수보존. 로컬평문토큰파일저장은 자동검토거부되어 실행하지않고 메모리→Render비밀설정직접전달. 비밀값 로그/소스/노트노출0.
- provider cloudflare-stream.cjs: TUS직접업로드·서명URL필수/허용도메인 고정·20분/300MB·1000분보수적예약·자동증설없음. 단일진행/계정회차당처리확인/크리에이터하루10요청. 드라마신규uploads테이블추가만. 변환완료+보호설정재조회후active교체/기존행·원본유지. 위조/과거웹훅차단/알려진UID만조회·중복완료불변. 기존다른웹훅주소발견시덮어쓰지않음.
- 웹훅URL https://novanoxx.com/api/drama/stream/webhook, 부팅시기존값GET/없을때만PUT. 반환secret은운영DATA_DIR/drama-stream-webhook-계정.json(0600)복구사본,일반암호화백업대상. 로컬워크스테이션토큰파일0.
- 유료회차권한확인후30분HLS token(downloadable:false), rawmedia는원격파일비노출/직접다운로드차단. Cloudflare다운로드생성API호출0. 브라우저저장메뉴숨김은추가장치/완전DRM·녹화차단아님. HLS자동화질/네이티브HLS 또는MIT hls.js1.6.13 포함/선로딩최소/재생버튼선택후요청·재시도/이어보기·기존VTT유지.
- 관리자대시보드 NovaPlay·Cloudflare 바로가기/저장·전송·USD예상표/800분·5000분안내. GraphQL권한없음/오류는미확인표시(0원조작없음),월UTC기준/5분캐시/청구서바로가기. Stream영상원문은Cloudflare에보관·기존R2파일백업자동복제미구현구분. 기존자료보존/NEON운영실구매차단유지.
- SQLite/PG필수검사+기존생명주기/기기이어보기 확인, 로컬6초HLS실재생ready4/noerror. 번역1578키누락0, 기존675변경0. 실제배포/Cloudflare검증 후속기록.

- 실제224 운영6197df6 / dep-dbckt8bm8hqs73aeebjg LIVE. 공개5파일200·원본일치, health200/Postgres, catalog공개드라마0유지, 익명usage403. 운영서버실조회 storage0/1000,월delivery0,Analytics권한true,예상USD5,운영웹훅복구키존재true(키값노출0).
- 동일3초합성비공개영상1개 실제Stream TUS204/변환ready/서명HLS200·FFmpeg1초실디코딩성공/CORS정상/서명없는UID401/MP4다운로드403. 원격UID ec33dfe106a94a51005d7602f60f63bf, 이름 NovaPlay private connection check 2026-10-22. Cloudflare비공개로보존·사이트카탈로그등록0·회원/상품/거래수정0. 서버DATA_DIR/drama-stream-connection-check-20261022.json 비밀없는결과보관. 자동웹훅은대응앱업로드UID가없어공개작품생성없이무시.
- 로그인요청 후에도운영브라우저는novanoxx_test라관리자실제UI열람은미확인. 격리실제UI/합성요금표확인과운영서버실사용량조회는구분. 관리자로그인시대시보드상단NovaPlay버튼으로조회가능. 실제검사7PASS/번역1578키/기존675변경0. 노트실검증반영과처리중상태문구정리는후속배포.

- 최종224 0e2c1617e221e99d1214da1f7b4d8fab2cb02580 / dep-dbcl10u1egvs73erqm2g LIVE, 변경노트/처리문구2파일200일치. Cloudflare관리UI에서도 Require Signed URLs=true/Allowed Origins=novanoxx.com/Automatically Delete=false/3초영상Ready 확인. 스크린샷 stream224-cloud-protection.png 및 구독포함량 stream224-subscription.png. 임시로컬서버종료/이번runtime·합성DB·helper만경로검증후정리, 증빙보존. 기존675변경0. 공개영상0·원본/운영/TEST변경0·새Render자원0, 선택Cloudflare월5구독만활성. 전체상영서비스완료와NEON실제구매연결은구분.

- 사용자관리자로그인완료후운영실제UI최종확인: 관리자대시보드→NovaPlay버튼 정상. storage0.05/1000분/영상1개/월delivery0/5000기본포함·baseUSD5/deliveryUSD0/totalUSD5/웹훅연결안내오류없음, 760px가로넘침0. 실제관리자UI미확인상태해소. 증빙stream224-production-usage.png, 신규영상/결제재검사0.


## 2026-10-22 최신225 — 1080p 실확인·1,000명 동시 검증 범위

- 실제 비공개 3초 1920×1080/8647byte 합성영상 TUS204, 변환100%, HLS200, 1080/720/480/360/240 변형목록 및 1080 변형 FFmpeg1초 실제디코딩 성공. UID 2e2792d8012f99be6bba1a8aa49cb1e5, signed필수/novanoxx.com허용/사이트등록·공개0. 서버 /data/drama-stream-1080-check-20261022.json 및 로컬 stream225-result.json에 비밀없는결과 보관. 기존320×180 검사와 구분. 포함량사전확인 storage0.05분/delivery0분, 한도내실행/새유료자원0.
- 영상바이트는 Cloudflare직접전송. Render0.5CPU/512MB/총5GB 단일서비스는 홈페이지·권한·재생시작요청 담당. 1,000명동시부하/동시재생 실제검사0, 유휴자원/짧은1인디코딩은 성능근거 아님.
- 현재 playback당 GETvideo+POSTtoken 2회. 공식관리API 기본1200회/5분(user/account token)이므로 1000명일제시작 약2000호출은 제한가능. CDN영상전송한도와 구분. 운영안정성완료표시금지. 권한검사유지·로컬서명/상태검증캐시 등 호출축소설계 후 승인된 단계부하검사 필요. 임의서명공유캐시·권한우회적용0.
- 현재ABR 자동화질/회원·구독별화질제한없음/1080수동선택UI없음. 1080원본+변환완료+통신조건 필요, 모든기기1080고정 보장아님. 실제유료NEON구매경유검증 미완료유지. 300MiB 업로드상한은고화질10분원본에제약가능; 증설·상향없음.
- 1000명×10분=10000전송분. 실제Starter기본5000분전부남았으면 초과약USD5/월기본포함합계USD10, 버퍼링/세금/환율/기존요금별도. 대규모검사는실행전비용·범위승인필요.
- 근거: https://developers.cloudflare.com/stream/ , https://developers.cloudflare.com/stream/faq/ , https://developers.cloudflare.com/stream/viewing-videos/using-own-player/ , https://developers.cloudflare.com/fundamentals/api/reference/limits/ .

- 최종225 d6d7a326b82ea95f03333bc68f12e71c557cfb63 / dep-dbcl7cgu01pc73bf8q7g LIVE. 운영노트200·수정본일치/health200, 실제브라우저새로고침후새제목확인. 신규기능·자원·부하발생검사추가0. 기존675변경0. 증빙 stream225-result.json / stream225-production-smoke.json / stream225-private-protection.png.


## 2026-10-22 최신226 — 동시 재생 API 병목 보완

- 매시청자 POSTtoken 제거: 서버 내 비동기RS256/30분서명/nbf-30초/downloadable:false. Cloudflare공식 고사용량 권장안. 기존 운영Render의 Stream권한으로 서명키1회생성, DATA_DIR/drama-stream-signing-계정.json 0600에만보관/기존암호화파일백업포함/로컬평문복사0. wx사전잠금/불완전파일자동대체금지/실패시반복키생성·원격token fallback금지. 기존API토큰권한확대·새외부수신자0.
- 영상별동시요청통합/보호상태·서명메모리캐시최대1024개·5분/오류2초/오래된성공결과재사용금지. video재확인/웹훅에서해당캐시무효화. 서로다른cold영상GET은최대8개동시·시작20ms간격. 서명키는재시작기존파일재사용.
- 앱권한캐시0: 매요청DB의공개상태·현재시청권·판매자제한확인후에만adapter호출. 기존30분URL의만료전효력은유지/즉시토큰폐기라고주장하지않음. 원본·행·운영/TEST삭제·마이그레이션0.
- 로컬합성1000동시 same영상 metadata1/tokenAPI0, different1000영상 metadata1000/tokenAPI0/동시조회최대2관측(상한8)/cold배치약30.3초(Windows모의응답간격포함, 운영응답시간아님). 관련10검사PASS(SQLITE/PGlite PG 권한회수·비공개·기존원본·이어보기포함). 최초로컬셸네트워크제한 및잘못된NODE_PATH로환경실패후 기존node_modules읽기/로컬HTTP허용 환경에서확인완료. 외부유료요청0.
- 실1000명사이트·DB·CDN장시간검증완료아님. 다수고유영상cold조회/다른관리작업합산API한도는별도용량조건. 새유료자원·증설0, 추가비용부하검사미실행. 기존675불변. 운영단일비공개영상서명재생최소확인후배포결과후속기록.
- 공식설계근거 https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/ .

- 최종226 b9e7c187c136e1b6414ea35ed848807349809406 / dep-dbclibss728c73anlm30 LIVE. 운영health200/노트200원본일치/catalog200공개드라마0/익명usage403 유지. 운영부팅서명키파일존재·600/별도최소확인에서기존키재사용·추가키생성0, 2회동시재생요청 metadata1/tokenAPI0/동일응답, 로컬발급서명HLS200/1080목록존재/rawUID401/download403/ttl1800·downloadable:false 실제확인. 새영상업로드·운영회원/거래/작품생성0. 기존비공개1080확인영상만사용, 사전storage0.1분/delivery0분포함범위. 실제1000개영상전송0. 새키는운영디스크에만보관, 기존재귀암호화파일백업의대상이며이번추가전체백업·복원검증을실행한것은아님. 증빙 stream226-tests.txt / stream226-production-smoke.json / stream226-production-signing.json / stream226-production-notes.png.


## 2026-10-22 최신227 — 1,000명 실검사 비용/무료 HTTP 확인

- 무료추가확인: 로컬HTTP 무료1000+합성시청권1000=2000성공, 상태API2/tokenAPI0/권한회수·비공개·판매자차단차단. 클라이언트128소켓/메모리SQLite/모의신원·provider, 운영PG·실세션·1000동시영상검증아님. scripts/check-stream-startup-local.cjs / stream227-local-http.json. 기존675변경0.
- 운영읽기UI storage0.1/1000·영상2·월delivery0/5000(지연가능), 기존b9e7c18 LIVE. 최신메모리약66.65MiB/512MiB·지연자료없음, 유휴메트릭을용량검증근거로사용하지않음. stream227-usage-observation.txt / stream227-resource-observation.json.
- 1000명1분=1000분/초과USD0,3분=3000분/USD0,5분=5000분/USD0(여유20%면USD1),10분=10000분/USD5(20%면USD7),30분=30000분/USD25(20%면USD31). 각1회독립/기본5000포함량전부남음가정/월기본USD5중복제외/세금환율별도. 선로딩·재시도·단계합산은추가된다. 상세 docs/novaplay-capacity.md 227.
- 실제발생기장비비별도미확정. 로컬회선수Gbps/외부분산도구의동시VU한도미검증이며무료500VUh만으로1000VU가능하다고하지않음. 유료/무료대규모실CDN검사는미실행,생성·가입·구독·증설0. 대표영상·단계합산·실행장비·총비용·중지조건확정후먼저알리고실행해야함. 3초저비트레이트컬러바반복을장시간검증이라고주장금지. 노트226배포유지/이번은문서·무료검사스크립트만저장하고재배포불필요.


## 2026-10-22 최신228 — NovaPlay 2단계 카테고리

- 사용자 드라마→로맨스판타지/현대물 등 요청. 대분류드라마(10종)·영화/단편(7종)·애니메이션(6종), 공통분류표 assets/drama-categories.js를프런트/서버공유. 상영관대분류·하위장르필터/건수·선택표시·빈결과/URL공유,작품카드·상세분류표시. 기존public catalog 최대100개범위 내클라이언트필터이며전체무제한탐색이라고하지않음.
- 작품등록category/subcategory필수select·대분류변경시하위선택초기화/명시적접근성이름/모바일16px. 서버허용조합만저장400, 기존JSON body에필드추가만/새테이블0. 구클라이언트분류누락저장시기존분류·장르유지. 기존자유장르추가장르·태그유지/미분류항목전체·미분류노출/자동재분류0. 기존공개작품수정은공개중지필요정책유지.
- SQLite·PGlite PG 관련5검사PASS, 합성로컬실제UI 로맨스판타지필터1작품·기존미분류작품category선택/저장복원/legacytag유지,390px두select16px/가로넘침0,영어필터전환. 5개보조locale분류키확인. 실제운영작품생성/영상전송/유료자원0. 기존675불변. 증빙 categories228-tests.txt / categories228-local-mobile.png, 실제배포후속기록.

- 최종228 d4f6fd6eb1d80f2314267b11ec3e3f9ee80b051f / dep-dbcm1sek1f9s73aqh92g LIVE. 카테고리관련공개6파일200·원본일치/health200/catalog200공개작품0보존. 실제운영로그인세션에서상위3분류·드라마하위10종·카운트/선택표시확인. 작품등록GET화면category기본drama·하위required10옵션·alert0확인,운영저장0. categories228-production-smoke.json / categories228-production.png. 로컬미리보기서버종료/임시뷰포트복구,기존675변경0. 개발자노트배포완료/인수인계228최종기록.


## 2026-10-22 최신229 — NovaPlay 검색창

- 상단검색form/제목·줄거리·creator·기존genre·분류/번역분류명/영문slug검색. NFKC·소문자·공백정리/120자/복수단어AND/includes문자열매칭(정규식입력실행0). 현재공개catalog최대100개범위클라이언트검색.
- #/theater?q=...·category·subcategory 함께유지/분류링크에q유지/검색해제는분류유지,검색기준건수·빈결과/Enter검색/모바일16px·390가로넘침0. 사용자검색어HTMLescape/새검색수집·외부검색API·운영자료변경0.
- 단위검사3PASS(기존분류·5보조locale유지/제목·줄거리·creator·legacytag·번역·공백/대소문자·필터교차), 합성실제UI romance1건·Enter빈결과·해제2건복원/분류유지확인. 기존675불변. 기존운영서비스에UI/번역/노트묶음배포/새유료자원0. 결과후속기록.

- 최종229 e19510925ccdff0bda99c7fbd64468f63a10aa90 / dep-dbcm5u6k1f9s73aqlg9g LIVE. 관련6공개파일200·원본일치/health200/catalog200공개작품0유지. 실제운영NovaPlay검색입력·placeholder확인. search229-local-checks.json / search229-production-smoke.json / search229-production.png. 로컬미리보기종료·뷰포트복구, 기존675변경0. 추가비용0/운영자료저장0/새수집0. 개발자노트·인수인계229갱신완료.


## 2026-10-22 최신230 — NovaPlay 포스터 업로드/썸네일

- 사용자 작품등록포스터/목록썸네일/기존보존/배포 요청. 기존서버FFmpeg·이미지워터마크convert재사용/새유료서비스·증설0. 5MiB·JPG/PNG/WebP·16MP·각변8192이하헤더검사후강제디코더변환/메타데이터제거/960px워터마크JPEG,포스터2:3권장.
- drama_posters 신규테이블/index추가만. DATA_DIR/drama-posters/UUID.original·UUID.jpg 0600. 기존원본/이력삭제0,교체때이전행active0/새행active1트랜잭션,성공전오류는새임시파일만정리. 작업폴더재귀합256MiB상한·사전여유524MiB·동시포스터1개·기존이미지작업slot/60초제한재사용.
- GET/HEAD /api/drama/poster?id=현재UUID: 공개/활성소유자작품또는owner/admin만보호JPEG,비공개익명/과거inactive404/no-store/nosniff,원본HTTP경로없음. POST는creator본인DRAFT·동일Origin·활성프로필만. backupGate안에서처리/파일+DB기존암호화백업대상(이번추가백업/복원실행아님).
- 작품form선택파일을JSON본문에서제외·작품저장뒤이미지업로드,첫저장이후이미지실패시dataset savedSeriesId로동일작품재시도/중복방지·오류안내. 새파일없으면기존유지/현재포스터미리보기,공개버튼도선택포스터먼저처리. 목록은보호이미지lazy/decodeasync+제목/분류오버레이,없는작품기존커버유지.
- 검사6PASS: SQLite/PGlite PG 실제PNG/JPG/WebP변환·공개/비공개·타인/Origin차단·교체3이력/원본그대로·손상/SVG/대용량차단·기존회차/이어보기. 합성실제UI파일선택/작품저장동시업로드·640x960표시/목록로딩·390px넘침0. filechooser에서도구응답지연이있었지만작품저장/이미지확인완료. 실제운영작품생성0·구매원본변경0·기존675변경0. posters230-tests.txt / posters230-local-thumbnail.png. 배포결과후속기록.

- 최종230 4391c47280967706096f5b612b8235a7836d2e0d / dep-dbcmkcrm8hqs73ag8ic0 LIVE. 공개5파일200·원본일치/health200/catalog200공개작품0유지. 존재없는poster404/익명POST401/저장0확인. 실제운영owner세션의작품등록posterFile선택/accept3형식·5MB안내·alerts0확인. posters230-production-smoke.json / posters230-production-upload.png. 로컬이미지실업로드·썸네일증빙은posters230-local-ui.json / posters230-local-thumbnail.png,운영썸네일실데이터를만들어검증한것은아님. 로컬서버종료·뷰포트복구/기존675변경0/새유료자원0. 개발자노트배포·인수인계230완료.


## 2026-10-22 최신231 — 등록 흐름·모바일 메뉴·포스터 즉시 미리보기

- 사용자 요청 묶음: 저장 후 단계1 초기화 원인인 재렌더 초기값 수정. step URL 유지/7단계(Creative Elements 제외)/정보 저장하고 다음 단계 버튼/중복 저장 잠금. 임시저장은 제목·분류·숫자 유효성 확인, 출판 필수조건은 기존 서버 심사 제출에서 계속 확인. 파일 업로드 성공은 DOM 목록만 갱신해 단계·미저장값을 보존. 원본/보호 미리보기 로컬 실제 업로드 성공.
- 제목·내용 한 칸씩. titleKo/descriptionKo/industry/creativeElements 및 제외 사양 width/height/3D format/AUDIO bpm/AI runtime은 숨김 값으로 보존·구형 브라우저 초안 복원 포함. 메타데이터 검증/공개 기존 상세는 유지. 최종 납품 세부사항 및 괄호 규격 예시 추가. thirdPartyAssets unknown 선택지 제거/미선택 안내, 기존 unknown을 no로 자동 변경하지 않음.
- 신규작품 항목별 견적 기본/기존 묶음 유지. 캐릭터·배경 금액 실제 입력·저장 확인. 가격 추가금액 직접 수정하면 명시 안내와 함께 LEGACY_BUNDLE 전환. 포함기본항목 로고/브랜드명/카피/색상0원 정책 유지. customizationDetails 9키 각1000자 서버 검증·보존/공개catalog/구매옵션 textContent/선택항목 quote 스냅샷. 계산금액·납품권한 정책은 변경하지 않음.
- 포스터 input change Blob URL 미리보기/교체/선택취소 기존복원/이탈시 URL해제. 저장 전 업로드0, 기존서버 보호이미지 저장경로 유지. 모바일 creator-menu/step nav wrap·높이/44px, PC step nav와 NovaPlay1120px 중앙 정렬. 5개 보조locale 신규키 반영.
- 무료필수확인: creator-workflow.test.cjs 12PASS + creator-metadata-input.test.cjs 1PASS. 격리실제server/API 합성회원의 모바일390px save/current step 및save-next/원본PNG·보호JPEG upload/가격25 및캐릭터12·배경8/설명저장/기존한국어·업종·story·1920x1080 보존 확인. Blob포스터800x1200→375x812 즉시교체·취소/DB series0 유지. 실휴대폰기종검증 아님. forms231-local-api.json / forms231-mobile-menu.png / forms231-mobile-upload.png. 원래675파일 변경0. 기존Render서비스/디스크만사용/추가유료자원·증설·실영상전송0. 배포결과 후속 기록.

- 최종231 3cc6453a7a0df35f0c8af88d629e039097918cde / dep-dbcstgvavr4c73d0g7ig LIVE. 공개10파일200·수정본일치, NovaPlay catalog200/공개작품0 보존. forms231-production-smoke.json. 운영 자료 저장0/유료자원0. 원래675파일변경0. 로컬 API·모바일 확인은 forms231-ui-checks.json / forms231-local-api.json에 기록했으며 실제 기종별 검수와 구분합니다.

- 운영 로그인 상태에서 실제 에셋 등록 상세정보의 7단계/제목·내용/최종납품 예시/저장 후 다음 버튼과 중앙 배치 표시를 확인했습니다. 운영 입력·저장·파일 업로드는 하지 않았습니다. forms231-production.png. 로컬 임시 미리보기 서버·탭 종료, 뷰포트 복구 완료.


## 2026-10-22 최신232 — 브랜드 적용 4항목 개별 유료 견적

- 사용자 명시요청으로 로고/브랜드명/카피/색상 ITEMIZED_SUM price0 강제/readonly 제한 제거. 0~1,000,000 정수 NEON·작업일 기존 검증 유지. 공통 assets/option-quote.js를 서버 creator/save, commerce-quote, sandbox-engine-core 및 구매UI가 함께 사용. 선택된 항목만 합산/이용권한/정산 정책 및 실제결제 활성화는 변경하지 않음.
- 기존 DB 마이그레이션/상품 일괄 가격 수정0, 기존항목0과 과거주문스냅샷 그대로. LEGACY_BUNDLE은 구조건 보존(기존 basic4항목 포함); 개별유료 설정은 항목별 모드 전환/저장 필요하며 UI 명시 안내. 등록의 기본가포함 안내 수정/5보조locale 반영. 역사적 개발자노트는 보존하고 최신글에 정책변경 명시.
- 필수검사: stage10-bundle sqlite48/PG48 PASS(4개개별/합계/0기존/legacy보존/음수소수상한차단/낡은예상견적차단/중복주문/스냅샷고정), creator-workflow12PASS(4항목2/3/4/5 저장·catalog·공통견적94). 구 stage10-closure의 price1거절 단언도 새정책에 맞게 수정(전체재실행아님). 실제 격리UI 4항목2/3/4/5 입력·서버저장·복원 확인, 추가금액합계14. 새유료자원·외부제공자호출·운영시험자료0. 배포결과 후속기록.

- 최종232 d74a358ecd18afb4c6411db0c110f839d33ae4b8 / dep-dbct4pm1egvs73f3scfg LIVE. 수정공개5파일200·원본일치, catalog200/기존공개상품 공통견적검사정상. brand232-production-smoke.json / brand232-local-ui.json / brand232-local-prices.png. 실제운영가격수정·주문생성·실결제0, 신규유료자원0. 격리로컬서버·탭종료/675파일변경0.


## 2026-10-22 최신233 — 구매자 추가작업 표시·선택금액 검증

- 사용자 구매자금액/세부사항/선택만합산 확인요청. 공통계산은 정상. 실제UI→review/checkout에서 expectedFulfillment/purchaseCountry 운영필드를 보내 review허용스키마가 INVALID_INPUT으로 거절할 수 있는 불일치 발견. frontend preview요청은허용기본필드만, realBilling운영요청은납품·국가포함 유지. 서버 스키마/권한/기존견적·주문/금융활성화 변경0.
- 구매항목카드 checkbox·금액·작업일·본문설명 aria-describedby/textContent, 기본가+선택추가=NEON/원화합계·작업일 aria-live 표시. 선택한키만공통quote/서버prepare로전달. 중복확인클릭잠금/오류표시. 확인dialog 서버snapshot.optionKeys/customizationDetails만 표시(스냅샷 구조 변경0/미선택설명제외). 기본적용포함 고정문구 수정. 모바일 landing.css의 small-note10px!important를 해당카드에만14px 밝은색으로교정,390px넘침0. 5보조locale신규키 반영.
- 실제app UI+실제 review-checkout.cjs+commerce-quote.cjs/메모리SQLite 합성상품/회원fixture: 기본100/항목2·3·4·5, API금액[10000,10700,10500,11400,10000]·선택[없음,logo+color,color,전체,없음]·설명키선택과일치/PG start 차단·호출0. buyer233-ui-requests.json / buyer233-selected-checkout.png / buyer233-mobile.png. 6언어 review-checkout-ui.test 6PASS(선택설명표시/HTML문자열텍스트/SDK인자모의검증·이탈정리). 실제결제/운영주문 생성0, 원래675변경0. 이번은선택금액전달·준비확인이고 계약후실승인검증과구분. 기존운영서비스에UI/안내/노트만배포/새유료자원0. 결과후속기록.

- 최종233 e5777bad285f08e49edbe2dc2f8e24dea248c4b7 / dep-dbctiu49v7es73bugd9g LIVE. 수정공개7파일200·수정본일치/catalog200. buyer233-production-smoke.json. 현재운영공개목록에itemized지원상품없음(publicOptionAssetId null)이므로 운영상품·주문을새로만들지않고 actual local review API로선택시나리오검증. 운영금융·원본·자료변경0. 새유료자원0/675파일변경0. 격리서버·탭종료/뷰포트복구. 개발자노트·인수인계233갱신완료.


## 2026-10-22 최신234 — 단일 단계 저장·NovaPlay 첫 영상/800MB/자동 공개

- 사용자 이전/다음·에셋정보임시저장 제거/주황 save-next 1개 요청. creator-draft-wizard 원submit 제거/상단 controls 제거/파일패널 form내step2 이동, 0~5정보저장후다음/6정보저장후심사제출 1개. 서버classification단계만제목없는초안저장 허용/DETAILS와최종submit완성검증 유지. 최종저장후실제submit연결/오류재시도same savedAssetId. 남아있던영문정규식요건을제목·내용비어있지않음으로수정(앞선통합언어입력요구). owner목록제목없는에셋표시/실입력title빈값유지.
- 새드라마form firstEpisodeVideo/선택title추가. series/poster저장→1화무료생성→local또는Cloudflare직접upload→publishWhenReady요청. 업로드불가상태disabled/MP4·크기/권리선확인. DB ID·firstEpisodeId 재시도재사용. 영상없으면DRAFT. 영상처리중은body.publishWhenReady=true/owner권한·상영권한·모든회차영상·활성creator 확인후 webhook/status에서PUBLISHED 전환(관리자승인없음), 중복알림멱등/처리중cancelAutoPublish지원,명시수정/공개중지시flagclear. 기존series/episode/raw파일삭제0,권한·유료회차정책 유지.
- cloudFileLimit800MiB=838860800 bytes/meta업로드와처리후 검증. studio videoByteLimit공급/Cloudflare20분800MB안내, 기존Render직접local300MiB·총600MiB상한 보존. 직접provider전송/TUS8MiB chunks 유지로800MB를Render에저장하지않음. 기존매월Stream기본·사용량과금융활성화조건그대로/새유료서비스·증설0. 실제800MB유료전송안함.
- 새작품link studio?new=고유값→빈form/제목포커스·기존내작품보존안내(기존동일hash무반응원인수정). 폼상태표시는poster상태대신직계role=status에표시. 자동공개history코드대신한글label. 새문구5보조locale반영.
- 필수검사 cloudflare-stream --test-name-pattern remote upload SQLite/PG2PASS(800정확허용·800+1차단/대기비공개/웹훅자동공개/중복1회/취소후DRAFT/기존유료권한); drama-theater 기존3PASS; creator-workflow13PASS(분류빈제목저장/상세빈제목거절/미완성제출차단추가). 실제격리UI 7단계연속저장/원본·보호미리보기/한국어metadata REVIEW, NovaPlay합성2초MP4저장·업로드·PUBLISHED→상영관1회차카드, 새작품emptytitle·oldseries보존. registration234-local-ui.json / registration234-theater.png. 실제Cloudflare전송0/운영상품·작품시험등록0/원래675변경0. 브라우저filechooser도구지연1회 있었지만업로드성공·최종흐름확인됨. 배포결과후속기록.

- 최종234 a5c948b8e4b40dddde2456a0fa2b11a4f064b882 / dep-dbctvt3m8hqs73anm5dg LIVE. 공개수정6파일200·원본일치/catalog200·운영공개드라마0유지. registration234-production-smoke.json. 실제상영관노출은격리API+실제로컬MP4로확인했고운영시험작품을생성하지않음. 실제Cloudflare800MB전송0/신규유료자원0. 임시서버·탭종료/675변경0.

- 운영 로그인 화면에서 단일 submit 버튼 텍스트·주황 rgb(255,107,43), 이전/다음controls 및 구임시저장button 부재를 DOM·화면으로 확인했습니다. registration234-production-asset.png.

- 운영 NovaPlay 로그인 화면에서 firstEpisodeVideo 활성입력과 Cloudflare800MB·20분안내, 고유new링크 표시를 확인했습니다. registration234-production-studio.png. 운영file선택·저장0/Cloudflare전송0.


## 2026-10-22 최신235 — NovaPlay 실제 Cloudflare 업로드·상영관 공개·재생 확인

- 사용자 실제영상연결검증 요청에 따라 운영 UI에서 직접생성 2초/160×100/2962bytes MP4 1개를 실제 Cloudflare TUS 업로드. 영상처리완료 알림으로 자동 PUBLISHED 전환(수동 publish/status 호출0), 상영관 카드·익명 catalog/series API에서1회차·무료·duration2·provider cloudflare 확인. 실제영상 버튼으로 HLS 재생 currentTime2/duration2/ended true/readyState4/error null, controlsList nodownload. 서명URL·업로드URL·키는 기록하지 않음.
- 확인용 series 9ac8703e-d2ee-4790-a83b-ce72b7294cd8 / episode 3eba051f-1403-476c-8178-81fd48e261a3 / media 161fe8d5-c586-48fa-9d43-2faedc85e0ac. 검증후 owner 공개중지→DRAFT, 작품·영상·기록 삭제0. 익명 catalog 제외/series404/media404 확인. 기존공개드라마0→확인용1→최종0. 운영·TEST·원본·원래미커밋 보존.
- 사전 최신운영UI 2026-10-22T12:22UTC 저장0.1/1000분·영상2·전송0/5000분·예상월USD5. 짧은1회재생은기존포함량내추가청구없을것으로예상/새유료자원·증설0. 사용량지연/확정청구서미확인. 공개가격근거 https://developers.cloudflare.com/stream/pricing/ ; 계정기본포함량은기존구매확인224와운영설정기준.
- 실제연결 smoke만확인,1080p/800MB실전송/1000동시재생/유료회차결제는미검증. 브라우저 filechooser.setFiles 도구응답약47분지연1회, 중복파일선택·중복업로드없이 단일작품완료 확인. 실제사이트업로드오류로기록하지않음. evidence stream235-production-result.json / stream235-public-theater.png / stream235-playback-ended.png. 추가코드수정필요없음/개발자노트반영배포결과후속기록.

- 사후운영사용량 2026-10-22T13:13UTC 저장0.14/1000분·영상3·전송0/5000분(지연가능)·예상월USD5유지. 확인영상은Cloudflare에비공개보존하며기존영상2개와기록은보존.

- 최종235 개발자노트 1c162e7ebf3bf0c046dc263010cc94e470d5ee3e / dep-dbd0om6k1f9s73b6aidg LIVE. 운영공개 developer-notes-data.js 200·로컬정규화원문일치·실검증신규항목확인(stream235-notes-deploy.json). 인수인계235완료/675보존변경0. 실제단일Cloudflare업로드·자동공개·1회재생후비공개보존 완료. 추가기능수정·증설없음.


## 2026-10-23 최신236 — 실제 1080p 업로드·재생 확인/화질 선택 보완

- 기존 합성 stream225-1080p-private-check.mp4(1920×1080/H264/24fps/3초/8647bytes)를 운영 새작품 form→Cloudflare TUS 1회 업로드/처리알림 자동공개 확인. series9d3320ad-265d-4f7c-b3b2-d05e7895b2f4 / episode9910c78f-9eb7-48ac-9109-6978af2272a9 / mediac868831a-4e5d-4682-8f0f-2a0849c33997.
- 최초 실제브라우저 native HLS 자동재생은426×240/끝까지정상. 원본1080만으로1080재생이라고기록하지않음. 플레이어 MSE지원시 hls.js 우선으로변경(native지원만시기존경로), 실제manifest levels로 자동·1080/720/480/360/240p UI구성/현재decoded resolution 표시/수동선택후종료영상처음부터재생/해제시정리. 기존권한·서명URL·다운로드제한유지. 5보조locale3문구추가.
- 배포0417fe8/dep-dbd2gktg1s2s738lnha0 후native우선경로에선선택UI숨김이므로0f0e8e1/dep-dbd2ht3m8hqs73auh930 LIVE로MSE우선수정. 동일영상 재업로드0. 수정후자동실재생1920×1080및1080p직접선택→currentTime2.999999/duration2.999999/endedtrue/readyState4/errornull/videoWidth1920/videoHeight1080/nodownload. stream236-decoded-playback.json / stream236-1080p-playback.png / stream236-production-result.json. 전체브라우저·모바일·네트워크·1000동시·800MB실전송·유료회차결제검증과구분.
- 사용자범위실재생만/대규모부하0. 사전저장0.14/1000분·영상3/사후0.19분·영상4, 전송0/5000분표시(지연가능),예상월USD5유지/포함량내추가청구없을것으로예상·확정청구서미확인. 새유료자원·증설0. 확인작품공개중지→DRAFT/영상·기록삭제0. 공개catalog제외·익명series404/media404 확인. 이전235작품과기존영상보존/원래675파일보존. syntax·5locale검사통과/실제운영UI필수검증완료. 개발자노트와인수인계236갱신/최종노트배포결과후속기록.

- 최종236 27994bb64b81ffb9599802cfd51788efb66df49a / dep-dbd2jcjm8hqs73aujkb0 LIVE. 플레이어·5locale·개발자노트 공개3파일200/검증원문일치(stream236-final-deploy.json). 동일1080p작품DRAFT·영상등록보존과이전235작품보존UI확인. 675파일변경0/추가유료자원0. 실제1080p선택·1920×1080종료확인완료/인수인계236최종갱신.


## 2026-10-23 최신237 — 휴대폰 화면 크기 화질 선택·1080p 확인/실기기 미검증 명시

- 사용자의 휴대폰검증요청. 연결도구 inventory는 Windows Chrome/IAB뿐으로 실제Android/iPhone연결없음. CUA viewport는width/height변경만지원(UA/모바일OS/터치에뮬레이션없음). 실기기확인으로표기하지않음. 기존236작품을DRAFT비공개owner미리보기로재사용/재업로드·재공개0.
- 390×844 viewport에서 실제Cloudflare재생→1080p선택/decoded1920×1080/currentTime2.999999/duration2.999999/endedtrue/readyState4/errornull 확인. playsinline기존유지. 초기글자13px·조작부89×47 관측/가독성개선필요. .drama-quality-control class 및 CSS16px/최소48px높이·112px너비/12px간격/줄바꿈/포커스 추가. 보안·재생서명·권한·유료설정변경0.
- stream237-before.json에실기기false/viewport측정임을명시. 지원HLS라이브러리1.6.13에ManagedMediaSource의disableRemotePlayback처리코드존재를읽기확인(실제iOS동작통과로처리하지않음). 기존native전용브라우저는자동HLS경로/수동화질선택미지원일수있어실기기확인대기.
- 사전현재UI 2026-10-23T00:24UTC 저장0.19/1000분·영상4·전송0/5000분표시(지연가능)·예상월USD5. 기존영상소수재생만/포함량내추가청구없을것으로예상·확정청구서미확인. 신규유료자원·증설0. 기존운영·TEST·원본·미커밋자료보존. 개발자노트·인수인계237갱신/운영배포후화면·필수재생결과후속기록. 실제Android/iPhone·모바일Safari·삼성인터넷의터치/전체화면/통신망확인은미완료.

- 최종237 ca6643b0b0a020b1c44dfa631fde4d9e88f518c2 / dep-dbdajdlbedkc73cpijj0 LIVE. 수정플레이어·CSS·개발자노트3공개파일200/원문일치(stream237-final-deploy.json). 배포후390×844 실제Cloudflare 1080p선택→1920×1080/2.999999초종료/errornull/readyState4 확인. 조작부16px·112×48 실측/가로넘침없음(문서375/뷰포트390). 추가재생없이320×740으로줄여조작부left86.69/right198.69/16px·112×48/문서305·뷰포트320넘침없음확인. stream237-production-result.json / stream237-phone-viewport-1080p.png. viewport복구/비공개DRAFT보존/업로드·공개0/675변경0. 실제휴대폰검증미완료상태유지.


## 2026-10-23 최신238 — 실제 두 판매 영상·비독점 계약·추천/어워드 및 지정 계정 한도

- kanoe0213@gmail.com(Uyunia) 명의. 향수 6441d0b7-92a8-4772-a2a6-58aa11c45b33 / 공개1003 / VIDEO Commercial /399 NEON·제품 교체만70 NEON·자료 제출 후1일. 쇼핑쇼츠 f3c87300-8194-405e-b9ae-465a1d14d6b8 / VIDEO Shorts/Reels /199 NEON·자막 변경만70 NEON·1일. 두 작품 MULTI·2026-10-11-v1 비독점 계약으로 사용자 최종 동의 후 제출. 상업적 이용·수정 허용/제작 도구·음원·폰트·상표 자체 권리와 별도 라이선스 재판매 권리 제외 고지. 직접 제작 도구 Higgsfield 및 포함 소재 상업 이용 권한은 사용자 확인 사실만 기재.
- 향수 ACTIVE. 쇼핑쇼츠는 기존 독점 REVIEW를 수정 요청→MULTI 재제출했고 Free 판매중1개 한도로 승인 보류. 사용자 추가 결정: kanoe0213@gmail.com 및 hisoka1030@gmail.com의 판매중 에셋 수량만 무제한. 서버 DB의 로그인 계정 이메일 해시로 정확히 대조하고 해당 운영 서비스에만 적용. 유료 구독·잔액·관리자권한·업로드 용량·저장 한도 부여 없음/청구 없음. 일반 회원은 기존 플랜 한도 유지. 두 계정 25개 기존작품에서도 신규 활성화 가능, 유사주소·일반계정 제한 및 금융활성화 차단 테스트 통과.
- 기존 실제 TEST2개 PAUSED/예시8개 데이터 archivedDemoAssets 보존. 원본·운영·TEST·기존 미커밋 보존. 쇼핑 원본 중복 방지에서 재업로드 차단되어 기존 동일 계정 쇼핑 원본3개를 보존·재사용(원격 다운로드 해시 동일성 검증은 미완료로 명시). 불필요한 파일 없는 초안도 비공개 보존. 보호 미리보기·썸네일만 공개/원본 비공개. 향수 원본HEVC1080p30.05초 보존, 공개본은 호환 H264720p12초 파생본. 쇼핑 H264720×1280 15초 원본/12초 공개 미리보기.
- 메인 추천/어워드의 고정 예시와 prototype 문구 제거, 공개 실제 카탈로그만 렌더링/3·4번 빈 자리·비활성. 이름과 추천 문구 직접 연결. 반복 영상은 보이는 영역·현재 슬라이드만 재생, 페이지 전환·배경·동작축소 시 중지. 모듈/카탈로그 로드 순서 경쟁 초기화 보완. 권리 제외·제한 정식 입력란 및5언어 라벨 추가. 배포 후 쇼핑 승인/두 공개작품·금액·보호·링크 확인 결과는 후속 기록. 신규 유료 자원·플랜·증설 없음.

- 238 공개 검수: 8f61ffb6f3d097e6bd5a1bd25eb1594286007b07 /dep-dbdbp26417fc738en2k0 LIVE 후 쇼핑 승인 성공. 공개1003/1004, 총2개, 모두MULTI/399·199/추가항목각70·1일. 개인 플랜 화면 FREE 및 판매한도무제한·별도청구없음 확인. 등록 당시 legacy 한국어 소개 sdf 필드는 저장 보존하되 통합 제목/내용만 공개하도록 중복 소개 제거. 동적으로 남아 있던 독점 홍보문구도 함께 수정. 보관 원본의 이름·크기·SHA256가 모두 같은 경우 새 주문 납품목록만 중복 제외, 기존 실파일과 주문 불변. 로컬41개 실제 주문/원장/보호납품 검증과 한도/중복목록2개 테스트 PASS·외부호출0. 최종 배포와 화면/보호 확인 결과 후속 기록.

- 238 최종 완료: 58867560e9d9e2b1c02e00362943e9e08f39a75f / dep-dbdbrelg1s2s73dgd6ug LIVE(2026-10-23T01:53:10Z). 운영 카탈로그 실제2개 1003/1004 모두 MULTI, 개인 Uyunia 명의399/199, 선택항목 productModel/other 단1개씩70·1일. 구매자 UI 옵션 선택 시469/269 NEON·1일 확인/결제 시작·청구·환불·정산 실행0. 메인추천 및 어워드 슬라이드 각각1003/1004 매핑, 3/4번 disabled 빈 자리. 추천 클릭→1004 상세 연결. 두 추천 영상 readyState4/errornull/실제 재생시간 증가(향수1280×720/쇼핑720×1280). 원본 익명 공개경로2개404 차단. 공개 JS4개200/UTF8원문·줄바꿈 정규화 일치. 구 한국어 sdf 소개 미표시/자료는 보존. 675파일 비교 변경0. 신규유료자원·유료구독·잔액·관리자권한·용량 증설0. 지정 Gmail2계정 판매 수량만 무제한, 일반 회원 기존 한도 유지. 개발자노트 운영 공개/인수인계238 갱신. 증거 market238-final-marketplace.png / final-ui.json / final-deploy.json / original-protection.json.
- 검수 한계: 실제 PG 결제·구매 후 다운로드는 미실행(현재 운영 화면은 심사용 결제 준비 상태 유지). 로컬 주문/원장/보호납품41항목 및 중복 납품목록·계정 한도 테스트로 확인했고 별도 제공자 비용은 만들지 않음. 최초 원본 차단 확인 중502는 배포 재시작 구간 응답으로 최종LIVE 후404 재확인. 최초 공개 파일 문자열 비교는 HTTP응답 인코딩 차이였으며 UTF8바이트 기준4파일 일치로 해소.


## 2026-10-23 최신239 — 삭제·플랜·심사용결제·제출안내·전체 보호영상·썸네일 문구

- 사용자6항목 요청. DRAFT/PAUSED 삭제 버튼·confirm:true 재확인·동일계정 검증. 거래·TEST구매·납품원본 참조가 있으면 삭제 차단. creator_asset_deletions 정리 큐/실파일 unlink 후 메타파일 행 제거/실패 시 다시시도. 기존 creator_assets 상태는 PAUSED+별도 삭제이력으로 보존해 기존 PostgreSQL 상태CHECK와 호환. 삭제된 항목 관리자 재공개 차단. UI실제 파일 정리와 기존 백업 보존 구분. 기존 운영작품 실제 삭제0(로컬격리fixture만 실제삭제확인).
- 에셋 한도 오류에 #/creator-plan 플랜 안내 링크. 두 제출 경로에서 ‘심사 제출이 완료되었습니다.’ 전환후status 안내. 마켓 카드의 긴 spec/납품문구 오버레이 제거, 워터마크 유지.
- 구독 팝업 버튼 ‘심사용 결제’, 확인란 미체크시 활성화안내/체크시 준비완료/클릭시 결제창여는중·이동안내, SDK20초로드제한·오류시재시도. 배포전기존버튼도 확인란체크 후 실제 토스 테스트 카드등록화면까지 열림을 확인(카드정보/주민정보/약관 체크·제출0). 오류확정으로 과장하지 않음. 결제취소 후 복귀. 증거 market239-toss-before-fix.png.
- 12초는 의도된 짧은목록미리보기. 상세는 detailPreview 별도 워터마크 전체본(최대20분, 기존1280폭/호환H264/AAC) 생성·보호증명·용량검증·중복생성방지·삭제작업과경합차단. 원본private/구간미리보기보존. 새영상 심사제출시 전체본 준비, 기존작품은 내에셋 생성버튼. 공개 API는 검증된 detailPreview만 제공, 상세클립URL 우선/다운로드UI숨김.
- 필요한 로컬확인만: SQLite/PGlite PostgreSQL 계정격리·실제용량반환·거래/납품참조차단·재시도 PASS, 기존 catalog-admin14항목 PASS, 영상15초전체본·보호지문·원본SHA256불변/중복생성방지 PASS, 기존creator-api PASS. 첫 로컬미디어검사 Windows sandbox 파일rename EPERM은 임시fixture 한정실행권한에서 재검증PASS로 해소. 신규유료자원·구독·용량증설0. 배포후현재두작품전체본/화면 결과 후속 기록. 개발자노트·인수인계239갱신.

- 239 추가 사용자 요청 반영: 마켓 공통 탐색영역 주황 ‘내 에셋 등록’ 링크. 필수분류·하위분류/제목·내용/납품세부/가격/원본·미리보기/제3자소재·직접작업/계약·권리 확인을 공통 검증모듈로 서버·화면에서 일치시킴. 빨간 (*필수 작성란입니다*) 표시, 마지막 단계 누락·오류 요약과 각 입력 단계 바로가기. 성공 시 등록화면 step6으로 이동·녹색 비활성 ‘심사 제출되었습니다.’ 버튼, 진행 중 상태/오류 시 재시도 문구. 프레임레이트·파일형식은 선택이며 원본 업로드 때 ffprobe 메타데이터에서 비어있는 사양만 자동 채움. HTTP JSON이 아닌502등 응답 친절한 메시지 처리. 업로드/아바타 오류 처리 변수명 치환 문제도 수정.
- 첫 배포3c530d46ae45535279503701498eb055c4f042c9 / dep-dbdc6bc9v7es73dqgn60 LIVE. 수정JS4개200/원문일치, 개인 내에셋 삭제4개 버튼 확인(실제삭제0). 실제쇼핑 full보호본585bae48-f1e4-4c26-aef2-fcfcc57b0775 생성→상세 duration15/currentTime15/endedtrue/errornull/readyState4 재생확인. 향수전체변환 중02:17:49UTC 서버재시작 로그와 비JSON응답 확인(메모리초과 직접로그는 없어 원인을 확정하지않음). FFmpeg 디코더·인코더·필터1스레드로 제한/로컬 실제HEVC1920×1080 30.05초 전체변환5581388바이트·메타24fps/MP4 HEVC 판독 성공. 이 설정 배포후 운영향수 재시도 예정. 보호원본 및 쇼핑완료본 유지/신규유료자원0.
- 필수누락/선택사양 단위검증·기존creator-api PASS. 기존문구 계약/이용권한 테스트 기대를 누락항목 이름을 포함하는 오류로 유지했고 상세missing 배열도 제공. 추가 재제출을 운영자료로 시험하지 않음(실제계약 동의가 필요한 사용자 신작에는 관여하지 않음). 후속 화면검수는 빈 등록화면에서 누락안내만 확인해 새 TEST 자료를 만들지 않음.


### 239 최종 운영 확인 — 2026-10-23
- 운영 코드 ea99cc84b0bfefdb3b302e2886b188bcc6b75257 / Render dep-dbdcdap5efls73ams740, LIVE 2026-10-23 02:31:00 UTC.
- 마켓플레이스 주황색 '내 에셋 등록' 바로가기 적용. 카드 썸네일의 긴 사양·납품 글씨 제거 확인(미디어 내 meta 0개); 보호 워터마크 유지.
- 필수 입력란 붉은 표시 및 누락 목록·단계/항목 바로가기 적용. 빈 신규 화면 제출 시 저장·제출 요청 없이 차단하고 제목 링크가 실제 입력란으로 이동함을 운영 UI에서 확인. 사용자 기존 초안 829d6bd8-88cb-491e-b15f-2127031b18a2 변경·제출하지 않음.
- 프레임레이트·파일 형식은 선택 입력이며 원본 영상 업로드 시 빈 값만 자동 감지. 제출 성공 시 같은 화면에 녹색 '심사 제출되었습니다.' 표시. 새 계약 동의/실제 신규 제출을 통한 성공 상태 시험은 하지 않음(공유 검증 및 API 검사 통과).
- 삭제 기능: 본인 임시저장·판매중지 작품만 확인 후 삭제 가능. 거래/납품 참조 원본은 차단. 미참조 운영 파일 실제 삭제 및 재시도/중복 방지, SQLite·PostgreSQL 검사 통과. 감사·계약 메타데이터와 기존 백업 보존. 기존 작품 실제 삭제 0건.
- 한도 오류 플랜 안내 링크, 심사용 팝업 안 '심사용 결제' 버튼 및 확인란/진행 상태 안내 적용. Toss TEST 카드 입력 화면 도달 확인; 카드 입력·결제 승인·정기청구 실행 없음.
- 운영 상세 영상 쇼핑쇼츠 15초, 향수 30.05초 모두 끝까지 재생(ended=true, error=null). 짧은 목록 미리보기 유지. 보호된 전체 미리보기 파일: 585bae48-f1e4-4c26-aef2-fcfcc57b0775 / a38d9840-2045-497f-8310-2e46cbea34dc. 원본 익명 접근 2건 모두404.
- 향수 최초 변환 중 502 및 재시작 관측(원인 확정 아님). 디코더·인코더·필터 각 1스레드 제한 후 재생성/끝까지 재생 완료. 서버 증설 없음.
- 공개 파일 6개 배포 일치, 보존 대상675개 변경0. 신규 TEST 작품0, 신규 유료 자원0. 증거: novanoxx-stage10-evidence-20261017/market239-*.json 및 PNG. 실제 PG 승인·자동청구·지급대행은 기존 계약/운영 설정 대기 유지.


### 240 등록 피드백·추가 작업 선택 보완 — 2026-10-23
- 필수 항목: 붉은 필수 안내에서 유효 입력 시 녹색 작성완료로 즉시 전환. 카테고리와 상업적 이용·수정 허용도 표시하고 제출 검증과 일치시킴. 선택 항목 공란 허용, 선택 추가 작업의 빈 금액·작업일은0 처리. 입력한 값의 형식 제한은 유지.
- 전부 작업 불가: 다른 항목·견적·금액·작업일 회색 잠금, 해제 시 복구. 서버는 해당 선택을 저장할 때 옵션false/기타없음/추가금액0/작업일0/등록최종본 즉시제공으로 정규화. 기존 공개 작품은 변경하지 않음.
- 묶음과 항목별 견적 설명을 실제 가격 계산에 맞춘 예시로 확장. 묶음의 기본 브랜드 항목 무료 조건 유지. 즉시제공 체크박스와 문구 정렬, 상세정보·가격 단계 제목 추가, 미리보기 버튼 하단 왼쪽12px 정렬 및 실제 짧은 보호본 길이 표기.
- 제출 성공 시 기존 녹색 심사 제출되었습니다 상태 유지. 로컬 격리 UI에서 작성완료 전환·잠금/해제·제목 확인. 입력검증/선택사양/서버옵션정규화/기존API 검사4개 PASS. Windows 제한으로 파일 변환 검사는 임시자료에 한해 제한 밖 실행해 통과. 운영 신규 계약 제출·파일삭제·청구 없음. 신규유료자원0. 운영 배포 확인 후 결과 추가 예정.

- 240 최종 확인: 9c3cd0e20db7f8f3c9c00530474653ee7627778d / dep-dbdcundg1s2s73dhct50 LIVE 2026-10-23 12:08:02 KST. 공개 파일5개 수정본 일치. 운영 UI의 가격 제목·녹색 작성완료·견적 예시·즉시제공 체크박스 확인. 미리보기 버튼3개 모두 bottom12px/left12px 확인(사용자 신규 공개작품도 유지). 기존675개 변경0, 운영 신규저장·삭제·계약동의·실청구0. 증거 creator240-result.json / creator240-production-price.png / creator240-production-preview-controls.png. 개발자노트 운영 반영 완료.


### 241 종류별 최신 업로드 1개 유지 — 2026-10-23
- 동일 작품의 원본·짧은 미리보기·썸네일을 종류별 최신1개로 교체. 새 파일 및 보호 증명 커밋 후 이전 파일을 물리 정리하며 실패 업로드는 이전 파일 유지. 파일 목록을 업로드 직후 서버 응답으로 교체(계속 append하던 원인 제거). 여러 납품 파일은ZIP1개 안내. 작품 수·플랜 한도는 변경하지 않음.
- 신규 creator_file_replacements 정리 이력으로 재시도/감사 보존. 시작 시 기존 중복도 최신 파일 존재·크기·보호 확인 후 거래 참조 없는 파일만 정리. 거래·TEST구매·납품 참조가 있으면 파일 교체와 물리 정리 차단. 기존 백업은 유지.
- 원본 변경 시 이전 상세 전체 보호본 무효화, 다음 제출에서 최신 원본으로 생성. 원본/짧은 미리보기/상세 전체 미리보기 명칭 구분. 파일 처리 중 중복 업로드·제출·삭제 차단.
- SQLite·PGlite PostgreSQL 교체/중복정리/거래보호, 업로드 성공·실패와 기존API, 전체15초 보호본, 기존 삭제 보호 총6개 PASS. PGlite는 기존 live/node_modules를 읽기 전용으로 이용(신규 설치 없음). 신규유료자원0. 기존 로컬 보존 대상675개 확인 예정. 배포 후 운영 정리 결과 추가.

- 241 최종 운영 확인: a7e15d1aa7fe6e52c8df256be7bf077e686ca73d / dep-dbdd5up42hec7391ic40 LIVE 2026-10-23 12:23:29 KST. 서버 시작 정리 결과 retired4 / freedBytes19203086 / cleanupPendingfalse. 기존 공개3작품 유지, 전체 보호 영상3개 1바이트 범위 요청206, 공개JS2개 수정본 일치. 쇼핑쇼츠 파일6개→4개(원본·짧은 미리보기·썸네일·별도 전체보호본 각1) 운영 UI 확인. 기존 로컬 보존675개 변경0, 신규운영작품·결제·유료자원0. 개발자노트 운영반영, 증거 creator241-result.json / creator241-production-file-slots.png. 기존 백업과 거래 참조 파일은 보존.


### 242 다섯 언어 UI 번역·전환 보완 — 2026-10-23
- en/es/zh-Hans/vi/de 등록 UI·안내1876키 번역 존재·자리표시자 일치, 정적표시/접근성/리터럴 uiText·uiMessage 원문 키 누락 검사. 최근 등록·작업불가·견적·파일교체/삭제/보호본·오류 안내 보강.
- 동적 문구도 원래 키와 값을 보존, 이미 번역된 문구로 생성된 라벨 역방향 키 복원, 안전한 값 치환/HTML 이스케이프 적용. 폼 재렌더 없이 언어 전환해 입력·선택파일 보존. 카테고리 기본어휘를 선택언어로 표시. 사용자 제목·설명·프로필 및 계약 원문은 번역 대상 스캔에서 제외.
- 로컬 등록7단계×5언어35화면의 표시된 번역대상 한국어잔여0, 실제 제목 입력값전환보존 확인. 단위검증5 PASS, 안내/계약참고번역20조합 링크/버전유지 PASS. 개발자노트 외국어 요약+한국어 개발원문 구분. 전문원어민/법률감수 또는 모든 동적오류경로 수동검증 완료 주장은 하지 않음. 신규유료자원·외부번역서비스0. 배포 후 확인 추가 예정.

- 242 최종 배포: 3b0ebb00c277254033ad061baf59ea55b8db29c1 / dep-dbde8mu1egvs738iulpg LIVE 2026-10-23 13:37:29 KST. 최종등록1880키×5언어, 핵심공개파일8개 수정본일치. 운영 스페인어 등록/파일화면에서 종류별파일명칭·교체안내·선택구간 안내 번역 및 원문파일명유지 확인. 로컬크리에이터진행4단계·프로필언어표시추가누락도수정/확인. 기존675파일변경0, 운영신규작품·금융실행·유료자원0. 브라우저의 기본 파일선택 문구/OS대화상자는 브라우저·OS언어에 따르며 사이트 번역키 대상이 아님. 증거 translation242-report.json / stage-audit.json / local-ui.json / public-files.json / result.json.


### 243 파일 선택 다국어 UI·토스 퀵오픈 확인 — 2026-10-23
- 파일 선택/선택된 파일 없음 6개 언어 표시. 원래 input/FileList/onchange 유지, 사용자 파일명 번역하지 않음. 새 버튼은 명시적 사용자 조작으로만 기본 파일창 열기. disabled/fieldset 잠금·선택 취소·폼 reset 반영. OS 파일 탐색기는 기기 언어 유지. 기존 파일·DB·작품·TEST·백업 변경 없음.
- 로컬 격리 NovaPlay 포스터 실제 선택 후 6언어 전환에서 파일명·제목 유지, 취소 후 빈 안내 복귀, 에셋 3개 파일버튼 disabled 일치 확인. 번역1882키 누락0, 기존 언어검증3 PASS. UI 범용 향상만 변경, 추가 서비스 비용0.
- 토스 상점1849825, 퀵 MID q_novanosg5t 및 q_novanor3sf 심사중(일반 novano8ls7도 심사중). 취소된 MID cp_onovan1g8y/novano38ky/novanocaa9와 구분. 최신 퀵 MID API개별연동 라이브 화면에서도 계약미완료 라이브결제불가 안내 확인. 카드사 심사결과 미신청. 키 보기/복사/재발급·라이브 활성화·결제·계약변경 실행0.
- 이용정보 안심정산플랜 연이용권13,250원/결제필요 표시 소유자에게 사전안내. 결제하지 않음. 계약/퀵오픈 활성 상태와 허용 결제수단·수수료·정산 조건 확정 후 정확한 MID의 LIVE 키를 운영 비밀 환경변수에 등록하고 기존 계약·대사 승인 게이트를 별도 검증해야 함. 구독빌링·NEON유상충전·지급대행을 퀵오픈 승인으로 간주하지 않음. 기존 operating-commerce/financial-provider의 NNX_TOSS_LIVE_CLIENT_KEY/NNX_TOSS_LIVE_SECRET_KEY/NNX_LIVE_PAYMENTS/NNX_PAYMENT_CONTRACT_APPROVED/NNX_OPERATING_RECONCILIATION_APPROVED 준비 유지. legacy TOSS_CLIENT_KEY/TOSS_SECRET_KEY에는 live키 넣지 말 것(심사용 TEST와 충돌).
- 배포 완료 후 운영 확인 결과 추가 예정.

- 243 최종: 21c3dcb8f26093460e687ce38832a013a779d506 / dep-dbdej4k9v7es73dsoll0 LIVE 2026-10-23 13:59:58 KST. 공개정적파일5개 수정본일치, 동적index 새script/css참조확인. 운영 파일버튼3개 Choose file/No file selected 표시, 한국어복원. 운영 commerce/status realBilling=false/subscriptionBilling=false 확인. 새실결제·신규키·유료자원·운영파일업로드·삭제0. 기존675개변경0, 기존개발자노트원문전부동일. 증거 filepicker243-local-checks.json / public-files.json / production-en.png / result.json.


### 244 퀵오픈 판단 정정·심사용 상품 결제창 실확인 — 2026-10-23
- 공식 https://www.tosspayments.com/quick-open 에서 가입/연동 후 심사중 선결제 가능 확인. 243의 개발자센터 일반 계약경고를 퀵오픈 전체 결제불가로 해석한 결론은 철회. 심사중 라벨/일반경고만으로 퀵오픈 비활성 단정 금지. 퀵오픈 매출은 카드사 심사결과 안내일부터90일뒤정산, 서비스신청90일내심사미완료시이용불가.
- 운영 실제 상품1005 상세 → 심사용 결제창 열기 → 안내확인 → 심사용 결제에서 토스 카드선택창/100,000원/실제결제가안되는테스트표시 확인. 카드선택·인증·승인·청구·파일권한부여 없이 중단. 심사준비용 review_checkout 기록만 생성, 금융 주문/원장 변경 없음. 증거 quickopen244-test-checkout.png. 기존 작품/파일 보존.
- 공식 계약FAQ는 메인→상품→결제→토스창의 결제경로PPT 준비를 안내. 열려있는 계약메일은 일반 MID novano8ls7 기준, 확인한퀵MID q_novanosg5t와구분필수. 메일/담당자연락/제출/임시보관본문변경0.
- 안심정산플랜 화면: 월정산한도10,000,000원·결제일부터1년·총13,250원. 결제창설치비아님, 테스트창연동에선결제불필요(미결제상태에서창열림). 안내에 보증보험이용시고객센터문의 명시. 해당가맹점담보조건면제/대체가능여부는 개별계약확인필요, 무조건무료/필수라는단정모두금지. 일반블로그의1000만원보증보험면제문구는개별계약의연이용권면제보장아님. 결제/플랜취소/담보변경0.
- LIVE 키/승인게이트/자동구독/NEON유상충전/지급대행활성화없음. QuickOpen공식제외업종에포인트충전/2차PG포함하므로에셋단건결제와혼동금지. 기존정산대사/계약승인게이트를우회하지않음. 실제일반결제전환시정확한퀵MID·허용품목/수수료·90일정산조건·라이브키연동범위별도확인필요. 신규유료자원0.


### 245 퀵오픈 실결제 연결 준비 — 2026-10-23
- 사용자의 결제연결 요청에 따라 payment-activation으로 일반계약과퀵오픈승인을구분. NNX_QUICK_OPEN_APPROVED=1, NNX_TOSS_MID=q_novanosg5t, NNX_QUICK_OPEN_SELLER_EMAILS=kanoe0213@gmail.com 일때 자사ASSET만허용. 다른회원/Brief는주문생성전차단, 기존준비주문도판매자범위변경시재검증. 승인mId까지일치확인.
- 구독은퀵모드에서강제비활성화, provider의빌링키발급/자동청구도차단. 실제결제대상아닌작품은기존심사창유지. 새 commerce/availability GET은명시상품의적격불린만반환하며회원인증필수. 구독/기존TEST심사모드유지. 신규스키마/파일변경/자료삭제없음.
- 카드수수료3.2%, 부가세포함보기3.52% 운영상점수수료표직접확인, 소유자에게사전안내. 무이자할부는별도추가수수료. 13,250원결제0. 신규유료자원0.
- 격리PostgreSQL/SQLite·모의제공자: 기존결제경계/중복/복구/납품권한/구독/시작바인딩과퀵오픈범위/잘못된MID/가격변조/범위회수15검사PASS. 번역1883키누락0. 실제금융API호출0.
- 활성화예정변수: NNX_QUICK_OPEN_APPROVED=1, NNX_TOSS_MID=q_novanosg5t, NNX_QUICK_OPEN_SELLER_EMAILS=kanoe0213@gmail.com, NNX_PAYMENT_CONTRACT_APPROVED=0(일반계약완료로간주금지), NNX_LIVE_PAYMENTS=1, NNX_OPERATING_RECONCILIATION_APPROVED=1, 해당MID의NNX_TOSS_LIVE_CLIENT_KEY/SECRET_KEY. NNX_BILLING_CONTRACT_APPROVED=0, NNX_SETTLEMENT_CONTRACT_APPROVED=0. 기존TOSS_CLIENT_KEY/SECRET_KEY는설정금지. 운영키등록은행동직전권한확인후. 키값은소스/채팅/증거자료에저장금지.
- 244정정노트 29a8d0492e57cf8f1f4eb0582b42650f2a6000db / dep-dbdmgeh5efls73b29teg LIVE 2026-10-23 23:00:43 KST.

- 245 연결준비코드 1135ff7928530d665f4fd098fb3001c19685d387 / dep-dbdmmqtbedkc73d71ak0 LIVE 2026-10-23 23:13:55 KST. 운영 availability?assetId=1004 realBilling=false 확인(의도한 키등록전 상태). 기존675개변경0. Chrome의정확한운영Render서비스Environment및퀵MID라이브키선택화면준비, 비밀키복사/노출/등록/실청구0. 실행직전확인질문후응답대기.


### 246 NEON 구매 유지·작품 카드 직접결제 비활성·필요 계약 확인 — 2026-10-23
- 사용자 최신 지시: 작품은 NEON으로 구매, 작품 카드직접결제 켜지 말 것. 245 운영키등록확인요청은 취소됨. 이후 과거질문답변만으로카드직접결제권한부여금지. 실제키복사/등록/실청구/정산0.
- payment-activation.directEnabled는 NNX_DIRECT_ASSET_CARD_PAYMENTS=1을별도로명시해야만true. 운영기본0/미설정차단. 일반PG/퀵오픈키만설정해도commerce주문생성/시작불가. 미래NEON충전/구독계약을작품카드직접구매권한으로간주금지. 기존NEON가격·TEST원장·작품·거래·파일 보존. 테스트용직접결제시나리오에만명시적옵트인추가.
- 공식2026-07-01전자결제약관제17조3항: 포인트충전등환금성상품은인증강화및사전신청승인필요. 일반PG신청에NEON유상충전→에셋사용→판매자원화정산구조를명시하고충전업종허용·카드제한·보유/충전한도·환불정책·정산주기·담보·오픈마켓/2차PG분류·관련추가요건을서면확인할것. 단일패키지의공식명칭/승인가능여부는현재확정안됨.
- 플랜: 공식빌링안내상추가리스크검토및계약필수, 빌링전용MID/키필요. 퀵오픈가입만으로정기청구가능하다고단정금지. 현재novano8ls7/q_novanor3sf/q_novanosg5t는확인화면상모두심사중·카드결제방식일반, 빌링승인/지급대행승인확인못함. 서비스추가신청메뉴에빌링(정기결제)/지급대행구분확인, 어떤신청도제출안함.
- 판매자정산: 별도지급대행계약, PG충전매출→내부NEON사용/환불→셀러지급그룹자금연결허용확인, seller KYC/계좌/수수료/지급보류조건/취소회수조건 필요. 공식공개신청안내(2024-09-23게시,현재게시중) 월30만원/1000건포함/초과건당100원. 노바녹스현재견적/VAT/초기비용확정아님. 라이브지급대행테스트도수수료발생하므로실행금지. 신규신청/약관동의/보증료/13,250원이용권결제0.
- 남은개발정직하게구분: 현재neon-payments는TEST키/TEST원장경로임. 실제유상NEON원장·원결제별잔액·사용분취소/환불·차지백·판매자정산자금대사는계약조건확정후추가구현및검증필요. 계약키만바꾸면완성이라는설명금지.
- 공식근거: https://pages.tosspayments.com/terms/onboarding-260701/ ; https://docs.tosspayments.com/guides/v2/billing/integration ; https://docs.tosspayments.com/reference/additional ; https://www.tosspayments.com/blog/articles/30355 ; https://www.tosspayments.com/quick-open .
- 담당자문의준비문(미발송): 노바녹스는1NEON=100원으로유상충전한NEON을디지털에셋구매에사용하고,크리에이터에게원화정산하는마켓플레이스입니다. 작품카드직접구매는제공하지않습니다. (1)충전업종PG및오픈마켓사업모델승인/MID/인증·한도·담보·환불요건 (2)PLUS/ULTRA/PRO월구독빌링추가계약/MID/수수료 (3)지급대행의충전금정산자금연계·KYC·요금/VAT·최소비용·지급보류/회수조건 (4)13,250원플랜필수/대체담보/면제가능여부를서면으로안내해주세요. 사용자간양도·현금인출가능여부/유효기간/최대제공기간은사업정책확정값으로추가고지필요.

- 246 완료 검증: 725d7ac3f2bc46daa1b81c231ba7f77faf72d67d / dep-dbdmvl8u01pc73cu3sh0 LIVE 2026-10-23 23:32:39 KST. 관련 격리·모의 검사 17/17 PASS. 오래된 NEON 검사 요청에 누락된 JSON Content-Type만 수정했고 실제 API 검증은 유지. 배포 후 운영 commerce/status realBilling=false, subscriptionBilling=false, checkouts=[] 및 개발자노트 최신 항목 반영 확인. 보존 지문675개 변경0. 추가 비용·유료 신청·키 등록·실제 금융 호출0. 증빙: novanoxx-stage10-evidence-20261017/246-neon-policy-live.png.

### 247 플랜 빌링 추가 신청 시작·신청인 인증 대기 — 2026-10-23
- 사용자 요청: 플랜 정기결제를 위한 빌링 추가 신청 진행, 직접 수행할 단계와 추가 비용 사전 안내. NEON 충전/판매자 정산은 담당자 문의 내용 정리만(발송 권한 없음).
- 기존 merchant1849825의 서비스 추가 신청 → 빌링(정기결제) → 직접 구축 선택. 공개 사업자번호644-31-01860 및 https://novanoxx.com 입력. 신청인 이메일 인증 단계까지 도달. 현재 URL https://onboarding.tosspayments.com/registration/inbound-new/applicant . 화면 순서: 신청인 확인 → 수수료 확인 → 계좌·상품 정보 → 사업자 정보 → 서류제출.
- 신청 접수/승인 완료 아님. 신청인 이메일·이름·휴대폰은 소유자 직접 입력/인증 요청. 약관/계약 동의, 최종 신청, 라이브 키 등록, 실제 카드등록/청구, 유료 결제는 실행하지 않음. 이메일 인증 후 수수료 화면 확인부터 재개. 기존 일반 PG/퀵오픈과 별도 빌링 MID/계약인지 확인할 것. 중복 상점 생성이나 추가 비용을 임의 승인하지 말 것.
- 비용: 일반 공개요금 가입22만원/연관리11만원 및 카드일반3.4%+VAT는 빌링 추가 계약의 확정 견적이 아님. 기존상점 추가계약 면제/별도수수료/보증료/13,250원플랜 조건을 실제 견적으로 확인. 지급대행 월30만원/1000건/초과100원 공개 참고가격은 별도이며 이번 신청 대상 아님. 추가 과금0.
- 검수 설명 준비: NovaNoxX 크리에이터 월 구독 PLUS 3,000원·ULTRA 6,900원·PRO 9,900원. 에셋 등록 플랜 서비스에 대한 정기청구. NEON 충전/작품 단건 카드구매/판매자 송금과 분리. 가격·한도·해지/환불 정책의 실제 표시 및 빌링 심사 요구를 대조한 뒤 제출.
- 담당자 문의문(정리만, 발송 안 함):
안녕하세요. NovaNoxX(노바녹스, 사업자번호 644-31-01860, https://novanoxx.com)입니다.
크리에이터 플랜 월 구독의 자동결제(빌링)를 우선 신청 중입니다. 기존 일반 PG 상점 novano8ls7 및 퀵오픈 상점과 별도로 필요한 빌링 MID, 심사자료, 적용 수수료·가입비·연관리비·담보 비용과 면제 여부를 안내 부탁드립니다. 월 요금은 PLUS3,000원/ULTRA6,900원/PRO9,900원입니다.
추가로 아래 사업모델의 승인 가능 여부와 필요한 계약·개발 요건을 서면으로 확인 부탁드립니다.
1. 이용자가 카드 등으로 NEON(1NEON=100원)을 유상 충전하고, 디지털 에셋 구매에 사용합니다. 작품을 카드로 직접 구매하는 방식은 제공하지 않습니다. 포인트 충전 업종 및 마켓플레이스 구조로 가능한 일반 PG 계약/MID, 인증·충전/보유한도·담보·카드사 심사·환불/취소 요건은 무엇인가요? 관련 등록·별도 요건이 있다면 알려주세요. 양도·현금인출·유효기간 등은 승인에 필요한 정책 항목을 안내받아 확정하려 합니다.
2. 구매에 사용된 금액에서 플랫폼 수수료를 반영한 판매자 대금을 원화로 정산하려 합니다. NEON 충전 매출을 실제 사용 내역과 연결해 지급대행 자금으로 사용할 수 있나요? 필요한 지급그룹·계약·자금예치/정산주기·셀러 KYC/계좌 확인·최소 지급액을 안내해주세요.
3. 충전 취소, 일부 사용 후 환불, 판매자 지급 전후의 환불·차지백에 대한 책임·회수/상계·보류·충당금 요건과 지원 API를 안내해주세요.
4. 지급대행 공개 안내의 월30만원/1000건 포함/초과건당100원이 현재도 적용되는지, VAT·가입비·최소약정·할인 및 적은 초기 거래량에 맞는 대안이 있는지 견적 부탁드립니다.
5. 안심정산플랜13,250원은 해당 계약에서 필수인지, 기존 담보/면제와의 관계 및 미가입 시 한도를 알려주세요.
- 근거: https://docs.tosspayments.com/guides/v2/billing/integration ; https://www.tosspayments.com/about/fee ; https://www.tosspayments.com/blog/articles/30355 .
- 증빙: novanoxx-stage10-evidence-20261017/247-billing-applicant-handoff.png. 기존 작품/가격/NEON/파일/거래/운영 설정 변경0. 라이브 결제는 비활성 유지.

### 248 작품 상세 구매 진입 및 모바일 마켓 메뉴 수정 — 2026-10-26
- 원인: renderEnginePurchaseOptions의 productionSite 분기가 테스트 구매 버튼을 숨김. 실제 NEON 구매 미활성임에도 버튼 없는 화면만 보여 혼란. 운영 NEON 구매(준비 중) 비활성 버튼/비차감 설명/지갑 링크 제공. 초기 버튼도 상태 조회 전 비활성화하여 TEST 구매 문구 깜빡임/클릭 방지. TEST 환경은 명시 테스트 라벨·기존 경로 유지. 운영 실구매·원장·카드직접결제 활성화 아님.
- 모바일 market-nav 클릭 capture가 기본 메인 이동을 막고 카테고리만 열던 문제. 이름은 기존 #/marketplace 메인 라우팅, 별도44px 화살표는 펼침/접힘. PC hover/ArrowDown/Escape/바깥닫기/하위분류/터치스크롤 유지. 메인에는 큐레이션/어워드, category쿼리에는 라이브러리 구분 유지.
- 6개 언어 신규 문구 추가, 번역등록1889키·누락0. 메뉴/구매진입 회귀4검사PASS. 실제 과금/주문생성/잔액차감0. 신규 유료자원0. 상품·파일·가격·거래·기존 TEST 보존. 모바일 실기기 검증과 터치 로직 격리 검사를 구분.
- 247 빌링 이메일 인증 대기 상태 유지, 신청/계약/청구 재개 안함. 배포 및 화면 대조는 후속 기록.

- 248 배포 완료: 830071f908d306dd6aed899b18a3c884a991e315 / dep-dbfbaqeq1p3s73f23t5g LIVE 2026-10-26 11:06:27 KST. 운영 쇼핑쇼츠 상세에서 NEON으로 구매(준비 중) disabled·비차감 안내·지갑 링크 확인. 마켓플레이스 이름 클릭으로 #/marketplace 메인/추천/어워드 확인, 전용 화살표 펼침·닫힘과 URL 유지 확인. 터치 로직 격리 검사와 PC 운영 확인이며 휴대폰 실기기 확인은 별도. 증빙248-neon-purchase-live.png / 248-market-category-live.png / 248-market-main-live.png. 보존675개 변경0, 실제 금융/추가비용0.

### 249 모바일 화면 검증·마켓 메뉴 클릭 영역 겹침 보완 — 2026-10-26
- Chrome viewport 기능으로 실제 운영 사이트320/360/390/430×844 검증(세로스크롤바 포함 실제client폭305/345/375/415). 실기기 연결/Android/iOS 터치 에뮬레이션은 아님. 별도 터치 로직 격리 검사2개 및 구매 비활성 검사2개PASS.
- 운영 상세1004에서 구매46px/지갑44px/찜46px 및 상태 안내가 가로경계 내에 있고 문서가로넘침0, 요소간세로겹침0 확인. 헤더 이름/화살표의 음수margin으로8px 클릭영역겹침 발견, margin-left0 및 모바일market-nav min-height44px로 수정.
- 마켓 이름클릭 메인추천/어워드 존재와 별도화살표 펼침을 확인. 로컬읽기전용 합성iframe도 잠깐 확인했으나 최종 검증은 운영 모바일viewport에서 수행. 로컬프로세스 종료, 실주문/과금/파일변경/가격변경0. 새유료자원0. 기존675개지문변경0. 배포 후 재측정 기록 예정.
