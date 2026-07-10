-- ============================================================================
-- Migration 0007 — Staff master (workforce directory, distinct from login
-- users). Captures a staff id, contact details, a type and PAN.
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_members (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id  INT UNSIGNED NOT NULL,
    staff_code VARCHAR(40) NOT NULL,                              -- "Staff Id"
    name       VARCHAR(160) NOT NULL,
    phone      VARCHAR(40) NULL,
    email      VARCHAR(190) NULL,
    staff_type ENUM('office','skilled','unskilled') NOT NULL DEFAULT 'office',
    address    VARCHAR(255) NULL,
    pan        VARCHAR(40) NULL,
    status     ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_staff_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    UNIQUE KEY uq_staff_code (tenant_id, staff_code),
    INDEX idx_staff_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
