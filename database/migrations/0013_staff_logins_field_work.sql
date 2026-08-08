-- ============================================================================
-- Migration 0013 — staff logins (office / field staff), field-staff project
-- assignments, and field daily logs (task + labour) reviewed by the admin.
-- ============================================================================

-- New login roles for staff members given an account.
ALTER TABLE users
    MODIFY COLUMN role ENUM('super_admin','org_admin','staff','office_staff','field_staff') NOT NULL DEFAULT 'staff';

-- Link a staff member to a login + record which kind of login it is.
ALTER TABLE staff_members
    ADD COLUMN user_id    BIGINT UNSIGNED NULL AFTER tenant_id,
    ADD COLUMN login_role ENUM('office','field') NULL AFTER user_id,
    ADD CONSTRAINT fk_staff_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Projects a field-staff member is assigned to (many-to-many).
CREATE TABLE IF NOT EXISTS staff_projects (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id       INT UNSIGNED NOT NULL,
    staff_member_id BIGINT UNSIGNED NOT NULL,
    project_id      BIGINT UNSIGNED NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_sproj_tenant  FOREIGN KEY (tenant_id)       REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_sproj_staff   FOREIGN KEY (staff_member_id) REFERENCES staff_members(id) ON DELETE CASCADE,
    CONSTRAINT fk_sproj_project FOREIGN KEY (project_id)      REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE KEY uq_staff_project (staff_member_id, project_id),
    INDEX idx_sproj_staff (staff_member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Field-staff daily log: a task on a project + the labour (skilled/unskilled)
-- needed, submitted for admin review.
CREATE TABLE IF NOT EXISTS field_daily_logs (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id       INT UNSIGNED NOT NULL,
    staff_member_id BIGINT UNSIGNED NOT NULL,
    project_id      BIGINT UNSIGNED NOT NULL,
    task_name       VARCHAR(200) NOT NULL,
    skilled_count   INT NOT NULL DEFAULT 0,
    unskilled_count INT NOT NULL DEFAULT 0,
    log_date        DATE NOT NULL,
    notes           VARCHAR(255) NULL,
    review_status   ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    review_note     VARCHAR(255) NULL,
    reviewed_by     BIGINT UNSIGNED NULL,
    reviewed_at     TIMESTAMP NULL DEFAULT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_fdl_tenant   FOREIGN KEY (tenant_id)       REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_fdl_staff    FOREIGN KEY (staff_member_id) REFERENCES staff_members(id) ON DELETE CASCADE,
    CONSTRAINT fk_fdl_project  FOREIGN KEY (project_id)      REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_fdl_reviewer FOREIGN KEY (reviewed_by)     REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_fdl_tenant (tenant_id, review_status),
    INDEX idx_fdl_staff (staff_member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
