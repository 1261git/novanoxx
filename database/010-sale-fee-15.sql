-- Explicit application for the verified empty operating ledger, 2026-10-31.
-- No transaction rows or historical snapshots are changed. Refuse a non-empty ledger.
BEGIN;
LOCK TABLE nnx_operating_v1.orders IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE c record;
BEGIN
 IF EXISTS (SELECT 1 FROM nnx_operating_v1.orders) THEN
  RAISE EXCEPTION 'FEE_15_REQUIRES_EMPTY_OPERATING_LEDGER';
 END IF;
 FOR c IN SELECT conname FROM pg_constraint
  WHERE conrelid='nnx_operating_v1.orders'::regclass AND contype='c'
  AND pg_get_constraintdef(oid) LIKE '%floor%'
  AND pg_get_constraintdef(oid) LIKE '%fee_krw%'
 LOOP
  EXECUTE format('ALTER TABLE nnx_operating_v1.orders DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE nnx_operating_v1.orders ADD CONSTRAINT orders_fee_15_floor
 CHECK(fee_krw=floor(amount_krw::numeric*15/100));
INSERT INTO nnx_operating_v1.schema_version(version) VALUES('TOTAL_SALE_FEE_15_V2') ON CONFLICT DO NOTHING;
COMMIT;
