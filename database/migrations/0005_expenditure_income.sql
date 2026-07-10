-- ============================================================================
-- Migration 0005 — Expenditure (project + institutional) and Income modules,
-- plus an expenditure-type master.
-- ============================================================================

CREATE TABLE IF NOT EXISTS expenditure_types (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id  INT UNSIGNED NOT NULL,
    name       VARCHAR(80) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_exptype_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    UNIQUE KEY uq_exptype_name (tenant_id, name),
    INDEX idx_exptype_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS expenditures (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id           INT UNSIGNED NOT NULL,
    scope               ENUM('project','institutional') NOT NULL DEFAULT 'project',
    project_id          BIGINT UNSIGNED NULL,
    expenditure_type_id BIGINT UNSIGNED NULL,
    party_type          ENUM('supplier','subcontractor','none') NOT NULL DEFAULT 'none',
    party_id            BIGINT UNSIGNED NULL,     -- polymorphic (supplier/subcontractor); no FK
    task_id             BIGINT UNSIGNED NULL,
    amount              DECIMAL(15,2) NOT NULL DEFAULT 0,
    mode                ENUM('cash','fund_transfer','cheque','dd') NOT NULL DEFAULT 'cash',
    reference           VARCHAR(120) NULL,
    expense_date        DATE NOT NULL,
    notes               VARCHAR(255) NULL,
    created_by          BIGINT UNSIGNED NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_exp_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_exp_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    CONSTRAINT fk_exp_type FOREIGN KEY (expenditure_type_id) REFERENCES expenditure_types(id) ON DELETE SET NULL,
    CONSTRAINT fk_exp_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    CONSTRAINT fk_exp_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_exp_tenant (tenant_id),
    INDEX idx_exp_scope (tenant_id, scope),
    INDEX idx_exp_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS incomes (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id    INT UNSIGNED NOT NULL,
    project_id   BIGINT UNSIGNED NOT NULL,
    client_id    BIGINT UNSIGNED NULL,
    receipt_no   VARCHAR(60) NOT NULL,
    amount       DECIMAL(15,2) NOT NULL DEFAULT 0,   -- taxable / base amount
    gst_percent  DECIMAL(6,3) NOT NULL DEFAULT 0,
    gst_amount   DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,   -- amount + gst_amount
    mode         ENUM('cash','fund_transfer','cheque','dd') NOT NULL DEFAULT 'fund_transfer',
    reference    VARCHAR(120) NULL,
    income_date  DATE NOT NULL,
    notes        VARCHAR(255) NULL,
    created_by   BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_income_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_income_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_income_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    CONSTRAINT fk_income_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_inc_tenant (tenant_id),
    INDEX idx_inc_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
