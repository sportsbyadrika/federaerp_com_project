<?php
declare(strict_types=1);

namespace App\Services;

use App\Models\GenericModel;
use Core\Database;

/**
 * Material requests, stock allocation (auto-deduct with stock_movements),
 * low-inventory flagging, and purchase orders.
 */
final class MaterialService extends BaseService
{
    private GenericModel $requests;
    private GenericModel $requestItems;
    private GenericModel $catalog;
    private GenericModel $stock;
    private GenericModel $movements;
    private GenericModel $pos;
    private GenericModel $poItems;

    public function __construct()
    {
        $this->requests     = new GenericModel('material_requests', ['tenant_id','project_id','reference','requested_by','required_date','status','notes']);
        $this->requestItems = new GenericModel('material_request_items', ['tenant_id','request_id','material_id','description','unit','quantity','fulfilled_qty']);
        $this->catalog      = new GenericModel('material_catalog', ['tenant_id','code','name','category','unit','unit_price','reorder_level'], softDelete: true);
        $this->stock        = new GenericModel('inventory_stock', ['tenant_id','material_id','project_id','quantity_on_hand','avg_unit_cost']);
        $this->movements    = new GenericModel('stock_movements', ['tenant_id','material_id','project_id','movement_type','quantity','unit_cost','reference_type','reference_id','moved_by','notes']);
        $this->pos          = new GenericModel('purchase_orders', ['tenant_id','supplier_id','project_id','request_id','po_number','order_date','expected_date','subtotal','tax_amount','total','status']);
        $this->poItems      = new GenericModel('purchase_order_items', ['tenant_id','po_id','material_id','description','unit','quantity','received_qty','unit_price','amount']);
    }

    // ---- Material requests -------------------------------------------------
    public function listRequests(int $tenantId, ?int $projectId = null): array
    {
        $where = $projectId ? ['project_id' => $projectId] : [];
        $rows = $this->requests->forTenant($tenantId, $where, ['order_by' => 'id', 'order_dir' => 'DESC']);
        foreach ($rows as &$r) {
            $r['items'] = $this->requestItems->forTenant($tenantId, ['request_id' => (int)$r['id']]);
        }
        return $rows;
    }

