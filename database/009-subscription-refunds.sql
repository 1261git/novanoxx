-- Explicit additive migration after preserving the operating database/files.
BEGIN;
CREATE TABLE nnx_operating_v1.billing_payment_sync(
 payment_key text PRIMARY KEY REFERENCES nnx_operating_v1.subscription_cycles(provider_payment_key),
 subscription_id text NOT NULL REFERENCES nnx_operating_v1.subscriptions(id),period_start timestamptz NOT NULL,
 provider_order_id text UNIQUE,provider_status text NOT NULL,remaining_krw bigint NOT NULL CHECK(remaining_krw>=0),
 refunded_krw bigint NOT NULL CHECK(refunded_krw>=0),checked_at bigint NOT NULL DEFAULT 0,next_check bigint NOT NULL DEFAULT 0,
 error_code text,review_required boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,webhook_queued_at bigint NOT NULL DEFAULT 0);
CREATE TABLE nnx_operating_v1.subscription_refunds(
 id text PRIMARY KEY,subscription_id text NOT NULL REFERENCES nnx_operating_v1.subscriptions(id),
 payment_key text NOT NULL REFERENCES nnx_operating_v1.subscription_cycles(provider_payment_key),user_id text NOT NULL REFERENCES public.users(id),
 source_period timestamptz NOT NULL,requested_amount_krw bigint NOT NULL CHECK(requested_amount_krw>0),
 amount_krw bigint NOT NULL CHECK(amount_krw>0),reason text NOT NULL,state text NOT NULL CHECK(state IN ('REQUESTED','APPROVED','REJECTED','PROCESSING','RECONCILE_REQUIRED','SUCCEEDED','FAILED')),
 rights_action text NOT NULL DEFAULT 'END_NOW' CHECK(rights_action IN ('END_NOW','KEEP_PERIOD')),
 version integer NOT NULL DEFAULT 1,request_id text NOT NULL,request_digest text NOT NULL,
 reviewed_by text REFERENCES public.users(id),review_reason text,provider_reason text NOT NULL,idempotency_key text NOT NULL UNIQUE,
 requested_refunded_krw bigint NOT NULL,before_balance_krw bigint,before_transactions jsonb,provider_transaction_key text,
 created bigint NOT NULL,updated bigint NOT NULL,UNIQUE(user_id,request_id));
CREATE UNIQUE INDEX subscription_refund_single_open ON nnx_operating_v1.subscription_refunds(payment_key)
 WHERE state IN ('REQUESTED','APPROVED','PROCESSING','RECONCILE_REQUIRED','FAILED');
CREATE TABLE nnx_operating_v1.subscription_refund_events(
 id text PRIMARY KEY,subscription_id text NOT NULL REFERENCES nnx_operating_v1.subscriptions(id),
 refund_id text REFERENCES nnx_operating_v1.subscription_refunds(id),actor_id text REFERENCES public.users(id),
 kind text NOT NULL,detail jsonb NOT NULL,created bigint NOT NULL);
INSERT INTO nnx_operating_v1.schema_version(version) VALUES('SUBSCRIPTION_REFUNDS_V1');
COMMIT;
