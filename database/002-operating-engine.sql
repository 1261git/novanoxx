-- Prepared operating target. EXPLICIT application only after backup/quiesce approval.
-- Never imported by server.cjs. Refuses an existing schema; no source rows are moved.
BEGIN;
CREATE SCHEMA nnx_operating_v1;
CREATE TABLE nnx_operating_v1.schema_version(version text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO nnx_operating_v1.schema_version(version) VALUES('OPERATING_ENGINE_PREPARED_V1');
CREATE TABLE nnx_operating_v1.orders(
 id text PRIMARY KEY,buyer_id text NOT NULL REFERENCES public.users(id),seller_id text NOT NULL REFERENCES public.users(id),
 asset_id text REFERENCES public.creator_assets(id),source_kind text NOT NULL CHECK(source_kind IN ('MARKETPLACE','BRIEF')),
 amount_krw bigint NOT NULL CHECK(amount_krw>=100 AND amount_krw<=9007199254740991),currency text NOT NULL DEFAULT 'KRW' CHECK(currency='KRW'),
 fee_krw bigint NOT NULL CHECK(fee_krw>=0 AND fee_krw<=amount_krw),terms_snapshot jsonb NOT NULL,
 state text NOT NULL CHECK(state IN ('PENDING','PAID','IN_PROGRESS','PREVIEW_READY','REVIEW_PAUSED','COMPLETED','CANCELED','REFUND_PENDING','REFUNDED')),
 request_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(buyer_id,request_id),UNIQUE(id,amount_krw),CHECK(buyer_id<>seller_id),
 CHECK(fee_krw=floor(amount_krw::numeric*15/100)));
CREATE TABLE nnx_operating_v1.payments(
 id text PRIMARY KEY,order_id text NOT NULL UNIQUE REFERENCES nnx_operating_v1.orders(id),
 provider text NOT NULL CHECK(provider='TOSS'),environment text NOT NULL CHECK(environment='LIVE'),
 provider_payment_key text UNIQUE,amount_krw bigint NOT NULL CHECK(amount_krw>=100 AND amount_krw<=9007199254740991),
 state text NOT NULL CHECK(state IN ('REQUESTED','AUTHENTICATED','APPROVAL_PENDING','APPROVED','RECONCILE_REQUIRED','CANCELED','REFUNDED')),
 idempotency_key text NOT NULL UNIQUE,approved_at timestamptz,FOREIGN KEY(order_id,amount_krw) REFERENCES nnx_operating_v1.orders(id,amount_krw));
CREATE TABLE nnx_operating_v1.provider_events(
 event_id text PRIMARY KEY,payment_id text REFERENCES nnx_operating_v1.payments(id),
 payload_digest text NOT NULL CHECK(payload_digest~'^[0-9a-f]{64}$'),received_at timestamptz NOT NULL DEFAULT now(),
 verified_at timestamptz,processed_at timestamptz,CHECK(processed_at IS NULL OR verified_at IS NOT NULL));
CREATE TABLE nnx_operating_v1.order_events(
 id text PRIMARY KEY,order_id text NOT NULL REFERENCES nnx_operating_v1.orders(id),actor_id text REFERENCES public.users(id),
 kind text NOT NULL,detail jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE nnx_operating_v1.files(
 id text PRIMARY KEY,order_id text NOT NULL REFERENCES nnx_operating_v1.orders(id),owner_id text NOT NULL REFERENCES public.users(id),
 source_file_id text REFERENCES public.creator_files(id),kind text NOT NULL CHECK(kind IN ('MATERIALS','MESSAGE','STAGED','FINAL','REVIEW_SOURCE','REVIEW')),
 storage_key text NOT NULL UNIQUE,sha256 text NOT NULL CHECK(sha256~'^[0-9a-f]{64}$'),size_bytes bigint NOT NULL CHECK(size_bytes>0 AND size_bytes<=314572800),
 delivery_version integer NOT NULL DEFAULT 0 CHECK(delivery_version>=0),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE nnx_operating_v1.entitlements(
 order_id text NOT NULL REFERENCES nnx_operating_v1.orders(id),user_id text NOT NULL REFERENCES public.users(id),
 file_id text NOT NULL REFERENCES nnx_operating_v1.files(id),state text NOT NULL CHECK(state IN ('GRANTED','REVOKED')),
 granted_at timestamptz NOT NULL,revoked_at timestamptz,PRIMARY KEY(order_id,user_id,file_id),CHECK(state<>'REVOKED' OR revoked_at IS NOT NULL));
CREATE TABLE nnx_operating_v1.subscriptions(
 id text PRIMARY KEY,user_id text NOT NULL UNIQUE REFERENCES public.users(id),plan text NOT NULL CHECK(plan IN ('FREE','PLUS','ULTRA','PRO')),
 state text NOT NULL CHECK(state IN ('PENDING','TRIAL','ACTIVE','PAST_DUE','CANCELED','ENDED')),
 period_start timestamptz,period_end timestamptz,cancel_at_end boolean NOT NULL DEFAULT false,terms_snapshot jsonb NOT NULL,
 CHECK(period_end IS NULL OR period_start IS NOT NULL AND period_end>period_start));
CREATE TABLE nnx_operating_v1.billing_credentials(
 subscription_id text PRIMARY KEY REFERENCES nnx_operating_v1.subscriptions(id),environment text NOT NULL CHECK(environment='LIVE'),
 customer_key text NOT NULL UNIQUE,billing_key_ciphertext bytea NOT NULL CHECK(octet_length(billing_key_ciphertext)>28),
 encryption_key_id text NOT NULL,revoked_at timestamptz);
CREATE TABLE nnx_operating_v1.subscription_cycles(
 subscription_id text NOT NULL REFERENCES nnx_operating_v1.subscriptions(id),period_start timestamptz NOT NULL,
 amount_krw bigint NOT NULL CHECK(amount_krw>0 AND amount_krw<=9007199254740991),state text NOT NULL CHECK(state IN ('PENDING','APPROVED','FAILED','RECONCILE_REQUIRED','CANCELED')),
 idempotency_key text NOT NULL UNIQUE,provider_payment_key text UNIQUE,PRIMARY KEY(subscription_id,period_start));
CREATE TABLE nnx_operating_v1.settlement_holds(
 order_id text PRIMARY KEY REFERENCES nnx_operating_v1.orders(id),reason text NOT NULL,
 state text NOT NULL CHECK(state IN ('CONTRACT_PENDING','DISPUTED','REFUND_PENDING','RELEASE_REVIEW_REQUIRED')),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE nnx_operating_v1.outbox(
 id text PRIMARY KEY,event_key text NOT NULL UNIQUE,kind text NOT NULL,payload jsonb NOT NULL,
 state text NOT NULL DEFAULT 'HELD' CHECK(state IN ('HELD','READY','PROCESSING','DONE','FAILED')),attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 created_at timestamptz NOT NULL DEFAULT now(),available_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX operating_orders_participants ON nnx_operating_v1.orders(buyer_id,seller_id,created_at);
CREATE INDEX operating_outbox_pending ON nnx_operating_v1.outbox(state,available_at);
COMMIT;
