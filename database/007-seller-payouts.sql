-- Explicit additive release after a preservation snapshot; no existing rows move.
BEGIN;
CREATE TABLE nnx_operating_v1.seller_accounts(
 user_id text PRIMARY KEY REFERENCES public.users(id),ref_seller_id text UNIQUE NOT NULL,
 business_type text NOT NULL,version integer NOT NULL,state text NOT NULL,
 provider_id text UNIQUE,payload_ciphertext bytea NOT NULL,encryption_key_id text NOT NULL,
 bank_code text NOT NULL,account_last4 text NOT NULL,holder_mask text NOT NULL,
 checked_at bigint, next_check bigint NOT NULL,created bigint NOT NULL,updated bigint NOT NULL);
CREATE TABLE nnx_operating_v1.seller_requests(
 id text PRIMARY KEY,user_id text NOT NULL REFERENCES public.users(id),request_id text NOT NULL,
 request_digest text NOT NULL,version integer NOT NULL,kind text NOT NULL CHECK(kind IN ('REGISTER','UPDATE')),
 state text NOT NULL CHECK(state IN ('PROCESSING','VERIFIED','FAILED','UNKNOWN')),created bigint NOT NULL,updated bigint NOT NULL,
 UNIQUE(user_id,request_id));
CREATE TABLE nnx_operating_v1.payouts(
 id text PRIMARY KEY,order_id text NOT NULL REFERENCES nnx_operating_v1.orders(id),seller_id text NOT NULL REFERENCES public.users(id),
 account_version integer NOT NULL,destination text NOT NULL,amount_krw bigint NOT NULL CHECK(amount_krw>0 AND amount_krw<1000000000),
 ref_payout_id text NOT NULL UNIQUE,provider_id text UNIQUE,idempotency_key text NOT NULL UNIQUE,
 state text NOT NULL CHECK(state IN ('APPROVED','PROCESSING','REQUESTED','IN_PROGRESS','COMPLETED','FAILED','CANCELED','RECONCILE_REQUIRED')),
 provider_status text,approved_by text NOT NULL REFERENCES public.users(id),reason text NOT NULL,
 request_id text UNIQUE NOT NULL,request_digest text NOT NULL,version integer NOT NULL DEFAULT 1,
 checked_at bigint,next_check bigint NOT NULL,created bigint NOT NULL,updated bigint NOT NULL);
CREATE UNIQUE INDEX operating_payout_order_reserved ON nnx_operating_v1.payouts(order_id)
 WHERE state NOT IN ('FAILED','CANCELED');
CREATE TABLE nnx_operating_v1.payout_events(
 id text PRIMARY KEY,payout_id text REFERENCES nnx_operating_v1.payouts(id),actor_id text REFERENCES public.users(id),
 kind text NOT NULL,detail jsonb NOT NULL,created bigint NOT NULL);
CREATE TABLE nnx_operating_v1.payout_inbox(
 event_id text PRIMARY KEY,kind text NOT NULL,resource_id text NOT NULL,payload_digest text NOT NULL,created bigint NOT NULL);
INSERT INTO nnx_operating_v1.schema_version(version) VALUES('OPERATING_PAYOUTS_V1');
COMMIT;
