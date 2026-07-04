<?php
declare(strict_types=1);

/**
 * Non-secret application configuration. Secrets live in config/.env.
 */
return [
    'name'      => \Core\Env::get('APP_NAME', 'Construction SaaS'),
    'env'       => \Core\Env::get('APP_ENV', 'production'),
    'debug'     => \Core\Env::bool('APP_DEBUG', false),
    'url'       => \Core\Env::get('APP_URL', ''),

    // Reserved organisation id for the platform operator (Super Admin).
    'super_admin_org_id' => 111111,

    // Business roles used for RBAC in the service layer.
    'roles' => ['super_admin', 'org_admin', 'staff'],

    // Domain sub-roles (per CLAUDE.md) stored on users.job_role.
    'job_roles' => ['owner', 'admin', 'project_manager', 'accountant', 'site_supervisor', 'subcontractor'],

    'pagination' => ['per_page' => 25, 'max_per_page' => 100],
];
