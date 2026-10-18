-- Additive event delivery only; no historical messages or TEST rights are promoted.
BEGIN;
CREATE TABLE nnx_operating_v1.notification_outbox(
 id text PRIMARY KEY,source_key text UNIQUE NOT NULL,recipient_id text NOT NULL REFERENCES public.users(id),
 kind text NOT NULL CHECK(kind IN ('ORDER','DELIVERY','REFUND','ORDER_UPDATE','PAYOUT','SUBSCRIPTION')),
 reference_id text NOT NULL,state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','QUEUED','SKIPPED')),
 created bigint NOT NULL,processed bigint);
CREATE INDEX operating_notification_pending ON nnx_operating_v1.notification_outbox(state,created,id);
INSERT INTO nnx_operating_v1.schema_version(version) VALUES('OPERATING_NOTIFICATIONS_V1');
COMMIT;
