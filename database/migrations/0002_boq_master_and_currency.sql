-- ============================================================================
-- Migration 0002 — BOQ item master, unit types, currencies, and a restructured
-- BOQ model (an entry per item with per-floor lines).
-- ============================================================================

-- ---- Unit types (a Setting) ------------------------------------------------
CREATE TABLE IF NOT EXISTS unit_types (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id  INT UNSIGNED NOT NULL,
    name       VARCHAR(40) NOT NULL,        -- e.g. bag, cu.m, sq.m, nos, hour
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_unit_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    UNIQUE KEY uq_unit_name (tenant_id, name),
    INDEX idx_unit_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- Currencies (multiple per company, one default) ------------------------
CREATE TABLE IF NOT EXISTS currencies (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id  INT UNSIGNED NOT NULL,
    code       VARCHAR(8) NOT NULL,         -- e.g. INR, USD
    symbol     VARCHAR(8) NOT NULL,         -- e.g. ₹, $
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_cur_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    UNIQUE KEY uq_cur_code (tenant_id, code),
    INDEX idx_cur_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Store the default currency symbol on the organisation for quick display.
ALTER TABLE organisations ADD COLUMN currency_symbol VARCHAR(8) NOT NULL DEFAULT '$' AFTER currency;

-- ---- BOQ item master (reusable catalogue of BOQ line items) ----------------
CREATE TABLE IF NOT EXISTS boq_item_master (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id    INT UNSIGNED NOT NULL,
    project_type ENUM('new','renovation','any') NOT NULL DEFAULT 'any',
    item_code    VARCHAR(60) NOT NULL,
    item_head    VARCHAR(160) NOT NULL,       -- short name shown in the dropdown
    description  TEXT NULL,                    -- long description
    unit         VARCHAR(40) NULL,
    default_rate DECIMAL(15,4) NOT NULL DEFAULT 0,
    is_active    TINYINT(1) NOT NULL DEFAULT 1,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at   TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_bim_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    INDEX idx_bim_tenant (tenant_id),
    INDEX idx_bim_type (tenant_id, project_type),
    INDEX idx_bim_head (tenant_id, item_head)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- BOQ entries (one per item in a project) -------------------------------
CREATE TABLE IF NOT EXISTS boq_entries (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id          INT UNSIGNED NOT NULL,
    project_id         BIGINT UNSIGNED NOT NULL,
    boq_item_master_id BIGINT UNSIGNED NULL,
    item_code          VARCHAR(60) NULL,
    item_head          VARCHAR(160) NOT NULL,
    description        TEXT NULL,
    unit               VARCHAR(40) NULL,
    sort_order         INT UNSIGNED NOT NULL DEFAULT 0,
    created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_boqe_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_boqe_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_boqe_master FOREIGN KEY (boq_item_master_id) REFERENCES boq_item_master(id) ON DELETE SET NULL,
    INDEX idx_boqe_project (project_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- BOQ lines (per-floor quantities under an entry) -----------------------
CREATE TABLE IF NOT EXISTS boq_lines (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    boq_entry_id     BIGINT UNSIGNED NOT NULL,
    project_floor_id BIGINT UNSIGNED NULL,
    quantity         DECIMAL(15,3) NOT NULL DEFAULT 0,
    rate             DECIMAL(15,4) NOT NULL DEFAULT 0,
    amount           DECIMAL(15,2) NOT NULL DEFAULT 0,
    sort_order       INT UNSIGNED NOT NULL DEFAULT 0,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_boql_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_boql_entry FOREIGN KEY (boq_entry_id) REFERENCES boq_entries(id) ON DELETE CASCADE,
    CONSTRAINT fk_boql_floor FOREIGN KEY (project_floor_id) REFERENCES project_floors(id) ON DELETE SET NULL,
    INDEX idx_boql_entry (boq_entry_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- Migrate existing flat boq_items -> entries + lines, then drop it ------
INSERT INTO boq_entries (tenant_id, project_id, item_code, item_head, description, unit, sort_order)
SELECT tenant_id, project_id, item_code,
       COALESCE(NULLIF(item_code, ''), LEFT(description, 60)) AS item_head,
       description, unit, MIN(sort_order)
FROM boq_items
GROUP BY tenant_id, project_id, item_code, description, unit;

INSERT INTO boq_lines (tenant_id, boq_entry_id, project_floor_id, quantity, rate, amount, sort_order)
SELECT bi.tenant_id, be.id, bi.project_floor_id, bi.quantity, bi.rate, bi.amount, bi.sort_order
FROM boq_items bi
JOIN boq_entries be
  ON be.tenant_id = bi.tenant_id AND be.project_id = bi.project_id
 AND (be.item_code <=> bi.item_code) AND be.description <=> bi.description AND (be.unit <=> bi.unit);

DROP TABLE boq_items;
