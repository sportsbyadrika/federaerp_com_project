<?php
declare(strict_types=1);

namespace App\Services;

use App\Models\GenericModel;
use Core\Database;

/**
 * Sub-contractor Running Account (RA) billing. Each RA bill pays the delta
 * between the newly certified cumulative % and the previously billed %:
 *   delta_percent    = certified_percent - previous_percent
 *   gross_value      = order_value * delta_percent / 100
 *   retention_amount = gross_value * retention_percent / 100
 *   advance_recovery = gross_value * advance_percent   / 100
 *   net_payable      = gross_value - retention_amount - advance_recovery
 */
final class RaBillingService extends BaseService
{
    private GenericModel $workOrders;
    private GenericModel $bills;
    private GenericModel $billItems;

    public function __construct()
    {
        $this->workOrders = new GenericModel('subcontractor_work_orders', ['tenant_id','subcontractor_id','project_id','wo_number','scope','order_value','retention_percent','advance_percent','start_date','end_date','status']);
        $this->bills      = new GenericModel('ra_bills', ['tenant_id','work_order_id','project_id','bill_number','sequence_no','certified_percent','previous_percent','gross_value','retention_amount','advance_recovery','net_payable','bill_date','status']);
        $this->billItems  = new GenericModel('ra_bill_items', ['tenant_id','ra_bill_id','milestone_id','description','certified_percent','amount']);
    }

    public function listWorkOrders(int $tenantId, ?int $projectId = null): array
    {
        $where = $projectId ? ['project_id' => $projectId] : [];
        return $this->workOrders->forTenant($tenantId, $where, ['order_by' => 'id', 'order_dir' => 'DESC']);
    }

    public function createWorkOrder(int $tenantId, array $input): array
    {
        $id = $this->workOrders->create([
            'tenant_id'        => $tenantId,
            'subcontractor_id' => (int)$input['subcontractor_id'],
            'project_id'       => (int)$input['project_id'],
            'wo_number'        => $input['wo_number'] ?? $this->nextRef($tenantId, 'subcontractor_work_orders', 'WO', 'wo_number'),
            'scope'            => $input['scope'] ?? null,
            'order_value'      => (float)($input['order_value'] ?? 0),
            'retention_percent'=> (float)($input['retention_percent'] ?? 0),
            'advance_percent'  => (float)($input['advance_percent'] ?? 0),
            'start_date'       => $input['start_date'] ?? null,
            'end_date'         => $input['end_date'] ?? null,
            'status'           => $input['status'] ?? 'active',
        ]);
        return $this->workOrders->findOrFail($id, $tenantId);
    }

    public function listBills(int $tenantId, int $workOrderId): array
    {
        return $this->bills->forTenant($tenantId, ['work_order_id' => $workOrderId], ['order_by' => 'sequence_no', 'order_dir' => 'ASC']);
    }

    /** Compute an RA bill breakdown without persisting (preview). */
    public function compute(int $tenantId, int $workOrderId, float $certifiedPercent): array
    {
        $wo = $this->workOrders->findOrFail($workOrderId, $tenantId);
        $orderValue = (float)$wo['order_value'];
        $previous = (float)Database::instance()->fetchColumn(
            'SELECT COALESCE(MAX(certified_percent),0) FROM ra_bills WHERE tenant_id=:t AND work_order_id=:w',
            [':t' => $tenantId, ':w' => $workOrderId]
        );
        $certifiedPercent = max(0.0, min(100.0, $certifiedPercent));
        $delta = round($certifiedPercent - $previous, 3);
        if ($delta <= 0) {
            throw ServiceException::unprocessable("Certified % ({$certifiedPercent}) must exceed previously billed % ({$previous})");
        }
        $gross = round($orderValue * $delta / 100, 2);
        $retention = round($gross * (float)$wo['retention_percent'] / 100, 2);
        $advanceRecovery = round($gross * (float)$wo['advance_percent'] / 100, 2);
        $net = round($gross - $retention - $advanceRecovery, 2);

        return [
            'work_order_id'     => $workOrderId,
            'order_value'       => $orderValue,
            'previous_percent'  => $previous,
            'certified_percent' => $certifiedPercent,
            'delta_percent'     => $delta,
            'gross_value'       => $gross,
            'retention_amount'  => $retention,
            'advance_recovery'  => $advanceRecovery,
            'net_payable'       => $net,
            'next_sequence'     => (int)Database::instance()->fetchColumn('SELECT COALESCE(MAX(sequence_no),0)+1 FROM ra_bills WHERE tenant_id=:t AND work_order_id=:w', [':t' => $tenantId, ':w' => $workOrderId]),
        ];
    }

    /** Persist an RA bill from a certified % (optionally tied to a milestone). */
    public function generate(int $tenantId, int $workOrderId, float $certifiedPercent, array $opts = []): array
    {
        $c = $this->compute($tenantId, $workOrderId, $certifiedPercent);
        $wo = $this->workOrders->findOrFail($workOrderId, $tenantId);

        $db = Database::instance();
        $db->beginTransaction();
        try {
            $billId = $this->bills->create([
                'tenant_id'         => $tenantId, 'work_order_id' => $workOrderId, 'project_id' => (int)$wo['project_id'],
                'bill_number'       => $opts['bill_number'] ?? $this->nextRef($tenantId, 'ra_bills', 'RA', 'bill_number'),
                'sequence_no'       => $c['next_sequence'], 'certified_percent' => $c['certified_percent'],
                'previous_percent'  => $c['previous_percent'], 'gross_value' => $c['gross_value'],
                'retention_amount'  => $c['retention_amount'], 'advance_recovery' => $c['advance_recovery'],
                'net_payable'       => $c['net_payable'], 'bill_date' => $opts['bill_date'] ?? date('Y-m-d'),
                'status'            => 'certified',
            ]);
            $this->billItems->create([
                'tenant_id' => $tenantId, 'ra_bill_id' => $billId, 'milestone_id' => $opts['milestone_id'] ?? null,
                'description' => $opts['description'] ?? "Certified work {$c['delta_percent']}%",
                'certified_percent' => $c['delta_percent'], 'amount' => $c['gross_value'],
            ]);
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        $bill = $this->bills->findOrFail($billId, $tenantId);
        $bill['items'] = $this->billItems->forTenant($tenantId, ['ra_bill_id' => $billId]);
        return $bill;
    }

    private function nextRef(int $tenantId, string $table, string $prefix, string $column = 'reference'): string
    {
        $count = (int)Database::instance()->fetchColumn("SELECT COUNT(*) FROM `{$table}` WHERE tenant_id = :t", [':t' => $tenantId]);
        return sprintf('%s-%04d', $prefix, $count + 1);
    }
}
