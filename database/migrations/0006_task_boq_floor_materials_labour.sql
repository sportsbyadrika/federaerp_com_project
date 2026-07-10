-- ============================================================================
-- Migration 0006 — richer tasks (direct or from-BOQ, per-floor, with a
-- percentage) plus per-task Material and Labour tracking used on the kanban.
-- ============================================================================

-- ---- Extend tasks: source, BOQ link, floor and BOQ-style attributes --------
ALTER TABLE tasks
    ADD COLUMN source           ENUM('direct','boq') NOT NULL DEFAULT 'direct' AFTER status_id,
    ADD COLUMN boq_entry_id     BIGINT UNSIGNED NULL AFTER source,
    ADD COLUMN project_floor_id BIGINT UNSIGNED NULL AFTER boq_entry_id,
    ADD COLUMN item_code        VARCHAR(60) NULL AFTER title,
    ADD COLUMN item_head        VARCHAR(200) NULL AFTER item_code,
    ADD COLUMN item_description TEXT NULL AFTER item_head,
    ADD COLUMN percentage       DECIMAL(6,3) NOT NULL DEFAULT 0 AFTER item_description,
    ADD CONSTRAINT fk_tasks_boqentry FOREIGN KEY (boq_entry_id) REFERENCES boq_entries(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_tasks_floor FOREIGN KEY (project_floor_id) REFERENCES project_floors(id) ON DELETE SET NULL,
    ADD INDEX idx_tasks_floor (project_id, project_floor_id);

-- ---- Materials consumed on a task ------------------------------------------
CREATE TABLE IF NOT EXISTS task_materials (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id   INT UNSIGNED NOT NULL,
    task_id     BIGINT UNSIGNED NOT NULL,
    material_id BIGINT UNSIGNED NULL,          -- optional link to material_catalog
    item_name   VARCHAR(160) NOT NULL,         -- snapshot / manual name
    unit        VARCHAR(40) NULL,
    quantity    DECIMAL(15,3) NOT NULL DEFAULT 0,
    used_date   DATE NULL,
    notes       VARCHAR(255) NULL,
    created_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_tmat_tenant   FOREIGN KEY (tenant_id)   REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_tmat_task     FOREIGN KEY (task_id)     REFERENCES tasks(id) ON DELETE CASCADE,
    CONSTRAINT fk_tmat_material FOREIGN KEY (material_id) REFERENCES material_catalog(id) ON DELETE SET NULL,
    CONSTRAINT fk_tmat_user     FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_tmat_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---- Labour deployed on a task ---------------------------------------------
CREATE TABLE IF NOT EXISTS task_labour (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id   INT UNSIGNED NOT NULL,
    task_id     BIGINT UNSIGNED NOT NULL,
    employee_id BIGINT UNSIGNED NULL,          -- optional link to employees
    worker_name VARCHAR(160) NOT NULL,         -- snapshot / manual name
    trade       VARCHAR(120) NULL,
    headcount   INT NOT NULL DEFAULT 1,
    hours       DECIMAL(6,2) NOT NULL DEFAULT 0,
    work_date   DATE NULL,
    notes       VARCHAR(255) NULL,
    created_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_tlab_tenant   FOREIGN KEY (tenant_id)   REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_tlab_task     FOREIGN KEY (task_id)     REFERENCES tasks(id) ON DELETE CASCADE,
    CONSTRAINT fk_tlab_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
    CONSTRAINT fk_tlab_user     FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_tlab_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
