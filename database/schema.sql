-- ============================================================================
-- Construction Management SaaS — Full Relational Schema (Batch 2)
-- MySQL 5.7+/8.0 · InnoDB · utf8mb4
--
-- Tenancy model: organisations.id IS the 6-digit organisation_id (the tenant
-- key). Every business table carries tenant_id -> organisations(id). Org 111111
-- is the reserved Super Admin platform org. Run this file top-to-bottom on a
-- fresh database; tables are ordered so foreign keys always resolve.
--
-- Conventions: snake_case plural tables, created_at/updated_at on every table,
-- deleted_at (soft delete) where useful, explicit indexes on FKs + lookups.
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET time_zone = '+00:00';

-- ============================================================================
-- MODULE 1 — Accounts & Tenancy (foundation)
-- ============================================================================

-- Organisations are tenants. The PK is the 6-digit organisation_id itself.
CREATE TABLE IF NOT EXISTS organisations (
    id             INT UNSIGNED NOT NULL,                 -- 6-digit org id (100000-999999); 111111 = Super Admin
    name           VARCHAR(160) NOT NULL,
    legal_name     VARCHAR(200) NULL,
    email          VARCHAR(190) NULL,
    phone          VARCHAR(40)  NULL,
    address        VARCHAR(255) NULL,
    city           VARCHAR(100) NULL,
    country        VARCHAR(100) NULL,
    currency       CHAR(3)      NOT NULL DEFAULT 'USD',
    is_platform    TINYINT(1)   NOT NULL DEFAULT 0,        -- 1 only for org 111111
    status         ENUM('active','suspended') NOT NULL DEFAULT 'active',
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at     TIMESTAMP    NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT chk_org_id_range CHECK (id BETWEEN 100000 AND 999999),
    INDEX idx_org_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Platform + tenant users. Same email may exist under different orgs.
CREATE TABLE IF NOT EXISTS users (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organisation_id  INT UNSIGNED NOT NULL,
    name             VARCHAR(120) NOT NULL,
    email            VARCHAR(190) NOT NULL,
    password_hash    VARCHAR(255) NOT NULL,
    role             ENUM('super_admin','org_admin','staff') NOT NULL DEFAULT 'staff',
    job_role         ENUM('owner','admin','project_manager','accountant','site_supervisor','subcontractor') NULL,
    phone            VARCHAR(40)  NULL,
    status           ENUM('active','invited','disabled') NOT NULL DEFAULT 'active',
    last_login_at    TIMESTAMP    NULL DEFAULT NULL,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at       TIMESTAMP    NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_org_email (organisation_id, email),
    CONSTRAINT fk_users_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
    INDEX idx_users_org (organisation_id),
    INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- MODULE 2 — Client Management & Estimation
-- ============================================================================

CREATE TABLE IF NOT EXISTS clients (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    name             VARCHAR(160) NOT NULL,
    contact_person   VARCHAR(120) NULL,
    email            VARCHAR(190) NULL,
    phone            VARCHAR(40)  NULL,
    address          VARCHAR(255) NULL,
    notes            TEXT NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at       TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_clients_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    INDEX idx_clients_tenant (tenant_id),
    INDEX idx_clients_name (tenant_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_leads (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    client_id        BIGINT UNSIGNED NULL,
    title            VARCHAR(160) NOT NULL,
    source           VARCHAR(80)  NULL,
    estimated_value  DECIMAL(15,2) NULL,
    stage            ENUM('new','qualified','proposal','won','lost') NOT NULL DEFAULT 'new',
    assigned_to      BIGINT UNSIGNED NULL,
    notes            TEXT NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at       TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_leads_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_leads_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    CONSTRAINT fk_leads_user FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_leads_tenant (tenant_id),
    INDEX idx_leads_stage (tenant_id, stage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Construction model types (residential/commercial/...) drive estimation.
CREATE TABLE IF NOT EXISTS construction_models (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    name             VARCHAR(120) NOT NULL,
    category         ENUM('residential','commercial','industrial','infrastructure','other') NOT NULL DEFAULT 'residential',
    description      VARCHAR(255) NULL,
    is_active        TINYINT(1) NOT NULL DEFAULT 1,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at       TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_models_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    INDEX idx_models_tenant (tenant_id),
    INDEX idx_models_category (tenant_id, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Baseline prices for materials & labour used by the estimation engine.
CREATE TABLE IF NOT EXISTS base_rate_configs (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    model_id         BIGINT UNSIGNED NULL,               -- optional: rate specific to a model
    rate_type        ENUM('material','labour') NOT NULL,
    item_code        VARCHAR(60) NOT NULL,
    item_name        VARCHAR(160) NOT NULL,
    unit             VARCHAR(30) NOT NULL,               -- e.g. bag, cu.m, sq.ft, hour
    base_rate        DECIMAL(15,4) NOT NULL DEFAULT 0,   -- price per unit
    wastage_percent  DECIMAL(6,3) NOT NULL DEFAULT 0,
    is_active        TINYINT(1) NOT NULL DEFAULT 1,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at       TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_rates_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_rates_model FOREIGN KEY (model_id) REFERENCES construction_models(id) ON DELETE SET NULL,
    INDEX idx_rates_tenant (tenant_id),
    INDEX idx_rates_lookup (tenant_id, rate_type, item_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS estimates (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    client_id        BIGINT UNSIGNED NULL,
    lead_id          BIGINT UNSIGNED NULL,
    model_id         BIGINT UNSIGNED NULL,
    reference        VARCHAR(60) NOT NULL,               -- human ref e.g. EST-2026-0001
    title            VARCHAR(180) NOT NULL,
    version          INT UNSIGNED NOT NULL DEFAULT 1,
    parent_estimate_id BIGINT UNSIGNED NULL,             -- versioning chain
    square_footage   DECIMAL(12,2) NULL,
    labour_hours     DECIMAL(12,2) NULL,
    materials_total  DECIMAL(15,2) NOT NULL DEFAULT 0,
    labour_total     DECIMAL(15,2) NOT NULL DEFAULT 0,
    overhead_percent DECIMAL(6,3) NOT NULL DEFAULT 0,
    margin_percent   DECIMAL(6,3) NOT NULL DEFAULT 0,
    grand_total      DECIMAL(15,2) NOT NULL DEFAULT 0,
    status           ENUM('draft','sent','approved','rejected') NOT NULL DEFAULT 'draft',
    created_by       BIGINT UNSIGNED NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at       TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_est_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_est_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    CONSTRAINT fk_est_lead FOREIGN KEY (lead_id) REFERENCES project_leads(id) ON DELETE SET NULL,
    CONSTRAINT fk_est_model FOREIGN KEY (model_id) REFERENCES construction_models(id) ON DELETE SET NULL,
    CONSTRAINT fk_est_parent FOREIGN KEY (parent_estimate_id) REFERENCES estimates(id) ON DELETE SET NULL,
    CONSTRAINT fk_est_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_est_tenant (tenant_id),
    INDEX idx_est_status (tenant_id, status),
    INDEX idx_est_ref (tenant_id, reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS estimate_line_items (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    estimate_id      BIGINT UNSIGNED NOT NULL,
    line_type        ENUM('material','labour','other') NOT NULL DEFAULT 'material',
    item_code        VARCHAR(60) NULL,
    description      VARCHAR(200) NOT NULL,
    unit             VARCHAR(30) NULL,
    quantity         DECIMAL(15,4) NOT NULL DEFAULT 0,
    rate             DECIMAL(15,4) NOT NULL DEFAULT 0,
    amount           DECIMAL(15,2) NOT NULL DEFAULT 0,
    sort_order       INT UNSIGNED NOT NULL DEFAULT 0,     -- drag-and-drop reordering
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_eli_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_eli_estimate FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE,
    INDEX idx_eli_tenant (tenant_id),
    INDEX idx_eli_estimate (estimate_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- MODULE 3 — Project Management (Kanban-ready)
-- ============================================================================

CREATE TABLE IF NOT EXISTS projects (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    client_id        BIGINT UNSIGNED NULL,
    estimate_id      BIGINT UNSIGNED NULL,
    code             VARCHAR(60) NOT NULL,
    name             VARCHAR(180) NOT NULL,
    description      TEXT NULL,
    site_address     VARCHAR(255) NULL,
    contract_value   DECIMAL(15,2) NOT NULL DEFAULT 0,
    start_date       DATE NULL,
    end_date         DATE NULL,
    status           ENUM('planning','active','on_hold','completed','cancelled') NOT NULL DEFAULT 'planning',
    progress_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
    project_manager_id BIGINT UNSIGNED NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at       TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_projects_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_projects_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    CONSTRAINT fk_projects_est FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE SET NULL,
    CONSTRAINT fk_projects_pm FOREIGN KEY (project_manager_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_projects_tenant (tenant_id),
    INDEX idx_projects_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kanban columns. Scoped per tenant (optionally per project via project_id).
CREATE TABLE IF NOT EXISTS task_statuses (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    project_id       BIGINT UNSIGNED NULL,               -- NULL = tenant-wide default board
    name             VARCHAR(80) NOT NULL,
    color            VARCHAR(20) NULL,
    position         INT UNSIGNED NOT NULL DEFAULT 0,     -- column order left->right
    is_done          TINYINT(1) NOT NULL DEFAULT 0,       -- terminal column
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_status_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_status_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_status_tenant (tenant_id),
    INDEX idx_status_board (tenant_id, project_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS milestones (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    project_id       BIGINT UNSIGNED NOT NULL,
    name             VARCHAR(160) NOT NULL,
    description      VARCHAR(255) NULL,
    due_date         DATE NULL,
    percent_weight   DECIMAL(6,3) NOT NULL DEFAULT 0,     -- share of contract for RA billing
    certified_percent DECIMAL(6,3) NOT NULL DEFAULT 0,    -- certified completion % (drives RA bills)
    status           ENUM('pending','in_progress','completed','certified') NOT NULL DEFAULT 'pending',
    sort_order       INT UNSIGNED NOT NULL DEFAULT 0,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at       TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_ms_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_ms_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_ms_tenant (tenant_id),
    INDEX idx_ms_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    project_id       BIGINT UNSIGNED NOT NULL,
    status_id        BIGINT UNSIGNED NOT NULL,            -- kanban column
    milestone_id     BIGINT UNSIGNED NULL,
    title            VARCHAR(200) NOT NULL,
    description      TEXT NULL,
    assignee_id      BIGINT UNSIGNED NULL,
    priority         ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
    due_date         DATE NULL,
    sort_order       INT UNSIGNED NOT NULL DEFAULT 0,     -- position within its column (drag-and-drop)
    completed_at     TIMESTAMP NULL DEFAULT NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at       TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_tasks_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_tasks_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_tasks_status FOREIGN KEY (status_id) REFERENCES task_statuses(id),
    CONSTRAINT fk_tasks_ms FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE SET NULL,
    CONSTRAINT fk_tasks_assignee FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_tasks_tenant (tenant_id),
    INDEX idx_tasks_board (project_id, status_id, sort_order),
    INDEX idx_tasks_assignee (assignee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS work_progress_logs (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    project_id       BIGINT UNSIGNED NOT NULL,
    task_id          BIGINT UNSIGNED NULL,
    logged_by        BIGINT UNSIGNED NULL,
    log_date         DATE NOT NULL,
    progress_percent DECIMAL(5,2) NULL,
    notes            TEXT NULL,
    weather          VARCHAR(60) NULL,
    labour_count     INT UNSIGNED NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_wpl_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_wpl_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_wpl_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    CONSTRAINT fk_wpl_user FOREIGN KEY (logged_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_wpl_tenant (tenant_id),
    INDEX idx_wpl_project (project_id, log_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_site_checklists (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    project_id       BIGINT UNSIGNED NOT NULL,
    checklist_date   DATE NOT NULL,
    supervisor_id    BIGINT UNSIGNED NULL,
    notes            TEXT NULL,
    status           ENUM('draft','submitted') NOT NULL DEFAULT 'draft',
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_dsc_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_dsc_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_dsc_user FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_dsc_tenant (tenant_id),
    INDEX idx_dsc_project (project_id, checklist_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS checklist_items (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    checklist_id     BIGINT UNSIGNED NOT NULL,
    label            VARCHAR(200) NOT NULL,
    is_checked       TINYINT(1) NOT NULL DEFAULT 0,
    remark           VARCHAR(255) NULL,
    sort_order       INT UNSIGNED NOT NULL DEFAULT 0,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_ci_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_ci_checklist FOREIGN KEY (checklist_id) REFERENCES daily_site_checklists(id) ON DELETE CASCADE,
    INDEX idx_ci_checklist (checklist_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- MODULE 4 — Material Purchase & Stock
-- ============================================================================

CREATE TABLE IF NOT EXISTS suppliers (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    name             VARCHAR(160) NOT NULL,
    contact_person   VARCHAR(120) NULL,
    email            VARCHAR(190) NULL,
    phone            VARCHAR(40)  NULL,
    address          VARCHAR(255) NULL,
    tax_number       VARCHAR(60)  NULL,
    rating           DECIMAL(3,2) NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at       TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_suppliers_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    INDEX idx_suppliers_tenant (tenant_id),
    INDEX idx_suppliers_name (tenant_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS material_catalog (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    code             VARCHAR(60) NOT NULL,
    name             VARCHAR(160) NOT NULL,
    category         VARCHAR(80) NULL,
    unit             VARCHAR(30) NOT NULL,
    unit_price       DECIMAL(15,4) NOT NULL DEFAULT 0,
    reorder_level    DECIMAL(15,3) NOT NULL DEFAULT 0,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at       TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_matcat_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    UNIQUE KEY uq_matcat_code (tenant_id, code),
    INDEX idx_matcat_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS material_requests (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    project_id       BIGINT UNSIGNED NULL,
    reference        VARCHAR(60) NOT NULL,
    requested_by     BIGINT UNSIGNED NULL,
    required_date    DATE NULL,
    status           ENUM('pending','approved','partially_fulfilled','fulfilled','rejected') NOT NULL DEFAULT 'pending',
    notes            VARCHAR(255) NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_mr_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_mr_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    CONSTRAINT fk_mr_user FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_mr_tenant (tenant_id),
    INDEX idx_mr_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS material_request_items (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    request_id       BIGINT UNSIGNED NOT NULL,
    material_id      BIGINT UNSIGNED NULL,
    description      VARCHAR(200) NOT NULL,
    unit             VARCHAR(30) NULL,
    quantity         DECIMAL(15,3) NOT NULL DEFAULT 0,
    fulfilled_qty    DECIMAL(15,3) NOT NULL DEFAULT 0,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_mri_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_mri_request FOREIGN KEY (request_id) REFERENCES material_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_mri_material FOREIGN KEY (material_id) REFERENCES material_catalog(id) ON DELETE SET NULL,
    INDEX idx_mri_request (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_orders (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    supplier_id      BIGINT UNSIGNED NULL,
    project_id       BIGINT UNSIGNED NULL,
    request_id       BIGINT UNSIGNED NULL,
    po_number        VARCHAR(60) NOT NULL,
    order_date       DATE NOT NULL,
    expected_date    DATE NULL,
    subtotal         DECIMAL(15,2) NOT NULL DEFAULT 0,
    tax_amount       DECIMAL(15,2) NOT NULL DEFAULT 0,
    total            DECIMAL(15,2) NOT NULL DEFAULT 0,
    status           ENUM('draft','sent','received','partially_received','cancelled') NOT NULL DEFAULT 'draft',
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_po_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
    CONSTRAINT fk_po_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    CONSTRAINT fk_po_request FOREIGN KEY (request_id) REFERENCES material_requests(id) ON DELETE SET NULL,
    INDEX idx_po_tenant (tenant_id),
    INDEX idx_po_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    po_id            BIGINT UNSIGNED NOT NULL,
    material_id      BIGINT UNSIGNED NULL,
    description      VARCHAR(200) NOT NULL,
    unit             VARCHAR(30) NULL,
    quantity         DECIMAL(15,3) NOT NULL DEFAULT 0,
    received_qty     DECIMAL(15,3) NOT NULL DEFAULT 0,
    unit_price       DECIMAL(15,4) NOT NULL DEFAULT 0,
    amount           DECIMAL(15,2) NOT NULL DEFAULT 0,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_poi_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_poi_po FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_poi_material FOREIGN KEY (material_id) REFERENCES material_catalog(id) ON DELETE SET NULL,
    INDEX idx_poi_po (po_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Current stock on hand, per material (optionally per project store).
CREATE TABLE IF NOT EXISTS inventory_stock (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    material_id      BIGINT UNSIGNED NOT NULL,
    project_id       BIGINT UNSIGNED NULL,
    quantity_on_hand DECIMAL(15,3) NOT NULL DEFAULT 0,
    avg_unit_cost    DECIMAL(15,4) NOT NULL DEFAULT 0,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_inv_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_inv_material FOREIGN KEY (material_id) REFERENCES material_catalog(id) ON DELETE CASCADE,
    CONSTRAINT fk_inv_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    UNIQUE KEY uq_inv_scope (tenant_id, material_id, project_id),
    INDEX idx_inv_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock_movements (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    material_id      BIGINT UNSIGNED NOT NULL,
    project_id       BIGINT UNSIGNED NULL,
    movement_type    ENUM('in','out','adjustment') NOT NULL,
    quantity         DECIMAL(15,3) NOT NULL,
    unit_cost        DECIMAL(15,4) NOT NULL DEFAULT 0,
    reference_type   VARCHAR(40) NULL,                   -- e.g. purchase_order, material_request
    reference_id     BIGINT UNSIGNED NULL,
    moved_by         BIGINT UNSIGNED NULL,
    notes            VARCHAR(255) NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_sm_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_sm_material FOREIGN KEY (material_id) REFERENCES material_catalog(id) ON DELETE CASCADE,
    CONSTRAINT fk_sm_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    CONSTRAINT fk_sm_user FOREIGN KEY (moved_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_sm_tenant (tenant_id),
    INDEX idx_sm_material (material_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS resource_allocations (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    project_id       BIGINT UNSIGNED NOT NULL,
    resource_type    ENUM('material','labour','machinery') NOT NULL,
    resource_ref_id  BIGINT UNSIGNED NULL,
    description      VARCHAR(200) NULL,
    quantity         DECIMAL(15,3) NOT NULL DEFAULT 0,
    allocated_from   DATE NULL,
    allocated_to     DATE NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_ra_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_ra_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_ra_tenant (tenant_id),
    INDEX idx_ra_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- MODULE 5 — Customer Billing & Invoicing Lifecycle
-- (explicitly models mobilization advances + retention money)
-- ============================================================================

CREATE TABLE IF NOT EXISTS demand_notes (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    project_id       BIGINT UNSIGNED NOT NULL,
    client_id        BIGINT UNSIGNED NULL,
    reference        VARCHAR(60) NOT NULL,
    milestone_id     BIGINT UNSIGNED NULL,
    amount           DECIMAL(15,2) NOT NULL DEFAULT 0,
    note_type        ENUM('standard','mobilization_advance','milestone','retention_release') NOT NULL DEFAULT 'standard',
    due_date         DATE NULL,
    status           ENUM('draft','issued','invoiced','cancelled') NOT NULL DEFAULT 'draft',
    description      VARCHAR(255) NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_dn_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_dn_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_dn_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    CONSTRAINT fk_dn_ms FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE SET NULL,
    INDEX idx_dn_tenant (tenant_id),
    INDEX idx_dn_project (project_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoices (
    id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id            INT UNSIGNED NOT NULL,
    project_id           BIGINT UNSIGNED NOT NULL,
    client_id            BIGINT UNSIGNED NULL,
    demand_note_id       BIGINT UNSIGNED NULL,
    invoice_number       VARCHAR(60) NOT NULL,
    invoice_date         DATE NOT NULL,
    due_date             DATE NULL,
    subtotal             DECIMAL(15,2) NOT NULL DEFAULT 0,
    tax_percent          DECIMAL(6,3) NOT NULL DEFAULT 0,
    tax_amount           DECIMAL(15,2) NOT NULL DEFAULT 0,
    gross_amount         DECIMAL(15,2) NOT NULL DEFAULT 0,   -- subtotal + tax
    retention_percent    DECIMAL(6,3) NOT NULL DEFAULT 0,
    retention_amount     DECIMAL(15,2) NOT NULL DEFAULT 0,   -- withheld this invoice
    mobilization_recovery DECIMAL(15,2) NOT NULL DEFAULT 0,  -- advance recovered this invoice
    net_payable          DECIMAL(15,2) NOT NULL DEFAULT 0,   -- gross - retention - recovery
    amount_paid          DECIMAL(15,2) NOT NULL DEFAULT 0,
    status               ENUM('draft','issued','partially_paid','paid','cancelled') NOT NULL DEFAULT 'draft',
    notes                VARCHAR(255) NULL,
    created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at           TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_inv2_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_inv2_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_inv2_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    CONSTRAINT fk_inv2_dn FOREIGN KEY (demand_note_id) REFERENCES demand_notes(id) ON DELETE SET NULL,
    UNIQUE KEY uq_invoice_number (tenant_id, invoice_number),
    INDEX idx_inv2_tenant (tenant_id),
    INDEX idx_inv2_project (project_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoice_items (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    invoice_id       BIGINT UNSIGNED NOT NULL,
    description      VARCHAR(200) NOT NULL,
    unit             VARCHAR(30) NULL,
    quantity         DECIMAL(15,3) NOT NULL DEFAULT 1,
    rate             DECIMAL(15,4) NOT NULL DEFAULT 0,
    amount           DECIMAL(15,2) NOT NULL DEFAULT 0,
    sort_order       INT UNSIGNED NOT NULL DEFAULT 0,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_ii_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_ii_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    INDEX idx_ii_invoice (invoice_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_receipts (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    invoice_id       BIGINT UNSIGNED NULL,
    project_id       BIGINT UNSIGNED NOT NULL,
    client_id        BIGINT UNSIGNED NULL,
    receipt_number   VARCHAR(60) NOT NULL,
    amount           DECIMAL(15,2) NOT NULL DEFAULT 0,
    payment_date     DATE NOT NULL,
    method           ENUM('cash','bank_transfer','cheque','card','other') NOT NULL DEFAULT 'bank_transfer',
    reference        VARCHAR(120) NULL,
    notes            VARCHAR(255) NULL,
    created_by       BIGINT UNSIGNED NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_pr_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_pr_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
    CONSTRAINT fk_pr_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_pr_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    CONSTRAINT fk_pr_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_pr_tenant (tenant_id),
    INDEX idx_pr_project (project_id),
    INDEX idx_pr_invoice (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mobilization advances given to the client's project; recovered over invoices.
CREATE TABLE IF NOT EXISTS mobilization_advances (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id          INT UNSIGNED NOT NULL,
    project_id         BIGINT UNSIGNED NOT NULL,
    reference          VARCHAR(60) NOT NULL,
    advance_amount     DECIMAL(15,2) NOT NULL DEFAULT 0,
    recovery_percent   DECIMAL(6,3) NOT NULL DEFAULT 0,    -- % recovered from each running bill
    recovered_amount   DECIMAL(15,2) NOT NULL DEFAULT 0,
    balance_amount     DECIMAL(15,2) NOT NULL DEFAULT 0,   -- advance_amount - recovered_amount
    status             ENUM('active','recovered') NOT NULL DEFAULT 'active',
    issued_date        DATE NULL,
    created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_ma_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_ma_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_ma_tenant (tenant_id),
    INDEX idx_ma_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Retention withheld per invoice, tracked until released.
CREATE TABLE IF NOT EXISTS retention_money (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id          INT UNSIGNED NOT NULL,
    project_id         BIGINT UNSIGNED NOT NULL,
    invoice_id         BIGINT UNSIGNED NULL,
    withheld_amount    DECIMAL(15,2) NOT NULL DEFAULT 0,
    released_amount    DECIMAL(15,2) NOT NULL DEFAULT 0,
    balance_amount     DECIMAL(15,2) NOT NULL DEFAULT 0,   -- withheld - released
    status             ENUM('withheld','partially_released','released') NOT NULL DEFAULT 'withheld',
    release_due_date   DATE NULL,
    released_date      DATE NULL,
    created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_ret_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_ret_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_ret_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
    INDEX idx_ret_tenant (tenant_id),
    INDEX idx_ret_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Final settlement bill: compiled totals per project.
CREATE TABLE IF NOT EXISTS settlement_bills (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id               INT UNSIGNED NOT NULL,
    project_id              BIGINT UNSIGNED NOT NULL,
    reference               VARCHAR(60) NOT NULL,
    total_invoiced          DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_received          DECIMAL(15,2) NOT NULL DEFAULT 0,
    advance_recovered       DECIMAL(15,2) NOT NULL DEFAULT 0,
    advance_balance         DECIMAL(15,2) NOT NULL DEFAULT 0,
    retention_withheld      DECIMAL(15,2) NOT NULL DEFAULT 0,
    retention_released      DECIMAL(15,2) NOT NULL DEFAULT 0,
    retention_balance       DECIMAL(15,2) NOT NULL DEFAULT 0,
    net_settlement          DECIMAL(15,2) NOT NULL DEFAULT 0,   -- final amount due to/from client
    status                  ENUM('draft','finalized') NOT NULL DEFAULT 'draft',
    breakdown_json          JSON NULL,                          -- full computed breakdown snapshot
    generated_by            BIGINT UNSIGNED NULL,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_sb_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_sb_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_sb_user FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_sb_tenant (tenant_id),
    INDEX idx_sb_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- MODULE 6 — Sub-contractor & Vendor Management (RA billing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS subcontractors (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    name             VARCHAR(160) NOT NULL,
    trade            VARCHAR(100) NULL,
    contact_person   VARCHAR(120) NULL,
    email            VARCHAR(190) NULL,
    phone            VARCHAR(40)  NULL,
    tax_number       VARCHAR(60)  NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at       TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_sc_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    INDEX idx_sc_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subcontractor_work_orders (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    subcontractor_id BIGINT UNSIGNED NOT NULL,
    project_id       BIGINT UNSIGNED NOT NULL,
    wo_number        VARCHAR(60) NOT NULL,
    scope            VARCHAR(255) NULL,
    order_value      DECIMAL(15,2) NOT NULL DEFAULT 0,
    retention_percent DECIMAL(6,3) NOT NULL DEFAULT 0,
    advance_percent  DECIMAL(6,3) NOT NULL DEFAULT 0,
    start_date       DATE NULL,
    end_date         DATE NULL,
    status           ENUM('draft','active','completed','closed','cancelled') NOT NULL DEFAULT 'draft',
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_wo_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_wo_sc FOREIGN KEY (subcontractor_id) REFERENCES subcontractors(id) ON DELETE CASCADE,
    CONSTRAINT fk_wo_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_wo_tenant (tenant_id),
    INDEX idx_wo_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Running Account bills computed from certified milestone percentages.
CREATE TABLE IF NOT EXISTS ra_bills (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id          INT UNSIGNED NOT NULL,
    work_order_id      BIGINT UNSIGNED NOT NULL,
    project_id         BIGINT UNSIGNED NOT NULL,
    bill_number        VARCHAR(60) NOT NULL,
    sequence_no        INT UNSIGNED NOT NULL DEFAULT 1,     -- RA bill 1, 2, 3...
    certified_percent  DECIMAL(6,3) NOT NULL DEFAULT 0,     -- cumulative certified %
    previous_percent   DECIMAL(6,3) NOT NULL DEFAULT 0,     -- previously billed %
    gross_value        DECIMAL(15,2) NOT NULL DEFAULT 0,    -- work done this bill (order_value * delta%)
    retention_amount   DECIMAL(15,2) NOT NULL DEFAULT 0,
    advance_recovery   DECIMAL(15,2) NOT NULL DEFAULT 0,
    net_payable        DECIMAL(15,2) NOT NULL DEFAULT 0,
    bill_date          DATE NOT NULL,
    status             ENUM('draft','certified','paid') NOT NULL DEFAULT 'draft',
    created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_rab_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_rab_wo FOREIGN KEY (work_order_id) REFERENCES subcontractor_work_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_rab_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_rab_tenant (tenant_id),
    INDEX idx_rab_wo (work_order_id, sequence_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ra_bill_items (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    ra_bill_id       BIGINT UNSIGNED NOT NULL,
    milestone_id     BIGINT UNSIGNED NULL,
    description      VARCHAR(200) NOT NULL,
    certified_percent DECIMAL(6,3) NOT NULL DEFAULT 0,
    amount           DECIMAL(15,2) NOT NULL DEFAULT 0,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_rabi_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_rabi_bill FOREIGN KEY (ra_bill_id) REFERENCES ra_bills(id) ON DELETE CASCADE,
    CONSTRAINT fk_rabi_ms FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE SET NULL,
    INDEX idx_rabi_bill (ra_bill_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- MODULE 7 — HR & Payroll
-- ============================================================================

CREATE TABLE IF NOT EXISTS employees (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    user_id          BIGINT UNSIGNED NULL,               -- optional link to a login
    employee_code    VARCHAR(40) NOT NULL,
    name             VARCHAR(160) NOT NULL,
    designation      VARCHAR(120) NULL,
    employment_type  ENUM('permanent','contract','daily_labour') NOT NULL DEFAULT 'permanent',
    phone            VARCHAR(40) NULL,
    daily_wage       DECIMAL(12,2) NULL,
    monthly_salary   DECIMAL(12,2) NULL,
    join_date        DATE NULL,
    status           ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at       TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_emp_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_emp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY uq_emp_code (tenant_id, employee_code),
    INDEX idx_emp_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance_logs (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    employee_id      BIGINT UNSIGNED NOT NULL,
    project_id       BIGINT UNSIGNED NULL,
    attendance_date  DATE NOT NULL,
    status           ENUM('present','absent','half_day','leave','holiday') NOT NULL DEFAULT 'present',
    hours_worked     DECIMAL(5,2) NULL,
    overtime_hours   DECIMAL(5,2) NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_att_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_att_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    CONSTRAINT fk_att_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    UNIQUE KEY uq_att (tenant_id, employee_id, attendance_date),
    INDEX idx_att_tenant (tenant_id),
    INDEX idx_att_date (tenant_id, attendance_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_configs (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    name             VARCHAR(120) NOT NULL,
    component_type   ENUM('earning','deduction') NOT NULL,
    calc_type        ENUM('fixed','percent_of_basic') NOT NULL DEFAULT 'fixed',
    value            DECIMAL(12,4) NOT NULL DEFAULT 0,
    is_active        TINYINT(1) NOT NULL DEFAULT 1,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_pc_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    INDEX idx_pc_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_runs (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    employee_id      BIGINT UNSIGNED NOT NULL,
    period_month     TINYINT UNSIGNED NOT NULL,
    period_year      SMALLINT UNSIGNED NOT NULL,
    days_present     DECIMAL(5,2) NOT NULL DEFAULT 0,
    gross_earnings   DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
    net_pay          DECIMAL(12,2) NOT NULL DEFAULT 0,
    status           ENUM('draft','approved','paid') NOT NULL DEFAULT 'draft',
    breakdown_json   JSON NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_pru_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_pru_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    UNIQUE KEY uq_payroll_period (tenant_id, employee_id, period_year, period_month),
    INDEX idx_pru_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leave_requests (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    employee_id      BIGINT UNSIGNED NOT NULL,
    leave_type       ENUM('casual','sick','annual','unpaid','other') NOT NULL DEFAULT 'casual',
    from_date        DATE NOT NULL,
    to_date          DATE NOT NULL,
    days             DECIMAL(5,2) NOT NULL DEFAULT 0,
    reason           VARCHAR(255) NULL,
    status           ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    approved_by      BIGINT UNSIGNED NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_lr_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_lr_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    CONSTRAINT fk_lr_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_lr_tenant (tenant_id),
    INDEX idx_lr_emp (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- MODULE 8 — Accounts & Core Ledger (simple P&L)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ledger_accounts (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    code             VARCHAR(40) NOT NULL,
    name             VARCHAR(160) NOT NULL,
    type             ENUM('asset','liability','equity','income','expense') NOT NULL,
    is_active        TINYINT(1) NOT NULL DEFAULT 1,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_la_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    UNIQUE KEY uq_la_code (tenant_id, code),
    INDEX idx_la_tenant (tenant_id),
    INDEX idx_la_type (tenant_id, type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transactions (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    project_id       BIGINT UNSIGNED NULL,
    txn_date         DATE NOT NULL,
    txn_type         ENUM('income','expense') NOT NULL,
    reference        VARCHAR(80) NULL,
    description      VARCHAR(255) NULL,
    amount           DECIMAL(15,2) NOT NULL DEFAULT 0,
    source_type      VARCHAR(40) NULL,                   -- invoice, receipt, payroll, po...
    source_id        BIGINT UNSIGNED NULL,
    created_by       BIGINT UNSIGNED NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_txn_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_txn_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    CONSTRAINT fk_txn_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_txn_tenant (tenant_id),
    INDEX idx_txn_date (tenant_id, txn_date),
    INDEX idx_txn_type (tenant_id, txn_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transaction_lines (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    transaction_id   BIGINT UNSIGNED NOT NULL,
    account_id       BIGINT UNSIGNED NOT NULL,
    debit            DECIMAL(15,2) NOT NULL DEFAULT 0,
    credit           DECIMAL(15,2) NOT NULL DEFAULT 0,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_tl_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_tl_txn FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    CONSTRAINT fk_tl_account FOREIGN KEY (account_id) REFERENCES ledger_accounts(id),
    INDEX idx_tl_txn (transaction_id),
    INDEX idx_tl_account (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- MODULE 9 — Fleet Management
-- ============================================================================

CREATE TABLE IF NOT EXISTS vehicles_machinery (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    asset_code       VARCHAR(40) NOT NULL,
    name             VARCHAR(160) NOT NULL,
    asset_type       ENUM('vehicle','machinery','equipment') NOT NULL DEFAULT 'vehicle',
    registration_no  VARCHAR(60) NULL,
    make_model       VARCHAR(120) NULL,
    status           ENUM('available','in_use','maintenance','retired') NOT NULL DEFAULT 'available',
    assigned_project_id BIGINT UNSIGNED NULL,
    purchase_date    DATE NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at       TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_veh_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_veh_project FOREIGN KEY (assigned_project_id) REFERENCES projects(id) ON DELETE SET NULL,
    UNIQUE KEY uq_veh_code (tenant_id, asset_code),
    INDEX idx_veh_tenant (tenant_id),
    INDEX idx_veh_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fuel_logs (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    vehicle_id       BIGINT UNSIGNED NOT NULL,
    log_date         DATE NOT NULL,
    litres           DECIMAL(10,2) NOT NULL DEFAULT 0,
    cost             DECIMAL(12,2) NOT NULL DEFAULT 0,
    odometer         DECIMAL(12,1) NULL,
    logged_by        BIGINT UNSIGNED NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_fuel_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_fuel_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles_machinery(id) ON DELETE CASCADE,
    CONSTRAINT fk_fuel_user FOREIGN KEY (logged_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_fuel_tenant (tenant_id),
    INDEX idx_fuel_vehicle (vehicle_id, log_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS maintenance_schedules (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    vehicle_id       BIGINT UNSIGNED NOT NULL,
    title            VARCHAR(160) NOT NULL,
    interval_type    ENUM('date','odometer') NOT NULL DEFAULT 'date',
    next_due_date    DATE NULL,
    next_due_odometer DECIMAL(12,1) NULL,
    notes            VARCHAR(255) NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_msch_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_msch_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles_machinery(id) ON DELETE CASCADE,
    INDEX idx_msch_tenant (tenant_id),
    INDEX idx_msch_due (tenant_id, next_due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS maintenance_logs (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    vehicle_id       BIGINT UNSIGNED NOT NULL,
    schedule_id      BIGINT UNSIGNED NULL,
    service_date     DATE NOT NULL,
    description      VARCHAR(255) NULL,
    cost             DECIMAL(12,2) NOT NULL DEFAULT 0,
    odometer         DECIMAL(12,1) NULL,
    vendor           VARCHAR(160) NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_mlog_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_mlog_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles_machinery(id) ON DELETE CASCADE,
    CONSTRAINT fk_mlog_schedule FOREIGN KEY (schedule_id) REFERENCES maintenance_schedules(id) ON DELETE SET NULL,
    INDEX idx_mlog_tenant (tenant_id),
    INDEX idx_mlog_vehicle (vehicle_id, service_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- MODULE 10 — Government Compliance
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_permits (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    project_id       BIGINT UNSIGNED NULL,
    permit_name      VARCHAR(180) NOT NULL,
    permit_type      VARCHAR(100) NULL,
    authority        VARCHAR(160) NULL,
    permit_number    VARCHAR(80) NULL,
    issue_date       DATE NULL,
    expiry_date      DATE NULL,
    status           ENUM('active','pending','expired','renewed','rejected') NOT NULL DEFAULT 'pending',
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at       TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_perm_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_perm_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    INDEX idx_perm_tenant (tenant_id),
    INDEX idx_perm_status (tenant_id, status),
    INDEX idx_perm_expiry (tenant_id, expiry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permit_status_updates (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    permit_id        BIGINT UNSIGNED NOT NULL,
    status           ENUM('active','pending','expired','renewed','rejected','submitted','under_review') NOT NULL,
    remark           VARCHAR(255) NULL,
    updated_by       BIGINT UNSIGNED NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_psu_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_psu_permit FOREIGN KEY (permit_id) REFERENCES compliance_permits(id) ON DELETE CASCADE,
    CONSTRAINT fk_psu_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_psu_permit (permit_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS renewal_deadlines (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    permit_id        BIGINT UNSIGNED NOT NULL,
    due_date         DATE NOT NULL,
    reminder_days    INT UNSIGNED NOT NULL DEFAULT 30,
    is_resolved      TINYINT(1) NOT NULL DEFAULT 0,
    notified_at      TIMESTAMP NULL DEFAULT NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_rd_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_rd_permit FOREIGN KEY (permit_id) REFERENCES compliance_permits(id) ON DELETE CASCADE,
    INDEX idx_rd_tenant (tenant_id),
    INDEX idx_rd_due (tenant_id, due_date, is_resolved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- MODULE 11 — Documents & QHSE
-- ============================================================================

CREATE TABLE IF NOT EXISTS documents (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id          INT UNSIGNED NOT NULL,
    project_id         BIGINT UNSIGNED NULL,
    parent_document_id BIGINT UNSIGNED NULL,             -- version-control root
    title              VARCHAR(200) NOT NULL,
    doc_type           ENUM('blueprint','drawing','contract','permit','photo','other') NOT NULL DEFAULT 'other',
    current_version    INT UNSIGNED NOT NULL DEFAULT 1,
    latest_version_id  BIGINT UNSIGNED NULL,
    uploaded_by        BIGINT UNSIGNED NULL,
    created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at         TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_doc_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    CONSTRAINT fk_doc_parent FOREIGN KEY (parent_document_id) REFERENCES documents(id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_doc_tenant (tenant_id),
    INDEX idx_doc_project (project_id),
    INDEX idx_doc_type (tenant_id, doc_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS document_versions (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    document_id      BIGINT UNSIGNED NOT NULL,
    version_number   INT UNSIGNED NOT NULL DEFAULT 1,
    storage_path     VARCHAR(400) NOT NULL,              -- relative path inside storage/uploads
    original_name    VARCHAR(255) NOT NULL,
    mime_type        VARCHAR(120) NOT NULL,
    file_size        BIGINT UNSIGNED NOT NULL DEFAULT 0,
    checksum         VARCHAR(64) NULL,
    uploaded_by      BIGINT UNSIGNED NULL,
    change_note      VARCHAR(255) NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_dv_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_dv_document FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    CONSTRAINT fk_dv_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY uq_dv_version (document_id, version_number),
    INDEX idx_dv_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_photos (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    project_id       BIGINT UNSIGNED NOT NULL,
    storage_path     VARCHAR(400) NOT NULL,
    original_name    VARCHAR(255) NOT NULL,
    mime_type        VARCHAR(120) NOT NULL,
    file_size        BIGINT UNSIGNED NOT NULL DEFAULT 0,
    caption          VARCHAR(255) NULL,
    taken_at         DATE NULL,
    uploaded_by      BIGINT UNSIGNED NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at       TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_sp_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_sp_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_sp_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_sp_tenant (tenant_id),
    INDEX idx_sp_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS qhse_checklists (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    project_id       BIGINT UNSIGNED NOT NULL,
    checklist_type   ENUM('quality','safety','health','environment') NOT NULL DEFAULT 'safety',
    title            VARCHAR(180) NOT NULL,
    inspection_date  DATE NOT NULL,
    inspector_id     BIGINT UNSIGNED NULL,
    score_percent    DECIMAL(5,2) NULL,
    status           ENUM('draft','submitted','passed','failed') NOT NULL DEFAULT 'draft',
    notes            TEXT NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_qc_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_qc_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_qc_user FOREIGN KEY (inspector_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_qc_tenant (tenant_id),
    INDEX idx_qc_project (project_id, inspection_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS qhse_checklist_items (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    checklist_id     BIGINT UNSIGNED NOT NULL,
    label            VARCHAR(200) NOT NULL,
    response         ENUM('yes','no','na') NOT NULL DEFAULT 'na',
    remark           VARCHAR(255) NULL,
    sort_order       INT UNSIGNED NOT NULL DEFAULT 0,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_qci_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_qci_checklist FOREIGN KEY (checklist_id) REFERENCES qhse_checklists(id) ON DELETE CASCADE,
    INDEX idx_qci_checklist (checklist_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS incidents (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id        INT UNSIGNED NOT NULL,
    project_id       BIGINT UNSIGNED NOT NULL,
    reported_by      BIGINT UNSIGNED NULL,
    incident_date    DATE NOT NULL,
    severity         ENUM('low','medium','high','critical') NOT NULL DEFAULT 'low',
    category         VARCHAR(100) NULL,
    description      TEXT NOT NULL,
    action_taken     TEXT NULL,
    status           ENUM('open','investigating','closed') NOT NULL DEFAULT 'open',
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_inc_tenant FOREIGN KEY (tenant_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_inc_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_inc_user FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_inc_tenant (tenant_id),
    INDEX idx_inc_project (project_id),
    INDEX idx_inc_severity (tenant_id, severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- Cloud-migration note:
-- Nothing here binds to a host or filesystem. All money is DECIMAL (no floats),
-- tenancy is a single scalar column (tenant_id) so the same schema shards or
-- moves to RDS/Cloud SQL unchanged, files are referenced by RELATIVE
-- storage_path (resolved by the Storage class — swap local for S3/GCS without a
-- schema change), and every table is InnoDB/utf8mb4 with explicit FKs + indexes.
-- A future move to Docker/VPS is pure re-hosting: import this dump, point the
-- app at the managed DB, and repoint Storage — no DDL rewrite required.
-- ============================================================================
