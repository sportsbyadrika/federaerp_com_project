<?php
declare(strict_types=1);

namespace App\Services;

use App\Models\GenericModel;
use Core\Database;

/**
 * Estimation engine. Computes a detailed cost breakdown from quantity inputs +
 * configured base rates, and persists/versions estimates.
 *
 * Calculation (deterministic — the frontend mirrors this exactly):
 *   line.rate      = override rate if given, else configured base_rate
 *   line.eff_qty   = quantity * (1 + wastage%/100)   [materials only; labour has no wastage]
 *   line.amount    = round(eff_qty * rate, 2)
 *   materials_total= Σ material line amounts
 *   labour_total   = Σ labour line amounts
 *   subtotal       = materials_total + labour_total
 *   overhead       = subtotal * overhead%/100
 *   margin         = (subtotal + overhead) * margin%/100
 *   grand_total    = subtotal + overhead + margin
 */
final class EstimationService extends BaseService
{
    private GenericModel $estimates;
    private GenericModel $lineItems;

    private const EST_FILLABLE = [
        'tenant_id', 'client_id', 'lead_id', 'model_id', 'reference', 'title', 'version',
        'parent_estimate_id', 'square_footage', 'labour_hours', 'materials_total',
        'labour_total', 'overhead_percent', 'margin_percent', 'grand_total', 'status', 'created_by',
    ];
    private const LINE_FILLABLE = [
        'tenant_id', 'estimate_id', 'line_type', 'item_code', 'description', 'unit',
        'quantity', 'rate', 'amount', 'sort_order',
    ];

    public function __construct()
    {
        $this->estimates = new GenericModel('estimates', self::EST_FILLABLE, softDelete: true);
        $this->lineItems = new GenericModel('estimate_line_items', self::LINE_FILLABLE);
    }

    /**
     * Compute a breakdown without persisting.
     * @param array $input model_id, overhead_percent, margin_percent, line_items[]
     */
    public function calculate(int $tenantId, array $input): array
    {
        $overheadPct = (float)($input['overhead_percent'] ?? 0);
        $marginPct = (float)($input['margin_percent'] ?? 0);
        $rawLines = is_array($input['line_items'] ?? null) ? $input['line_items'] : [];

        if (!$rawLines) {
            throw ServiceException::unprocessable('At least one line item is required to calculate an estimate');
        }

        // Preload configured base rates for this tenant (+ model) for override lookup.
        $rates = $this->loadRates($tenantId, isset($input['model_id']) ? (int)$input['model_id'] : null);

        $lines = [];
        $materialsTotal = 0.0;
        $labourTotal = 0.0;
        $order = 0;

        foreach ($rawLines as $raw) {
            $type = in_array(($raw['line_type'] ?? 'material'), ['material', 'labour', 'other'], true)
                ? $raw['line_type'] : 'material';
            $code = isset($raw['item_code']) ? (string)$raw['item_code'] : null;
            $qty = max(0.0, (float)($raw['quantity'] ?? 0));

            $config = $code !== null ? ($rates[$type . ':' . $code] ?? null) : null;
            $rate = isset($raw['rate']) && $raw['rate'] !== '' && $raw['rate'] !== null
                ? (float)$raw['rate']
                : (float)($config['base_rate'] ?? 0);
            $wastage = $type === 'material'
                ? (float)($raw['wastage_percent'] ?? $config['wastage_percent'] ?? 0)
                : 0.0;

            $effQty = $qty * (1 + $wastage / 100);
            $amount = round($effQty * $rate, 2);

            if ($type === 'material') {
                $materialsTotal += $amount;
            } elseif ($type === 'labour') {
                $labourTotal += $amount;
            } else {
                // 'other' rolls into materials bucket for subtotal purposes
                $materialsTotal += $amount;
            }

            $lines[] = [
                'line_type'       => $type,
                'item_code'       => $code,
                'description'     => (string)($raw['description'] ?? ($config['item_name'] ?? 'Line item')),
                'unit'            => $raw['unit'] ?? ($config['unit'] ?? null),
                'quantity'        => round($qty, 4),
                'wastage_percent' => round($wastage, 3),
                'effective_qty'   => round($effQty, 4),
                'rate'            => round($rate, 4),
                'amount'          => $amount,
                'sort_order'      => (int)($raw['sort_order'] ?? $order),
            ];
            $order++;
        }

        $materialsTotal = round($materialsTotal, 2);
        $labourTotal = round($labourTotal, 2);
        $subtotal = round($materialsTotal + $labourTotal, 2);
        $overhead = round($subtotal * $overheadPct / 100, 2);
        $margin = round(($subtotal + $overhead) * $marginPct / 100, 2);
        $grandTotal = round($subtotal + $overhead + $margin, 2);

        return [
            'line_items'       => $lines,
            'materials_total'  => $materialsTotal,
            'labour_total'     => $labourTotal,
            'subtotal'         => $subtotal,
            'overhead_percent' => round($overheadPct, 3),
            'overhead_amount'  => $overhead,
            'margin_percent'   => round($marginPct, 3),
            'margin_amount'    => $margin,
            'grand_total'      => $grandTotal,
        ];
    }

