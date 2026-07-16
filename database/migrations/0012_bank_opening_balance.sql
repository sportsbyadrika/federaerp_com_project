-- ============================================================================
-- Migration 0012 — opening balance (and its as-on date) for bank accounts,
-- used as the starting point of the bank ledger.
-- ============================================================================

ALTER TABLE bank_accounts
    ADD COLUMN opening_balance      DECIMAL(15,2) NULL DEFAULT 0 AFTER branch_name,
    ADD COLUMN opening_balance_date DATE NULL AFTER opening_balance;
