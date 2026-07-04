<?php
declare(strict_types=1);

namespace App\Models;

/**
 * Organisations = tenants. PK is the 6-digit organisation_id itself.
 */
final class OrganisationModel extends BaseModel
{
    protected string $table = 'organisations';
    protected bool $softDelete = true;
    protected array $fillable = [
        'id', 'name', 'legal_name', 'email', 'phone', 'address', 'city',
        'country', 'currency', 'is_platform', 'status',
    ];

    public function findById(int $orgId): ?array
    {
        return $this->db->fetch(
            'SELECT * FROM organisations WHERE id = :id AND deleted_at IS NULL',
            [':id' => $orgId]
        );
    }

    public function existsById(int $orgId): bool
    {
        return $this->findById($orgId) !== null;
    }

    /** Generate a unique random 6-digit org id (never 111111 / reserved range). */
    public function generateUniqueId(): int
    {
        for ($attempt = 0; $attempt < 50; $attempt++) {
            $candidate = random_int(100000, 999999);
            if ($candidate === 111111) {
                continue; // reserved for Super Admin platform org
            }
            $exists = $this->db->fetchColumn(
                'SELECT 1 FROM organisations WHERE id = :id',
                [':id' => $candidate]
            );
            if (!$exists) {
                return $candidate;
            }
        }
        throw new \RuntimeException('Could not allocate a unique organisation id');
    }

    /** Platform-wide listing (Super Admin only). */
    public function allOrganisations(array $opts = []): array
    {
        $sql = 'SELECT * FROM organisations WHERE deleted_at IS NULL ORDER BY created_at DESC';
        if (isset($opts['limit'])) {
            $sql .= ' LIMIT ' . (int)$opts['limit'];
        }
        return $this->db->fetchAll($sql);
    }
}
