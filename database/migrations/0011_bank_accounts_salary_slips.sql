-- ============================================================================
-- Migration 0011 — Bank account master, bank links on income/expenditure,
-- a "staff" party type on expenditure, and monthly staff salary slips.
-- ============================================================================

CREATE TABLE IF NOT EXISTS bank_accounts (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id      INT UNSIGNED NOT NULL,
    account_label  VARCHAR(120) NOT NULL,      -- shown in dropdowns
    bank_name      VARCHAR(160) NOT NULL,
    account_number VARCHAR(60) NOT NULL,
    ifsc           VARCHAR(20) NULL,
    branch_name    VARCHAR(160) NULL,
    is_active      TINYINT(1) NOT NULL DEFAULT 1,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at     TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_bank_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    INDEX idx_bank_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Expenditure: add a "staff" party type + a linked bank account.
ALTER TABLE expenditures
    MODIFY COLUMN party_type ENUM('supplier','subcontractor','staff','none') NOT NULL DEFAULT 'none',
    ADD COLUMN bank_account_id BIGINT UNSIGNED NULL AFTER mode,
    ADD CONSTRAINT fk_exp_bank FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL;

-- Income: a linked bank account (for fund transfer / cheque / DD).
ALTER TABLE incomes
    ADD COLUMN bank_account_id BIGINT UNSIGNED NULL AFTER mode,
    ADD CONSTRAINT fk_income_bank FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL;

-- Monthly staff salary slips: earnings + deductions lines, gross + net.
CREATE TABLE IF NOT EXISTS salary_slips (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    staff_id         BIGINT UNSIGNED NOT NULL,
    period           VARCHAR(20) NOT NULL,          -- e.g. "2026-07"
    earnings_total   DECIMAL(15,2) NOT NULL DEFAULT 0,   -- gross salary
    deductions_total DECIMAL(15,2) NOT NULL DEFAULT 0,
    net_salary       DECIMAL(15,2) NOT NULL DEFAULT 0,
    notes            VARCHAR(255) NULL,
    created_by       BIGINT UNSIGNED NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_sslip_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_sslip_staff  FOREIGN KEY (staff_id)  REFERENCES staff_members(id) ON DELETE CASCADE,
    CONSTRAINT fk_sslip_user   FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_sslip_staff (tenant_id, staff_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS salary_slip_lines (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id  INT UNSIGNED NOT NULL,
    slip_id    BIGINT UNSIGNED NOT NULL,
    line_type  ENUM('earning','deduction') NOT NULL,
    label      VARCHAR(120) NOT NULL,
    amount     DECIMAL(15,2) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    CONSTRAINT fk_sline_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_sline_slip   FOREIGN KEY (slip_id)   REFERENCES salary_slips(id) ON DELETE CASCADE,
    INDEX idx_sline_slip (slip_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
