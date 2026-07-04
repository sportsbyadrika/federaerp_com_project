<?php
declare(strict_types=1);

namespace App\Models;

/**
 * Users belong to an organisation. The same email may exist under different
 * orgs, so lookups are always (organisation_id, email) pairs.
 */
final class UserModel extends BaseModel
{
    protected string $table = 'users';
    protected string $tenantColumn = 'organisation_id';
    protected bool $softDelete = true;
    protected array $fillable = [
        'organisation_id', 'name', 'email', 'password_hash', 'role',
        'job_role', 'phone', 'status', 'last_login_at',
    ];

    /** The core of the 3-field login: match a user within a specific org. */
    public function findByOrgAndEmail(int $organisationId, string $email): ?array
    {
        return $this->db->fetch(
            'SELECT * FROM users
              WHERE organisation_id = :org AND email = :email AND deleted_at IS NULL',
            [':org' => $organisationId, ':email' => strtolower(trim($email))]
        );
    }

    public function emailExistsInOrg(int $organisationId, string $email, ?int $excludeId = null): bool
    {
        $sql = 'SELECT 1 FROM users WHERE organisation_id = :org AND email = :email AND deleted_at IS NULL';
        $params = [':org' => $organisationId, ':email' => strtolower(trim($email))];
        if ($excludeId !== null) {
            $sql .= ' AND id <> :id';
            $params[':id'] = $excludeId;
        }
        return (bool)$this->db->fetchColumn($sql, $params);
    }

    public function forOrg(int $organisationId): array
    {
        return $this->db->fetchAll(
            'SELECT id, organisation_id, name, email, role, job_role, phone, status, last_login_at, created_at
               FROM users WHERE organisation_id = :org AND deleted_at IS NULL ORDER BY created_at DESC',
            [':org' => $organisationId]
        );
    }

    public function touchLogin(int $userId): void
    {
        $this->db->execute('UPDATE users SET last_login_at = NOW() WHERE id = :id', [':id' => $userId]);
    }

    public function updatePassword(int $userId, string $hash): void
    {
        $this->db->execute(
            'UPDATE users SET password_hash = :h WHERE id = :id',
            [':h' => $hash, ':id' => $userId]
        );
    }

    /** Platform-wide count (Super Admin dashboards). */
    public function totalUsers(): int
    {
        return (int)$this->db->fetchColumn('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL');
    }
}
