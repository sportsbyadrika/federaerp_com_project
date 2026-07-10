-- ============================================================================
-- Migration 0001 — feature batch:
--   * email-only login (email globally unique; org id no longer needed to log in)
--   * project type (new/renovation) + per-project floors
--   * Bill of Quantities (BOQ) per project, optionally split by floor
--   * password reset tokens (forgot-password flow)
-- Applied automatically by database/migrate.php after the baseline schema.
-- ============================================================================

-- ---- Users: make email globally unique -------------------------------------
-- Deduplicate any repeated emails first (keeps the earliest id; renames later
-- duplicates so the unique index can be added without error).
UPDATE users u
JOIN (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY email ORDER BY id) AS rn
    FROM users
) d ON u.id = d.id
SET u.email = CONCAT(SUBSTRING_INDEX(u.email, '@', 1), '+dup', u.id, '@', SUBSTRING_INDEX(u.email, '@', -1))
WHERE d.rn > 1;

ALTER TABLE users DROP INDEX uq_user_org_email;
ALTER TABLE users ADD UNIQUE KEY uq_user_email (email);

-- ---- Projects: type of project ---------------------------------------------
ALTER TABLE projects
    ADD COLUMN project_type ENUM('new','renovation') NOT NULL DEFAULT 'new' AFTER name;

-- ---- Floors defined for a project ------------------------------------------
CREATE TABLE IF NOT EXISTS project_floors (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id     INT UNSIGNED NOT NULL,
    project_id    BIGINT UNSIGNED NOT NULL,
    code          VARCHAR(30) NOT NULL,        -- e.g. B2, B1, GF, F1 ... F10
    label         VARCHAR(60) NOT NULL,        -- e.g. "Basement 2", "Ground Floor"
    sort_order    INT NOT NULL DEFAULT 0,      -- signed: basements negative, GF 0, upper positive
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_pf_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_pf_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE KEY uq_pf_project_code (project_id, code),
    INDEX idx_pf_project (project_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- Bill of Quantities items (optionally per floor) -----------------------
CREATE TABLE IF NOT EXISTS boq_items (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id         INT UNSIGNED NOT NULL,
    project_id        BIGINT UNSIGNED NOT NULL,
    project_floor_id  BIGINT UNSIGNED NULL,    -- NULL = project-wide / not split by floor
    item_code         VARCHAR(60) NULL,
    description       VARCHAR(255) NOT NULL,
    unit              VARCHAR(30) NULL,
    quantity          DECIMAL(15,3) NOT NULL DEFAULT 0,
    rate              DECIMAL(15,4) NOT NULL DEFAULT 0,
    amount            DECIMAL(15,2) NOT NULL DEFAULT 0,
    sort_order        INT UNSIGNED NOT NULL DEFAULT 0,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_boq_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_boq_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_boq_floor FOREIGN KEY (project_floor_id) REFERENCES project_floors(id) ON DELETE SET NULL,
    INDEX idx_boq_project (project_id, sort_order),
    INDEX idx_boq_floor (project_floor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- Password reset tokens -------------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id     BIGINT UNSIGNED NOT NULL,
    email       VARCHAR(190) NOT NULL,
    token_hash  CHAR(64) NOT NULL,             -- sha256 of the emailed token
    expires_at  TIMESTAMP NOT NULL,
    used_at     TIMESTAMP NULL DEFAULT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_pwreset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_pwreset_token (token_hash),
    INDEX idx_pwreset_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
