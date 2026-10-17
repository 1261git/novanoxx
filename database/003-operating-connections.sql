-- Additive connection metadata. Apply explicitly after an operating preservation snapshot.
BEGIN;
CREATE TABLE IF NOT EXISTS nnx_operating_v1.checkouts(
 order_id text PRIMARY KEY REFERENCES nnx_operating_v1.orders(id),actor_id text NOT NULL REFERENCES public.users(id),
 input jsonb NOT NULL,payload_digest text NOT NULL,return_hash text,expires_at bigint NOT NULL,reserved boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS nnx_operating_v1.subscription_requests(
 id text PRIMARY KEY,user_id text NOT NULL REFERENCES public.users(id),plan text NOT NULL CHECK(plan IN ('PLUS','ULTRA','PRO')),
 customer_key text NOT NULL,terms jsonb NOT NULL,return_hash text,expires_at bigint NOT NULL,
 state text NOT NULL CHECK(state IN ('PREPARED','STARTED','PROCESSING','ACTIVE','RECONCILE_REQUIRED','CANCELED')),request_id text NOT NULL,
 UNIQUE(user_id,request_id));
CREATE TABLE IF NOT EXISTS nnx_operating_v1.renewal_attempts(
 subscription_id text NOT NULL REFERENCES nnx_operating_v1.subscriptions(id),period_start timestamptz NOT NULL,
 started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,error_code text,PRIMARY KEY(subscription_id,period_start));
CREATE TABLE IF NOT EXISTS nnx_operating_v1.settlement_reviews(
 order_id text PRIMARY KEY REFERENCES nnx_operating_v1.orders(id),amount_krw bigint NOT NULL,fee_krw bigint NOT NULL,seller_net_krw bigint NOT NULL,
 state text NOT NULL CHECK(state IN ('HELD','REVIEW_REQUIRED','APPROVED_FOR_PROVIDER')),reviewed_by text REFERENCES public.users(id),reviewed_at timestamptz,
 CHECK(amount_krw=fee_krw+seller_net_krw));
CREATE UNIQUE INDEX IF NOT EXISTS operating_brief_checkout ON nnx_operating_v1.orders ((terms_snapshot->>'briefId')) WHERE source_kind='BRIEF' AND state<>'CANCELED';
INSERT INTO nnx_operating_v1.schema_version(version) VALUES('OPERATING_CONNECTIONS_V1') ON CONFLICT DO NOTHING;
COMMIT;