    public function createRequest(int $tenantId, ?int $userId, array $input): array
    {
        $db = Database::instance();
        $db->beginTransaction();
        try {
            $requestId = $this->requests->create([
                'tenant_id'     => $tenantId,
                'project_id'    => $input['project_id'] ?? null,
                'reference'     => $input['reference'] ?? $this->nextRef($tenantId, 'material_requests', 'MRQ'),
                'requested_by'  => $userId,
                'required_date' => $input['required_date'] ?? null,
                'status'        => 'pending',
                'notes'         => $input['notes'] ?? null,
            ]);
            foreach (($input['items'] ?? []) as $item) {
                $this->requestItems->create([
                    'tenant_id'   => $tenantId, 'request_id' => $requestId,
                    'material_id' => $item['material_id'] ?? null,
                    'description' => (string)($item['description'] ?? 'Material'),
                    'unit'        => $item['unit'] ?? null,
                    'quantity'    => (float)($item['quantity'] ?? 0),
                    'fulfilled_qty' => 0,
                ]);
            }
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        $row = $this->requests->findOrFail($requestId, $tenantId);
        $row['items'] = $this->requestItems->forTenant($tenantId, ['request_id' => $requestId]);
        return $row;
    }

    /**
     * Allocate stock to a project: deduct on-hand inventory and write an 'out'
     * stock movement. Rejects if insufficient stock.
     */
    public function allocateStock(int $tenantId, ?int $userId, array $input): array
    {
        $materialId = (int)$input['material_id'];
        $projectId = isset($input['project_id']) ? (int)$input['project_id'] : null;
        $qty = round((float)$input['quantity'], 3);
        if ($qty <= 0) {
            throw ServiceException::unprocessable('Allocation quantity must be positive');
        }

        $db = Database::instance();
        $db->beginTransaction();
        try {
            // Prefer project-specific stock row, else the tenant-wide row.
            $stockRow = $db->fetch(
                'SELECT * FROM inventory_stock WHERE tenant_id=:t AND material_id=:m AND (project_id <=> :p) LIMIT 1',
                [':t' => $tenantId, ':m' => $materialId, ':p' => $projectId]
            );
            if ($stockRow === null) {
                $stockRow = $db->fetch(
                    'SELECT * FROM inventory_stock WHERE tenant_id=:t AND material_id=:m ORDER BY quantity_on_hand DESC LIMIT 1',
                    [':t' => $tenantId, ':m' => $materialId]
                );
            }
            $available = $stockRow ? (float)$stockRow['quantity_on_hand'] : 0.0;
            if ($available < $qty) {
                throw ServiceException::unprocessable("Insufficient stock: {$available} available, {$qty} requested");
            }

            $db->execute(
                'UPDATE inventory_stock SET quantity_on_hand = quantity_on_hand - :q WHERE id = :id AND tenant_id = :t',
                [':q' => $qty, ':id' => (int)$stockRow['id'], ':t' => $tenantId]
            );
            $this->movements->create([
                'tenant_id' => $tenantId, 'material_id' => $materialId, 'project_id' => $projectId,
                'movement_type' => 'out', 'quantity' => $qty, 'unit_cost' => (float)$stockRow['avg_unit_cost'],
                'reference_type' => $input['reference_type'] ?? 'allocation', 'reference_id' => $input['reference_id'] ?? null,
                'moved_by' => $userId, 'notes' => $input['notes'] ?? 'Stock allocated to project',
            ]);
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }

        return [
            'material_id' => $materialId,
            'allocated'   => $qty,
            'remaining'   => round($available - $qty, 3),
            'low_stock'   => $this->isLowStock($tenantId, $materialId),
        ];
    }

    /** Materials at or below their reorder level. */
    public function lowInventory(int $tenantId): array
    {
        return Database::instance()->fetchAll(
            'SELECT mc.id, mc.code, mc.name, mc.unit, mc.reorder_level,
                    COALESCE(SUM(inv.quantity_on_hand),0) AS quantity_on_hand
               FROM material_catalog mc
               LEFT JOIN inventory_stock inv ON inv.material_id = mc.id AND inv.tenant_id = mc.tenant_id
              WHERE mc.tenant_id = :t AND mc.deleted_at IS NULL
              GROUP BY mc.id
             HAVING quantity_on_hand <= mc.reorder_level
              ORDER BY quantity_on_hand ASC',
            [':t' => $tenantId]
        );
    }

    // ---- Purchase orders ---------------------------------------------------
    public function createPurchaseOrder(int $tenantId, array $input): array
    {
        $items = $input['items'] ?? [];
        $subtotal = 0.0;
        foreach ($items as $it) {
            $subtotal += round((float)($it['quantity'] ?? 0) * (float)($it['unit_price'] ?? 0), 2);
        }
        $taxAmount = round((float)($input['tax_amount'] ?? 0), 2);

        $db = Database::instance();
        $db->beginTransaction();
        try {
            $poId = $this->pos->create([
                'tenant_id'     => $tenantId,
                'supplier_id'   => $input['supplier_id'] ?? null,
                'project_id'    => $input['project_id'] ?? null,
                'request_id'    => $input['request_id'] ?? null,
                'po_number'     => $input['po_number'] ?? $this->nextRef($tenantId, 'purchase_orders', 'PO', 'po_number'),
                'order_date'    => $input['order_date'] ?? date('Y-m-d'),
                'expected_date' => $input['expected_date'] ?? null,
                'subtotal'      => round($subtotal, 2), 'tax_amount' => $taxAmount,
                'total'         => round($subtotal + $taxAmount, 2), 'status' => 'draft',
            ]);
            $order = 0;
            foreach ($items as $it) {
                $amount = round((float)($it['quantity'] ?? 0) * (float)($it['unit_price'] ?? 0), 2);
                $this->poItems->create([
                    'tenant_id' => $tenantId, 'po_id' => $poId, 'material_id' => $it['material_id'] ?? null,
                    'description' => (string)($it['description'] ?? 'Material'), 'unit' => $it['unit'] ?? null,
                    'quantity' => (float)($it['quantity'] ?? 0), 'received_qty' => 0,
                    'unit_price' => (float)($it['unit_price'] ?? 0), 'amount' => $amount,
                ]);
                $order++;
            }
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        $po = $this->pos->findOrFail($poId, $tenantId);
        $po['items'] = $this->poItems->forTenant($tenantId, ['po_id' => $poId]);
        return $po;
    }

    public function listPurchaseOrders(int $tenantId): array
    {
        return $this->pos->forTenant($tenantId, [], ['order_by' => 'id', 'order_dir' => 'DESC']);
    }

    private function isLowStock(int $tenantId, int $materialId): bool
    {
        $row = Database::instance()->fetch(
            'SELECT mc.reorder_level, COALESCE(SUM(inv.quantity_on_hand),0) AS qty
               FROM material_catalog mc
               LEFT JOIN inventory_stock inv ON inv.material_id = mc.id AND inv.tenant_id = mc.tenant_id
              WHERE mc.id = :m AND mc.tenant_id = :t GROUP BY mc.id',
            [':m' => $materialId, ':t' => $tenantId]
        );
        return $row !== null && (float)$row['qty'] <= (float)$row['reorder_level'];
    }

    private function nextRef(int $tenantId, string $table, string $prefix, string $column = 'reference'): string
    {
        $count = (int)Database::instance()->fetchColumn("SELECT COUNT(*) FROM `{$table}` WHERE tenant_id = :t", [':t' => $tenantId]);
        return sprintf('%s-%04d', $prefix, $count + 1);
    }
}
