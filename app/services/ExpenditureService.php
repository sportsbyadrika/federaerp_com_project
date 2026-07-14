<?php
declare(strict_types=1);

namespace App\Services;

use App\Models\GenericModel;
use Core\Database;

/**
 * Expenditure — project-wise and institution-wise. Each record has a type,
 * optional party (supplier/subcontractor), optional project + task, amount and
 * mode of payment.
 */
final class ExpenditureService extends BaseService
{
    private GenericModel $exp;

    public function __construct()
    {
        $this->exp = new GenericModel('expenditures', [
            'tenant_id', 'scope', 'project_id', 'expenditure_type_id', 'party_type', 'party_id',
            'task_id', 'amount', 'gst_percent', 'gst_amount', 'total_amount',
            'mode', 'reference', 'expense_date', 'notes', 'created_by',
        ]);
    }

    public function list(int $tenantId, array $filters = []): array
    {
        $conds = ['e.tenant_id = :t'];
        $params = [':t' => $tenantId];
        if (!empty($filters['scope'])) { $conds[] = 'e.scope = :sc'; $params[':sc'] = $filters['scope']; }
        if (!empty($filters['project_id'])) { $conds[] = 'e.project_id = :p'; $params[':p'] = (int)$filters['project_id']; }

        $rows = Database::instance()->fetchAll(
            'SELECT e.*, et.name AS type_name, p.name AS project_name, t.title AS task_title,
                    CASE e.party_type WHEN \'supplier\' THEN s.name WHEN \'subcontractor\' THEN sc.name ELSE NULL END AS party_name
               FROM expenditures e
               LEFT JOIN expenditure_types et ON et.id = e.expenditure_type_id
               LEFT JOIN projects p ON p.id = e.project_id
               LEFT JOIN tasks t ON t.id = e.task_id
               LEFT JOIN suppliers s ON s.id = e.party_id AND e.party_type = \'supplier\'
               LEFT JOIN subcontractors sc ON sc.id = e.party_id AND e.party_type = \'subcontractor\'
              WHERE ' . implode(' AND ', $conds) . '
              ORDER BY e.expense_date DESC, e.id DESC',
            $params
        );
        $base = 0.0; $gst = 0.0; $total = 0.0;
        foreach ($rows as $r) {
            $base += (float)$r['amount'];
            $gst += (float)$r['gst_amount'];
            $total += (float)$r['total_amount'];
        }
        return ['items' => $rows, 'base' => round($base, 2), 'gst' => round($gst, 2), 'total' => round($total, 2)];
    }

    public function create(int $tenantId, ?int $userId, array $in): array
    {
        $id = $this->exp->create($this->payload($tenantId, $in) + ['created_by' => $userId]);
        return $this->exp->findOrFail($id, $tenantId);
    }

    public function update(int $tenantId, int $id, array $in): array
    {
        $this->exp->findOrFail($id, $tenantId);
        $this->exp->update($id, $tenantId, $this->payload($tenantId, $in));
        return $this->exp->findOrFail($id, $tenantId);
    }

    public function delete(int $tenantId, int $id): void
    {
        $this->exp->findOrFail($id, $tenantId);
        $this->exp->delete($id, $tenantId);
    }

    private function payload(int $tenantId, array $in): array
    {
        $scope = $in['scope'] ?? 'project';
        if (!in_array($scope, ['project', 'institutional'], true)) $scope = 'project';
        $partyType = $in['party_type'] ?? 'none';
        if (!in_array($partyType, ['supplier', 'subcontractor', 'none'], true)) $partyType = 'none';
        $mode = $in['mode'] ?? 'cash';
        if (!in_array($mode, ['cash', 'fund_transfer', 'cheque', 'dd'], true)) $mode = 'cash';
        $amount = round((float)($in['amount'] ?? 0), 2);
        $gstPct = round((float)($in['gst_percent'] ?? 0), 3);
        $gstAmount = round($amount * $gstPct / 100, 2);
        return [
            'tenant_id'           => $tenantId,
            'scope'               => $scope,
            'project_id'          => $scope === 'project' ? ($in['project_id'] ?? null) : null,
            'expenditure_type_id' => $in['expenditure_type_id'] ?? null,
            'party_type'          => $partyType,
            'party_id'            => $partyType === 'none' ? null : ($in['party_id'] ?? null),
            'task_id'             => $scope === 'project' ? ($in['task_id'] ?? null) : null,
            'amount'              => $amount,
            'gst_percent'         => $gstPct,
            'gst_amount'          => $gstAmount,
            'total_amount'        => round($amount + $gstAmount, 2),
            'mode'                => $mode,
            'reference'           => $in['reference'] ?? null,
            'expense_date'        => $in['expense_date'] ?? date('Y-m-d'),
            'notes'               => $in['notes'] ?? null,
        ];
    }
}
