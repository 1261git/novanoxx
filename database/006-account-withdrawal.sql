-- Explicit additive migration. No existing account is withdrawn by this migration.
BEGIN;
CREATE TABLE nnx_operating_v1.account_withdrawals(
 user_id text PRIMARY KEY REFERENCES public.users(id),request_id text UNIQUE NOT NULL,withdrawn_at bigint NOT NULL,policy_version text NOT NULL);
CREATE SCHEMA nnx_retention_v1;
REVOKE ALL ON SCHEMA nnx_retention_v1 FROM PUBLIC;
CREATE TABLE nnx_retention_v1.withdrawn_identity(
 user_id text PRIMARY KEY REFERENCES public.users(id),name text NOT NULL,email text NOT NULL,
 purpose text NOT NULL CHECK(purpose='COMPLETED_TRANSACTION'),expires_at bigint NOT NULL);
REVOKE ALL ON nnx_retention_v1.withdrawn_identity FROM PUBLIC;
INSERT INTO nnx_operating_v1.schema_version(version) VALUES('OPERATING_WITHDRAWAL_V1');
COMMIT;
