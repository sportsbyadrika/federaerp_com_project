<?php
declare(strict_types=1);

namespace App\Services;

use App\Models\GenericModel;
use Core\Database;

/**
 * Government compliance permits + renewal alerts. The alerts query is designed
 * to run both per-tenant (in-app) and platform-wide (cPanel Cron), reading the
 * latest permit status and upcoming renewal deadlines.
 */
final class ComplianceService extends BaseService
{
    private GenericModel $permits;
    private GenericModel $statusUpdates;
    private GenericModel $deadlines;

    public function __construct()
    {
        $this->permits      = new GenericModel('compliance_permits', ['tenant_id','project_id','permit_name','permit_type','authority','permit_number','issue_date','expiry_date','status'], softDelete: true);
        $this->statusUpdates= new GenericModel('permit_status_updates', ['tenant_id','permit_id','status','remark','updated_by']);
        $this->deadlines    = new GenericModel('renewal_deadlines', ['tenant_id','permit_id','due_date','reminder_days','is_resolved','notified_at']);
    }

    public function listPermits(int $tenantId): array
    {
        return $this->permits->forTenant($tenantId, [], ['order_by' => 'expiry_date', 'order_dir' => 'ASC']);
    }

    public function createPermit(int $tenantId, ?int $userId, array $input): array
    {
        $db = Database::instance();
        $db->beginTransaction();
        try {
            $permitId = $this->permits->create([
                'tenant_id'    => $tenantId,
                'project_id'   => $input['project_id'] ?? null,
                'permit_name'  => (string)$input['permit_name'],
                'permit_type'  => $input['permit_type'] ?? null,
                'authority'    => $input['authority'] ?? null,
                'permit_number'=> $input['permit_number'] ?? null,
                'issue_date'   => $input['issue_date'] ?? null,
                'expiry_date'  => $input['expiry_date'] ?? null,
                'status'       => $input['status'] ?? 'pending',
            ]);
            $this->statusUpdates->create([
                'tenant_id' => $tenantId, 'permit_id' => $permitId,
                'status' => $input['status'] ?? 'pending', 'remark' => 'Permit recorded', 'updated_by' => $userId,
            ]);
            if (!empty($input['expiry_date'])) {
                $this->deadlines->create([
                    'tenant_id' => $tenantId, 'permit_id' => $permitId, 'due_date' => $input['expiry_date'],
                    'reminder_days' => (int)($input['reminder_days'] ?? 30), 'is_resolved' => 0,
                ]);
            }
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        return $this->permits->findOrFail($permitId, $tenantId);
    }

    public function addStatusUpdate(int $tenantId, int $permitId, ?int $userId, string $status, ?string $remark): array
    {
        $this->permits->findOrFail($permitId, $tenantId);
        $this->statusUpdates->create([
            'tenant_id' => $tenantId, 'permit_id' => $permitId, 'status' => $status, 'remark' => $remark, 'updated_by' => $userId,
        ]);
        $this->permits->update($permitId, $tenantId, ['status' => in_array($status, ['active','pending','expired','renewed','rejected'], true) ? $status : 'pending']);
        return $this->permits->findOrFail($permitId, $tenantId);
    }

    /**
     * Upcoming renewal alerts. $tenantId null = platform-wide (cron mode).
     * Returns permits whose renewal deadline falls within its reminder window
     * (or is already overdue) and is unresolved, with the latest status.
     */
    public function upcomingAlerts(?int $tenantId = null, int $horizonDays = 60): array
    {
        $params = [':horizon' => $horizonDays];
        $tenantClause = '';
        if ($tenantId !== null) {
            $tenantClause = ' AND p.tenant_id = :t';
            $params[':t'] = $tenantId;
        }
        $sql = "SELECT p.id AS permit_id, p.tenant_id, p.permit_name, p.permit_type, p.authority,
                       p.permit_number, p.status AS permit_status, p.expiry_date,
                       rd.id AS deadline_id, rd.due_date, rd.reminder_days, rd.is_resolved,
                       DATEDIFF(rd.due_date, CURDATE()) AS days_remaining,
                       (SELECT psu.status FROM permit_status_updates psu
                         WHERE psu.permit_id = p.id ORDER BY psu.created_at DESC, psu.id DESC LIMIT 1) AS latest_status
                  FROM compliance_permits p
                  JOIN renewal_deadlines rd ON rd.permit_id = p.id AND rd.is_resolved = 0
                 WHERE p.deleted_at IS NULL
                   AND p.status IN ('active','pending','renewed')
                   AND DATEDIFF(rd.due_date, CURDATE()) <= :horizon
                   {$tenantClause}
                 ORDER BY rd.due_date ASC";
        $rows = Database::instance()->fetchAll($sql, $params);
        foreach ($rows as &$r) {
            $days = (int)$r['days_remaining'];
            $r['urgency'] = $days < 0 ? 'overdue' : ($days <= (int)$r['reminder_days'] ? 'due_soon' : 'upcoming');
        }
        return $rows;
    }

    /** Mark a deadline as notified (used by the cron job). */
    public function markNotified(array $deadlineIds): void
    {
        if (!$deadlineIds) return;
        $placeholders = implode(',', array_fill(0, count($deadlineIds), '?'));
        Database::instance()->execute(
            "UPDATE renewal_deadlines SET notified_at = NOW() WHERE id IN ({$placeholders})",
            array_map('intval', $deadlineIds)
        );
    }
}
