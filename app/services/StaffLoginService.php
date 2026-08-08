<?php
declare(strict_types=1);

namespace App\Services;

use App\Models\GenericModel;
use App\Models\UserModel;
use Core\Database;

/**
 * Give a staff member a login. Office staff get normal (office) access; field
 * staff additionally get a set of assigned projects and their own field-work
 * tools. The created user's role is office_staff / field_staff.
 */
final class StaffLoginService extends BaseService
{
    private UserModel $users;
    private GenericModel $staff;

    public function __construct()
    {
        $this->users = new UserModel();
        $this->staff = new GenericModel('staff_members', [
            'tenant_id', 'user_id', 'login_role', 'staff_code', 'name', 'phone', 'email', 'staff_type', 'address', 'pan', 'status',
        ], softDelete: true);
    }

    /** Current login + assigned projects for a staff member. */
    public function get(int $tenantId, int $staffId): array
    {
        $staff = $this->staff->findOrFail($staffId, $tenantId);
        $user = null;
        if (!empty($staff['user_id'])) {
            $user = Database::instance()->fetch('SELECT id, email, role, status FROM users WHERE id = :id AND deleted_at IS NULL', [':id' => (int)$staff['user_id']]);
        }
        return [
            'staff_id'     => (int)$staff['id'],
            'name'         => $staff['name'],
            'has_login'    => $user !== null,
            'login_role'   => $staff['login_role'],
            'email'        => $user['email'] ?? $staff['email'],
            'project_ids'  => $this->assignedProjectIds($tenantId, $staffId),
        ];
    }

    /**
     * Create or update the login for a staff member.
     *  - login_role: office | field
     *  - project_ids: assigned projects (field staff only)
     *  - password: required when creating; optional on update (to reset)
     */
    public function save(int $tenantId, int $staffId, array $in): array
    {
        $staff = $this->staff->findOrFail($staffId, $tenantId);
        $loginRole = ($in['login_role'] ?? 'office') === 'field' ? 'field' : 'office';
        $userRole = $loginRole === 'field' ? 'field_staff' : 'office_staff';
        $email = strtolower(trim((string)($in['email'] ?? $staff['email'])));
        if ($email === '') {
            throw ServiceException::unprocessable('An email is required for the login');
        }

        $db = Database::instance();
        $db->beginTransaction();
        try {
            $userId = (int)($staff['user_id'] ?? 0);
            if ($userId > 0 && $db->fetchColumn('SELECT 1 FROM users WHERE id = :id AND deleted_at IS NULL', [':id' => $userId])) {
                // Update existing login.
                if ($this->users->emailExists($email, $userId)) {
                    throw ServiceException::conflict('Another user already uses that email');
                }
                $fields = ['email' => $email, 'role' => $userRole, 'name' => $staff['name']];
                if (!empty($in['password'])) {
                    $fields['password_hash'] = password_hash((string)$in['password'], PASSWORD_DEFAULT);
                }
                $this->users->update($userId, $tenantId, $fields);
            } else {
                // Create a new login.
                if (empty($in['password'])) {
                    throw ServiceException::unprocessable('A password is required to create the login');
                }
                if ($this->users->emailExists($email)) {
                    throw ServiceException::conflict('A user with that email already exists');
                }
                $userId = $this->users->create([
                    'organisation_id' => $tenantId,
                    'name'            => $staff['name'],
                    'email'           => $email,
                    'password_hash'   => password_hash((string)$in['password'], PASSWORD_DEFAULT),
                    'role'            => $userRole,
                    'phone'           => $staff['phone'] ?? null,
                    'status'          => 'active',
                ]);
            }
            $this->staff->update($staffId, $tenantId, ['user_id' => $userId, 'login_role' => $loginRole]);
            $this->setProjects($tenantId, $staffId, $loginRole === 'field' ? ($in['project_ids'] ?? []) : []);
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        return $this->get($tenantId, $staffId);
    }

    /** Remove the login (soft-delete the user, unlink the staff member). */
    public function revoke(int $tenantId, int $staffId): void
    {
        $staff = $this->staff->findOrFail($staffId, $tenantId);
        if (!empty($staff['user_id'])) {
            $this->users->delete((int)$staff['user_id'], $tenantId);
        }
        $this->staff->update($staffId, $tenantId, ['user_id' => null, 'login_role' => null]);
        Database::instance()->execute('DELETE FROM staff_projects WHERE tenant_id = :t AND staff_member_id = :s', [':t' => $tenantId, ':s' => $staffId]);
    }

    private function assignedProjectIds(int $tenantId, int $staffId): array
    {
        $rows = Database::instance()->fetchAll('SELECT project_id FROM staff_projects WHERE tenant_id = :t AND staff_member_id = :s', [':t' => $tenantId, ':s' => $staffId]);
        return array_map(static fn($r) => (int)$r['project_id'], $rows);
    }

    private function setProjects(int $tenantId, int $staffId, array $projectIds): void
    {
        $db = Database::instance();
        $db->execute('DELETE FROM staff_projects WHERE tenant_id = :t AND staff_member_id = :s', [':t' => $tenantId, ':s' => $staffId]);
        $seen = [];
        foreach ($projectIds as $pid) {
            $pid = (int)$pid;
            if ($pid <= 0 || isset($seen[$pid])) { continue; }
            // Only projects that belong to this tenant.
            if (!$db->fetchColumn('SELECT 1 FROM projects WHERE id = :p AND tenant_id = :t AND deleted_at IS NULL', [':p' => $pid, ':t' => $tenantId])) { continue; }
            $seen[$pid] = true;
            $db->execute('INSERT INTO staff_projects (tenant_id, staff_member_id, project_id) VALUES (:t, :s, :p)', [':t' => $tenantId, ':s' => $staffId, ':p' => $pid]);
        }
    }
}
