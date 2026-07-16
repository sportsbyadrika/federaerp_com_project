<?php
declare(strict_types=1);

namespace App\Services;

use App\Models\GenericModel;
use Core\Database;

/**
 * Income from customer projects. Amount is the taxable base; GST is computed
 * and stored so a receipt can be printed with or without GST.
 */
final class IncomeService extends BaseService
{
    private GenericModel $income;

    public function __construct()
    {
        $this->income = new GenericModel('incomes', [
            'tenant_id', 'project_id', 'client_id', 'receipt_no', 'amount', 'gst_percent',
            'gst_amount', 'total_amount', 'mode', 'bank_account_id', 'reference', 'income_date', 'notes', 'created_by',
        ]);
    }

    public function list(int $tenantId, ?int $projectId = null): array
    {
        $conds = ['i.tenant_id = :t'];
        $params = [':t' => $tenantId];
        if ($projectId) { $conds[] = 'i.project_id = :p'; $params[':p'] = $projectId; }
        $rows = Database::instance()->fetchAll(
            'SELECT i.*, p.name AS project_name, c.name AS client_name, ba.account_label AS bank_label
               FROM incomes i
               LEFT JOIN projects p ON p.id = i.project_id
               LEFT JOIN clients c ON c.id = i.client_id
               LEFT JOIN bank_accounts ba ON ba.id = i.bank_account_id
              WHERE ' . implode(' AND ', $conds) . '
              ORDER BY i.income_date DESC, i.id DESC',
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

    public function get(int $tenantId, int $id): array
    {
        $row = Database::instance()->fetch(
            'SELECT i.*, p.name AS project_name, p.code AS project_code, c.name AS client_name, c.address AS client_address, c.gst_number AS client_gst,
                    ba.account_label AS bank_label
               FROM incomes i
               LEFT JOIN projects p ON p.id = i.project_id
               LEFT JOIN clients c ON c.id = i.client_id
               LEFT JOIN bank_accounts ba ON ba.id = i.bank_account_id
              WHERE i.id = :id AND i.tenant_id = :t',
            [':id' => $id, ':t' => $tenantId]
        );
        if ($row === null) {
            throw ServiceException::notFound('Income record not found');
        }
        return $row;
    }

    public function create(int $tenantId, ?int $userId, array $in): array
    {
        $computed = $this->compute($in);
        $id = $this->income->create([
            'tenant_id'    => $tenantId,
            'project_id'   => (int)$in['project_id'],
            'client_id'    => $in['client_id'] ?? null,
            'receipt_no'   => $in['receipt_no'] ?? $this->nextReceipt($tenantId),
            'amount'       => $computed['amount'],
            'gst_percent'  => $computed['gst_percent'],
            'gst_amount'   => $computed['gst_amount'],
            'total_amount' => $computed['total_amount'],
            'mode'         => $this->safeMode($in['mode'] ?? 'fund_transfer'),
            'bank_account_id' => $this->bankFor($in['mode'] ?? 'fund_transfer', $in['bank_account_id'] ?? null),
            'reference'    => $in['reference'] ?? null,
            'income_date'  => $in['income_date'] ?? date('Y-m-d'),
            'notes'        => $in['notes'] ?? null,
            'created_by'   => $userId,
        ]);
        return $this->get($tenantId, $id);
    }

    public function update(int $tenantId, int $id, array $in): array
    {
        $this->income->findOrFail($id, $tenantId);
        $computed = $this->compute($in);
        $this->income->update($id, $tenantId, [
            'project_id'   => (int)$in['project_id'],
            'client_id'    => $in['client_id'] ?? null,
            'amount'       => $computed['amount'],
            'gst_percent'  => $computed['gst_percent'],
            'gst_amount'   => $computed['gst_amount'],
            'total_amount' => $computed['total_amount'],
            'mode'         => $this->safeMode($in['mode'] ?? 'fund_transfer'),
            'bank_account_id' => $this->bankFor($in['mode'] ?? 'fund_transfer', $in['bank_account_id'] ?? null),
            'reference'    => $in['reference'] ?? null,
            'income_date'  => $in['income_date'] ?? date('Y-m-d'),
            'notes'        => $in['notes'] ?? null,
        ]);
        return $this->get($tenantId, $id);
    }

    public function delete(int $tenantId, int $id): void
    {
        $this->income->findOrFail($id, $tenantId);
        $this->income->delete($id, $tenantId);
    }

    private function safeMode(?string $mode): string
    {
        return in_array($mode, ['cash', 'fund_transfer', 'cheque', 'dd'], true) ? $mode : 'fund_transfer';
    }

    /** A bank account only applies to non-cash modes; blank -> null. */
    private function bankFor(?string $mode, $bankId): ?int
    {
        if (!in_array($mode, ['fund_transfer', 'cheque', 'dd'], true)) return null;
        return ($bankId === null || $bankId === '') ? null : (int)$bankId;
    }

    private function compute(array $in): array
    {
        $amount = round((float)($in['amount'] ?? 0), 2);
        $gstPct = (float)($in['gst_percent'] ?? 0);
        $gst = round($amount * $gstPct / 100, 2);
        return ['amount' => $amount, 'gst_percent' => round($gstPct, 3), 'gst_amount' => $gst, 'total_amount' => round($amount + $gst, 2)];
    }

    private function nextReceipt(int $tenantId): string
    {
        $count = (int)Database::instance()->fetchColumn('SELECT COUNT(*) FROM incomes WHERE tenant_id = :t', [':t' => $tenantId]);
        return sprintf('RCPT-%s-%04d', date('Y'), $count + 1);
    }
}