    /** Persist a new estimate (with computed line items). */
    public function save(int $tenantId, ?int $userId, array $input): array
    {
        $breakdown = $this->calculate($tenantId, $input);
        $db = Database::instance();

        $db->beginTransaction();
        try {
            $estimateId = $this->estimates->create([
                'tenant_id'        => $tenantId,
                'client_id'        => $input['client_id'] ?? null,
                'lead_id'          => $input['lead_id'] ?? null,
                'model_id'         => $input['model_id'] ?? null,
                'reference'        => $input['reference'] ?? $this->nextReference($tenantId),
                'title'            => (string)($input['title'] ?? 'Untitled estimate'),
                'version'          => 1,
                'square_footage'   => $input['square_footage'] ?? null,
                'labour_hours'     => $input['labour_hours'] ?? null,
                'materials_total'  => $breakdown['materials_total'],
                'labour_total'     => $breakdown['labour_total'],
                'overhead_percent' => $breakdown['overhead_percent'],
                'margin_percent'   => $breakdown['margin_percent'],
                'grand_total'      => $breakdown['grand_total'],
                'status'           => $input['status'] ?? 'draft',
                'created_by'       => $userId,
            ]);
            $this->insertLines($tenantId, $estimateId, $breakdown['line_items']);
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        return $this->get($tenantId, $estimateId);
    }

    /** Create a new version from an existing estimate. */
    public function createVersion(int $tenantId, int $estimateId, ?int $userId, array $input): array
    {
        $parent = $this->estimates->findOrFail($estimateId, $tenantId);
        $breakdown = $this->calculate($tenantId, $input);
        $db = Database::instance();

        $db->beginTransaction();
        try {
            $newId = $this->estimates->create([
                'tenant_id'          => $tenantId,
                'client_id'          => $parent['client_id'],
                'lead_id'            => $parent['lead_id'],
                'model_id'           => $input['model_id'] ?? $parent['model_id'],
                'reference'          => $parent['reference'],
                'title'              => (string)($input['title'] ?? $parent['title']),
                'version'            => (int)$parent['version'] + 1,
                'parent_estimate_id' => $parent['id'],
                'square_footage'     => $input['square_footage'] ?? $parent['square_footage'],
                'labour_hours'       => $input['labour_hours'] ?? $parent['labour_hours'],
                'materials_total'    => $breakdown['materials_total'],
                'labour_total'       => $breakdown['labour_total'],
                'overhead_percent'   => $breakdown['overhead_percent'],
                'margin_percent'     => $breakdown['margin_percent'],
                'grand_total'        => $breakdown['grand_total'],
                'status'             => 'draft',
                'created_by'         => $userId,
            ]);
            $this->insertLines($tenantId, $newId, $breakdown['line_items']);
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        return $this->get($tenantId, $newId);
    }

    public function list(int $tenantId): array
    {
        return $this->estimates->forTenant($tenantId, [], ['order_by' => 'created_at', 'order_dir' => 'DESC']);
    }

    public function get(int $tenantId, int $estimateId): array
    {
        $estimate = $this->estimates->findOrFail($estimateId, $tenantId);
        $estimate['line_items'] = $this->lineItems->forTenant(
            $tenantId,
            ['estimate_id' => $estimateId],
            ['order_by' => 'sort_order', 'order_dir' => 'ASC']
        );
        return $estimate;
    }

    public function delete(int $tenantId, int $estimateId): void
    {
        $this->estimates->findOrFail($estimateId, $tenantId);
        $this->estimates->delete($estimateId, $tenantId);
    }

    // ---- helpers ----------------------------------------------------------
    private function insertLines(int $tenantId, int $estimateId, array $lines): void
    {
        foreach ($lines as $line) {
            $this->lineItems->create([
                'tenant_id'   => $tenantId,
                'estimate_id' => $estimateId,
                'line_type'   => $line['line_type'],
                'item_code'   => $line['item_code'],
                'description' => $line['description'],
                'unit'        => $line['unit'],
                'quantity'    => $line['quantity'],
                'rate'        => $line['rate'],
                'amount'      => $line['amount'],
                'sort_order'  => $line['sort_order'],
            ]);
        }
    }

    private function loadRates(int $tenantId, ?int $modelId): array
    {
        $sql = 'SELECT rate_type, item_code, item_name, unit, base_rate, wastage_percent
                  FROM base_rate_configs
                 WHERE tenant_id = :t AND is_active = 1 AND deleted_at IS NULL';
        $params = [':t' => $tenantId];
        if ($modelId !== null) {
            $sql .= ' AND (model_id = :m OR model_id IS NULL)';
            $params[':m'] = $modelId;
        }
        $out = [];
        foreach (Database::instance()->fetchAll($sql, $params) as $r) {
            $out[$r['rate_type'] . ':' . $r['item_code']] = $r;
        }
        return $out;
    }

    private function nextReference(int $tenantId): string
    {
        $count = $this->estimates->countForTenant($tenantId);
        return sprintf('EST-%s-%04d', date('Y'), $count + 1);
    }
}
