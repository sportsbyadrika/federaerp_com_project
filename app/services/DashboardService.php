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

        $income = (float)$db->fetchColumn("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE tenant_id=:t AND txn_type='income'", $p);
        $expense = (float)$db->fetchColumn("SELECT COALESCE(SUM(amount),0) FROM transactions WHERE tenant_id=:t AND txn_type='expense'", $p);

        return [
            'projects' => [
                'total'  => (int)$db->fetchColumn("SELECT COUNT(*) FROM projects WHERE tenant_id=:t AND deleted_at IS NULL", $p),
                'active' => (int)$db->fetchColumn("SELECT COUNT(*) FROM projects WHERE tenant_id=:t AND status='active' AND deleted_at IS NULL", $p),
            ],
            'weekly_progress' => $db->fetchAll(
                "SELECT id, name, code, progress_percent, status FROM projects
                  WHERE tenant_id=:t AND deleted_at IS NULL ORDER BY progress_percent DESC LIMIT 6", $p
            ),
            'fleet' => [
                'total'       => (int)$db->fetchColumn("SELECT COUNT(*) FROM vehicles_machinery WHERE tenant_id=:t AND deleted_at IS NULL", $p),
                'in_use'      => (int)$db->fetchColumn("SELECT COUNT(*) FROM vehicles_machinery WHERE tenant_id=:t AND status='in_use' AND deleted_at IS NULL", $p),
                'maintenance' => (int)$db->fetchColumn("SELECT COUNT(*) FROM vehicles_machinery WHERE tenant_id=:t AND status='maintenance' AND deleted_at IS NULL", $p),
                'available'   => (int)$db->fetchColumn("SELECT COUNT(*) FROM vehicles_machinery WHERE tenant_id=:t AND status='available' AND deleted_at IS NULL", $p),
            ],
            'finance' => [
                'income'      => round($income, 2),
                'expense'     => round($expense, 2),
                'net'         => round($income - $expense, 2),
            ],
            'documents_preview' => $db->fetchAll(
                "SELECT sp.id, sp.original_name, sp.caption, sp.created_at FROM site_photos sp
                  WHERE sp.tenant_id=:t AND sp.deleted_at IS NULL ORDER BY sp.id DESC LIMIT 6", $p
            ),
            'compliance_alerts' => (new ComplianceService())->upcomingAlerts($tenantId, 60),
        ];
    }
}
