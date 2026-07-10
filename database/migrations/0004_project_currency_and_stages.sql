-- ============================================================================
-- Migration 0004 — per-project currency + construction stages.
-- ============================================================================

-- ---- Per-project currency (chosen from the company's currencies) ----------
ALTER TABLE projects
    ADD COLUMN currency_code   VARCHAR(8) NULL AFTER contract_value,
    ADD COLUMN currency_symbol VARCHAR(8) NULL AFTER currency_code;

-- ---- Construction stages (phased plan vs contract value) -------------------
CREATE TABLE IF NOT EXISTS construction_stages (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id   INT UNSIGNED NOT NULL,
    project_id  BIGINT UNSIGNED NOT NULL,
    phase_no    INT NOT NULL DEFAULT 1,
    details     VARCHAR(255) NULL,
    percentage  DECIMAL(6,3) NOT NULL DEFAULT 0,
    amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
    sort_order  INT UNSIGNED NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_stage_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_stage_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_stage_project (project_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
