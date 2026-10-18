-- Explicit additive migration after a preservation snapshot. No historical rows are moved.
BEGIN;
CREATE TABLE nnx_operating_v1.refunds(
 id text PRIMARY KEY,order_id text NOT NULL REFERENCES nnx_operating_v1.orders(id),buyer_id text NOT NULL REFERENCES public.users(id),
 amount_krw bigint NOT NULL CHECK(amount_krw>0 AND amount_krw<=9007199254740991),reason text NOT NULL,
 state text NOT NULL CHECK(state IN ('REQUESTED','APPROVED','REJECTED','PROCESSING','RECONCILE_REQUIRED','SUCCEEDED','FAILED')),
 version integer NOT NULL DEFAULT 1,request_id text NOT NULL,request_digest text NOT NULL,
 reviewed_by text REFERENCES public.users(id),review_reason text,rights_action text NOT NULL DEFAULT 'REVOKE' CHECK(rights_action IN ('REVOKE','RETAIN')),
 provider_reason text NOT NULL UNIQUE,idempotency_key text NOT NULL UNIQUE,provider_transaction_key text UNIQUE,
 prior_order_state text NOT NULL,engine_prior_status text,review_remaining_ms bigint,
 requested_refunded_krw bigint NOT NULL DEFAULT 0,before_balance_krw bigint,before_transactions jsonb,
 created bigint NOT NULL,updated bigint NOT NULL,UNIQUE(buyer_id,request_id));
CREATE UNIQUE INDEX operating_one_open_refund ON nnx_operating_v1.refunds(order_id) WHERE state IN ('REQUESTED','APPROVED','PROCESSING','RECONCILE_REQUIRED');
CREATE TABLE nnx_operating_v1.finance_events(
 id text PRIMARY KEY,order_id text REFERENCES nnx_operating_v1.orders(id),refund_id text REFERENCES nnx_operating_v1.refunds(id),
 actor_id text REFERENCES public.users(id),kind text NOT NULL,detail jsonb NOT NULL,request_id text UNIQUE,request_digest text,created bigint NOT NULL);
CREATE TABLE nnx_operating_v1.payment_sync(
 order_id text PRIMARY KEY REFERENCES nnx_operating_v1.orders(id),provider_status text NOT NULL,
 remaining_krw bigint NOT NULL CHECK(remaining_krw>=0),refunded_krw bigint NOT NULL CHECK(refunded_krw>=0),
 checked_at bigint NOT NULL,next_check bigint NOT NULL,error_code text);
CREATE TABLE nnx_operating_v1.payment_inbox(
 event_id text PRIMARY KEY,payment_id text NOT NULL REFERENCES nnx_operating_v1.payments(id),order_id text NOT NULL REFERENCES nnx_operating_v1.orders(id),
 payload_digest text NOT NULL,state text NOT NULL CHECK(state IN ('QUEUED','VERIFIED','RETRY','FAILED')),
 attempts integer NOT NULL DEFAULT 0,next_attempt bigint NOT NULL,created bigint NOT NULL,processed bigint);
CREATE INDEX operating_payment_inbox_due ON nnx_operating_v1.payment_inbox(state,next_attempt);
CREATE INDEX operating_refund_created ON nnx_operating_v1.refunds(created,id);
INSERT INTO nnx_operating_v1.schema_version(version) VALUES('OPERATING_FINANCE_V1');
COMMIT;
