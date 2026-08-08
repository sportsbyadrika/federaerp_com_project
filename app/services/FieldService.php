<?php
declare(strict_types=1);

namespace App\Services;

use App\Models\GenericModel;
use Core\Database;

/**
 * Field-staff daily work: a logged-in field staff member records daily tasks and
 * the labour (skilled / unskilled) needed on their assigned projects. Entries are
 * submitted for review by the institution admin (pending → approved / rejected).
 */
final class FieldService extends BaseService
{
    private GenericModel $logs;

    public function __construct()
    {
        $this->logs = new GenericModel('field_daily_logs', [
            'tenant_id', 'staff_member_id', 'project_id', 'task_name', 'skilled_count',
            'unskilled_count', 'log_date', 'notes', 'review_status', 'review_note', 'reviewed_by', 'reviewed_at',
        ]);
    }

    /** The staff_members row for a logged-in field-staff user (or null). */
    public function staffForUser(int $tenantId, int $userId): ?array
    {
        return Database::instance()->fetch(
            'SELECT * FROM staff_members WHERE tenant_id = :t AND user_id = :u AND deleted_at IS NULL',
            [':t' => $tenantId, ':u' => $userId]
        );
    }

    /** Assigned projects for a field-staff member (for their dropdowns). */
    public function assignedProjects(int $tenantId, int $staffId): array
    {
        return Database::instance()->fetchAll(
            'SELECT p.id, p.code, p.name FROM staff_projects sp
               JOIN projects p ON p.id = sp.project_id AND p.deleted_at IS NULL
              WHERE sp.tenant_id = :t AND sp.staff_member_id = :s
              ORDER BY p.name ASC',
            [':t' => $tenantId, ':s' => $staffId]
        );
    }

    /** The field staff member's own context: profile + assigned projects. */
    public function context(int $tenantId, int $userId): array
    {
        $staff = $this->staffForUser($tenantId, $userId);
        if ($staff === null) {
            throw ServiceException::forbidden('No field-staff profile for this login');
        }
        return [
            'staff'    => ['id' => (int)$staff['id'], 'name' => $staff['name'], 'staff_code' => $staff['staff_code']],
            'projects' => $this->assignedProjects($tenantId, (int)$staff['id']),
        ];
    }

    /** Create a daily log for the logged-in field staff member. */
    public function createLog(int $tenantId, int $userId, array $in): array
    {
        $staff = $this->staffForUser($tenantId, $userId);
        if ($staff === null) {
            throw ServiceException::forbidden('No field-staff profile for this login');
        }
        $projectId = (int)($in['project_id'] ?? 0);
        $this->assertAssigned($tenantId, (int)$staff['id'], $projectId);
        $task = trim((string)($in['task_name'] ?? ''));
        if ($task === '') {
            throw ServiceException::unprocessable('Task name is required');
        }
        $id = $this->logs->create([
            'tenant_id'       => $tenantId,
            'staff_member_id' => (int)$staff['id'],
            'project_id'      => $projectId,
            'task_name'       => $task,
            'skilled_count'   => max(0, (int)($in['skilled_count'] ?? 0)),
            'unskilled_count' => max(0, (int)($in['unskilled_count'] ?? 0)),
            'log_date'        => $in['log_date'] ?? date('Y-m-d'),
            'notes'           => $in['notes'] ?? null,
            'review_status'   => 'pending',
        ]);
        return $this->find($tenantId, $id);
    }

    /** Logs submitted by the logged-in field staff member. */
    public function myLogs(int $tenantId, int $userId): array
    {
        $staff = $this->staffForUser($tenantId, $userId);
        if ($staff === null) {
            throw ServiceException::forbidden('No field-staff profile for this login');
        }
        return $this->query($tenantId, ['staff_member_id' => (int)$staff['id']]);
    }

    /** All field logs for the admin review queue (optional filters). */
    public function allLogs(int $tenantId, array $filters = []): array
    {
        return $this->query($tenantId, $filters);
    }

    /** Admin review: approve / reject a log. */
    public function review(int $tenantId, int $logId, ?int $reviewerId, string $status, ?string $note): array
    {
        $this->logs->findOrFail($logId, $tenantId);
        $status = in_array($status, ['approved', 'rejected', 'pending'], true) ? $status : 'pending';
        $this->logs->update($logId, $tenantId, [
            'review_status' => $status,
            'review_note'   => $note,
            'reviewed_by'   => $reviewerId,
            'reviewed_at'   => date('Y-m-d H:i:s'),
        ]);
        return $this->find($tenantId, $logId);
    }

    private function find(int $tenantId, int $id): array
    {
        $rows = $this->query($tenantId, ['id' => $id]);
        if (!$rows) { throw ServiceException::notFound('Log not found'); }
        return $rows[0];
    }

    private function query(int $tenantId, array $filters): array
    {
        $conds = ['l.tenant_id = :t'];
        $params = [':t' => $tenantId];
        if (isset($filters['id'])) { $conds[] = 'l.id = :id'; $params[':id'] = (int)$filters['id']; }
        if (isset($filters['staff_member_id'])) { $conds[] = 'l.staff_member_id = :s'; $params[':s'] = (int)$filters['staff_member_id']; }
        if (!empty($filters['review_status'])) { $conds[] = 'l.review_status = :rs'; $params[':rs'] = $filters['review_status']; }
        if (!empty($filters['project_id'])) { $conds[] = 'l.project_id = :p'; $params[':p'] = (int)$filters['project_id']; }
        return Database::instance()->fetchAll(
            'SELECT l.*, p.name AS project_name, p.code AS project_code, st.name AS staff_name, u.name AS reviewer_name
               FROM field_daily_logs l
               JOIN projects p ON p.id = l.project_id
               JOIN staff_members st ON st.id = l.staff_member_id
               LEFT JOIN users u ON u.id = l.reviewed_by
              WHERE ' . implode(' AND ', $conds) . '
              ORDER BY l.log_date DESC, l.id DESC',
            $params
        );
    }

    private function assertAssigned(int $tenantId, int $staffId, int $projectId): void
    {
        $ok = Database::instance()->fetchColumn(
            'SELECT 1 FROM staff_projects WHERE tenant_id = :t AND staff_member_id = :s AND project_id = :p',
            [':t' => $tenantId, ':s' => $staffId, ':p' => $projectId]
        );
        if (!$ok) {
            throw ServiceException::unprocessable('That project is not assigned to you');
        }
    }
}
