-- ============================================================================
-- Migration 0008 — GST on expenditures (base amount + GST% + GST amount +
-- total), mirroring the income module. Existing rows keep amount as the base
-- with zero GST, so total = amount.
-- ============================================================================

ALTER TABLE expenditures
    ADD COLUMN gst_percent  DECIMAL(6,3)  NOT NULL DEFAULT 0 AFTER amount,
    ADD COLUMN gst_amount   DECIMAL(15,2) NOT NULL DEFAULT 0 AFTER gst_percent,
    ADD COLUMN total_amount DECIMAL(15,2) NOT NULL DEFAULT 0 AFTER gst_amount;

UPDATE expenditures SET total_amount = amount WHERE total_amount = 0;
