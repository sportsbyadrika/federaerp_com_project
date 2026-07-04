<?php
declare(strict_types=1);

namespace App\Models;

/**
 * Configurable model for tables that only need standard tenant-scoped CRUD.
 * Services instantiate it with a table name + fillable columns:
 *   new GenericModel('clients', ['tenant_id','name',...], softDelete: true)
 */
final class GenericModel extends BaseModel
{
    public function __construct(string $table, array $fillable = [], bool $softDelete = false, string $tenantColumn = 'tenant_id')
    {
        $this->table = $table;
        $this->fillable = $fillable;
        $this->softDelete = $softDelete;
        $this->tenantColumn = $tenantColumn;
        parent::__construct();
    }
}
