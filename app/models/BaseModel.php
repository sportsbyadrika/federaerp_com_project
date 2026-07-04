<?php
declare(strict_types=1);

namespace App\Models;

use Core\Database;

/**
 * Thin PDO-backed model with built-in tenant scoping. EVERY read/write goes
 * through prepared statements and (for business tables) is filtered by
 * tenant_id, so no query can leak across organisations.
 *
 * Subclasses set $table, $fillable, and optionally $softDelete/$tenantColumn.
 */
abstract class BaseModel
{
    protected string $table;
    protected array $fillable = [];
    protected bool $softDelete = false;
    protected string $tenantColumn = 'tenant_id';

    protected Database $db;

    public function __construct()
    {
        $this->db = Database::instance();
    }

    public function table(): string
    {
        return $this->table;
    }

    /** Find one row by id, scoped to tenant (unless $tenantId is null = unscoped/super-admin). */
    public function find(int $id, ?int $tenantId): ?array
    {
        $sql = "SELECT * FROM `{$this->table}` WHERE id = :id";
        $params = [':id' => $id];
        if ($tenantId !== null) {
            $sql .= " AND `{$this->tenantColumn}` = :tenant";
            $params[':tenant'] = $tenantId;
        }
        if ($this->softDelete) {
            $sql .= " AND deleted_at IS NULL";
        }
        return $this->db->fetch($sql, $params);
    }

    /** Find one row by id or throw a not-found ServiceException. */
    public function findOrFail(int $id, ?int $tenantId): array
    {
        $row = $this->find($id, $tenantId);
        if ($row === null) {
            throw \App\Services\ServiceException::notFound(ucfirst($this->table) . ' record not found');
        }
        return $row;
    }

    /**
     * List rows for a tenant.
     * @param array $where  column => value (equality, ANDed)
     * @param array $opts   order_by, order_dir, limit, offset
     */
    public function forTenant(int $tenantId, array $where = [], array $opts = []): array
    {
        [$sql, $params] = $this->buildSelect($tenantId, $where, $opts);
        return $this->db->fetchAll($sql, $params);
    }

    public function countForTenant(int $tenantId, array $where = []): int
    {
        $conds = ["`{$this->tenantColumn}` = :tenant"];
        $params = [':tenant' => $tenantId];
        if ($this->softDelete) {
            $conds[] = 'deleted_at IS NULL';
        }
        $i = 0;
        foreach ($where as $col => $val) {
            $ph = ':w' . $i++;
            $conds[] = "`{$col}` = {$ph}";
            $params[$ph] = $val;
        }
        $sql = "SELECT COUNT(*) FROM `{$this->table}` WHERE " . implode(' AND ', $conds);
        return (int)$this->db->fetchColumn($sql, $params);
    }

    private function buildSelect(?int $tenantId, array $where, array $opts): array
    {
        $conds = [];
        $params = [];
        if ($tenantId !== null) {
            $conds[] = "`{$this->tenantColumn}` = :tenant";
            $params[':tenant'] = $tenantId;
        }
        if ($this->softDelete) {
            $conds[] = 'deleted_at IS NULL';
        }
        $i = 0;
        foreach ($where as $col => $val) {
            $ph = ':w' . $i++;
            $conds[] = "`{$col}` = {$ph}";
            $params[$ph] = $val;
        }
        $sql = "SELECT * FROM `{$this->table}`";
        if ($conds) {
            $sql .= ' WHERE ' . implode(' AND ', $conds);
        }

        $orderBy = $opts['order_by'] ?? 'id';
        $orderDir = strtoupper($opts['order_dir'] ?? 'DESC') === 'ASC' ? 'ASC' : 'DESC';
        // Whitelist order column to an actual identifier pattern to avoid injection.
        if (preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', (string)$orderBy)) {
            $sql .= " ORDER BY `{$orderBy}` {$orderDir}";
        }
        if (isset($opts['limit'])) {
            $sql .= ' LIMIT ' . (int)$opts['limit'];
            if (isset($opts['offset'])) {
                $sql .= ' OFFSET ' . (int)$opts['offset'];
            }
        }
        return [$sql, $params];
    }

    /** Insert, honoring $fillable. tenant_id must be included by the caller. */
    public function create(array $data): int
    {
        $clean = $this->filterFillable($data);
        return $this->db->insert($this->table, $clean);
    }

    /** Update by id within a tenant. Returns affected rows. */
    public function update(int $id, ?int $tenantId, array $data): int
    {
        $clean = $this->filterFillable($data);
        if (!$clean) {
            return 0;
        }
        $sets = [];
        $params = [];
        foreach ($clean as $col => $val) {
            $sets[] = "`{$col}` = :{$col}";
            $params[":{$col}"] = $val;
        }
        $sql = "UPDATE `{$this->table}` SET " . implode(', ', $sets) . " WHERE id = :id";
        $params[':id'] = $id;
        if ($tenantId !== null) {
            $sql .= " AND `{$this->tenantColumn}` = :tenant";
            $params[':tenant'] = $tenantId;
        }
        return $this->db->execute($sql, $params);
    }

    public function delete(int $id, ?int $tenantId): int
    {
        if ($this->softDelete) {
            $sql = "UPDATE `{$this->table}` SET deleted_at = NOW() WHERE id = :id";
        } else {
            $sql = "DELETE FROM `{$this->table}` WHERE id = :id";
        }
        $params = [':id' => $id];
        if ($tenantId !== null) {
            $sql .= " AND `{$this->tenantColumn}` = :tenant";
            $params[':tenant'] = $tenantId;
        }
        return $this->db->execute($sql, $params);
    }

    protected function filterFillable(array $data): array
    {
        if (!$this->fillable) {
            return $data;
        }
        return array_intersect_key($data, array_flip($this->fillable));
    }

    /** Escape hatch for module-specific queries; still uses prepared statements. */
    public function db(): Database
    {
        return $this->db;
    }
}
