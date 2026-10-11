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
