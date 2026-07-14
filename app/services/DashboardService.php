<?php
declare(strict_types=1);

namespace App\Services;

use Core\Database;

/**
 * Role-specific dashboard aggregates. Super Admin sees platform-wide figures;
 * Org Admin / Staff see figures scoped to their own organisation only.
 */
final class DashboardService extends BaseService
{
    public function superAdmin(): array
    {
        $db = Database::instance();
        return [
            'organisations' => [
                'total'     => (int)$db->fetchColumn("SELECT COUNT(*) FROM organisations WHERE is_platform = 0 AND deleted_at IS NULL"),
                'active'    => (int)$db->fetchColumn("SELECT COUNT(*) FROM organisations WHERE is_platform = 0 AND status = 'active' AND deleted_at IS NULL"),
                'suspended' => (int)$db->fetchColumn("SELECT COUNT(*) FROM organisations WHERE status = 'suspended' AND deleted_at IS NULL"),
            ],
            'users'    => (int)$db->fetchColumn("SELECT COUNT(*) FROM users WHERE deleted_at IS NULL"),
            'projects' => (int)$db->fetchColumn("SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL"),
            'recent_organisations' => $db->fetchAll("SELECT id, name, status, created_at FROM organisations WHERE is_platform = 0 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 8"),
        ];
    }

    public function tenant(int $tenantId): array
    {
        $db = Database::instance();
        $p = [':t' => $tenantId];

        // Income + expenditure come from the dedicated modules (source of truth),
        // each split into base / GST / total.
        $inc = $db->fetch("SELECT COALESCE(SUM(amount),0) AS base, COALESCE(SUM(gst_amount),0) AS gst, COALESCE(SUM(total_amount),0) AS total FROM incomes WHERE tenant_id=:t", $p);
        $exp = $db->fetch("SELECT COALESCE(SUM(amount),0) AS base, COALESCE(SUM(gst_amount),0) AS gst, COALESCE(SUM(total_amount),0) AS total FROM expenditures WHERE tenant_id=:t", $p);

        $org = $db->fetch(
            "SELECT id, name, legal_name, email, phone, address, city, country, currency, created_at
               FROM organisations WHERE id = :t",
            $p
        );

        return [
            'organisation' => $org,
            'projects' => [
                'total'  => (int)$db->fetchColumn("SELECT COUNT(*) FROM projects WHERE tenant_id=:t AND deleted_at IS NULL", $p),
                'active' => (int)$db->fetchColumn("SELECT COUNT(*) FROM projects WHERE tenant_id=:t AND status='active' AND deleted_at IS NULL", $p),
            ],
            // Progress = share of a project's tasks that sit in a "done" column.
            'weekly_progress' => $db->fetchAll(
                "SELECT p.id, p.name, p.code, p.project_type, p.status,
                        COUNT(t.id) AS task_count,
                        SUM(CASE WHEN ts.is_done = 1 THEN 1 ELSE 0 END) AS done_count,
                        COALESCE(ROUND(100 * SUM(CASE WHEN ts.is_done = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(t.id), 0)), 0) AS progress_percent
                   FROM projects p
                   LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted_at IS NULL
                   LEFT JOIN task_statuses ts ON ts.id = t.status_id
                  WHERE p.tenant_id = :t AND p.deleted_at IS NULL
                  GROUP BY p.id, p.name, p.code, p.project_type, p.status
                  ORDER BY progress_percent DESC, p.id DESC LIMIT 6", $p
            ),
            'directory' => [
                'clients'        => (int)$db->fetchColumn("SELECT COUNT(*) FROM clients WHERE tenant_id=:t AND deleted_at IS NULL", $p),
                'suppliers'      => (int)$db->fetchColumn("SELECT COUNT(*) FROM suppliers WHERE tenant_id=:t AND deleted_at IS NULL", $p),
                'subcontractors' => (int)$db->fetchColumn("SELECT COUNT(*) FROM subcontractors WHERE tenant_id=:t AND deleted_at IS NULL", $p),
            ],
            'fleet' => [
                'total'       => (int)$db->fetchColumn("SELECT COUNT(*) FROM vehicles_machinery WHERE tenant_id=:t AND deleted_at IS NULL", $p),
                'in_use'      => (int)$db->fetchColumn("SELECT COUNT(*) FROM vehicles_machinery WHERE tenant_id=:t AND status='in_use' AND deleted_at IS NULL", $p),
                'maintenance' => (int)$db->fetchColumn("SELECT COUNT(*) FROM vehicles_machinery WHERE tenant_id=:t AND status='maintenance' AND deleted_at IS NULL", $p),
                'available'   => (int)$db->fetchColumn("SELECT COUNT(*) FROM vehicles_machinery WHERE tenant_id=:t AND status='available' AND deleted_at IS NULL", $p),
            ],
            'finance' => [
                'income' => [
                    'base'  => round((float)$inc['base'], 2),
                    'gst'   => round((float)$inc['gst'], 2),
                    'total' => round((float)$inc['total'], 2),
                ],
                'expense' => [
                    'base'  => round((float)$exp['base'], 2),
                    'gst'   => round((float)$exp['gst'], 2),
                    'total' => round((float)$exp['total'], 2),
                ],
                'net' => round((float)$inc['total'] - (float)$exp['total'], 2),
            ],
            'documents_preview' => $db->fetchAll(
                "SELECT sp.id, sp.original_name, sp.caption, sp.created_at FROM site_photos sp
                  WHERE sp.tenant_id=:t AND sp.deleted_at IS NULL ORDER BY sp.id DESC LIMIT 6", $p
            ),
            'compliance_alerts' => (new ComplianceService())->upcomingAlerts($tenantId, 60),
        ];
    }
}
