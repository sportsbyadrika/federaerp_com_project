-- ============================================================================
-- Migration 0009 — GST on the project contract value (base + GST% + GST amount
-- + total), mirroring income/expenditure. contract_value stays the base; total
-- backfills to the base for existing rows.
-- ============================================================================

ALTER TABLE projects
    ADD COLUMN contract_gst_percent DECIMAL(6,3)  NOT NULL DEFAULT 0 AFTER contract_value,
    ADD COLUMN contract_gst_amount  DECIMAL(15,2) NOT NULL DEFAULT 0 AFTER contract_gst_percent,
    ADD COLUMN contract_total       DECIMAL(15,2) NOT NULL DEFAULT 0 AFTER contract_gst_amount;

UPDATE projects SET contract_total = contract_value WHERE contract_total = 0;
