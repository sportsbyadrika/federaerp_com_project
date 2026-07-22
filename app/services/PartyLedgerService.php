<?php
declare(strict_types=1);

namespace App\Services;

use Core\Database;

/**
 * Ledger for a Client / Supplier / Sub-contractor: every income and expense
 * associated with that party, with totals and a net (income − expense).
 *   - Client:        income received from the client + expenditure on the
 *                    client's projects.
 *   - Supplier:      expenditure paid to that supplier.
 *   - Sub-contractor: expenditure paid to that sub-contractor.
 */
final class PartyLedgerService extends BaseService
{
    private const TABLES = ['client' => 'clients', 'supplier' => 'suppliers', 'subcontractor' => 'subcontractors'];

    public function ledger(int $tenantId, string $type, int $id): array
    {
        if (!isset(self::TABLES[$type])) {
            throw ServiceException::notFound('Unknown party type');
        }
        $db = Database::instance();
        $party = $db->fetch(
            'SELECT * FROM ' . self::TABLES[$type] . ' WHERE id = :id AND tenant_id = :t AND deleted_at IS NULL',
            [':id' => $id, ':t' => $tenantId]
        );
        if ($party === null) {
            throw ServiceException::notFound(ucfirst($type) . ' not found');
        }

        $txns = [];
        if ($type === 'client') {
            // Income received from the client.
            foreach ($db->fetchAll(
                "SELECT i.income_date AS txn_date, 'income' AS txn_type, i.receipt_no AS reference,
                        p.name AS project_name, i.total_amount AS income_amount, 0 AS expense_amount
                   FROM incomes i LEFT JOIN projects p ON p.id = i.project_id
                  WHERE i.tenant_id = :t AND i.client_id = :id",
                [':t' => $tenantId, ':id' => $id]
            ) as $r) { $txns[] = $r; }
            // Expenditure on the client's projects.
            foreach ($db->fetchAll(
                "SELECT e.expense_date AS txn_date, 'expense' AS txn_type, e.reference,
                        p.name AS project_name, 0 AS income_amount, e.total_amount AS expense_amount
                   FROM expenditures e JOIN projects p ON p.id = e.project_id
                  WHERE e.tenant_id = :t AND p.client_id = :id",
                [':t' => $tenantId, ':id' => $id]
            ) as $r) { $txns[] = $r; }
        } else {
            // Supplier / sub-contractor: expenditure paid to them.
            foreach ($db->fetchAll(
                "SELECT e.expense_date AS txn_date, 'expense' AS txn_type, e.reference,
                        p.name AS project_name, 0 AS income_amount, e.total_amount AS expense_amount
                   FROM expenditures e LEFT JOIN projects p ON p.id = e.project_id
                  WHERE e.tenant_id = :t AND e.party_type = :pt AND e.party_id = :id",
                [':t' => $tenantId, ':pt' => $type, ':id' => $id]
            ) as $r) { $txns[] = $r; }
        }

        // Stable sort by date then type (expense before income on the same day).
        usort($txns, static function ($a, $b) {
            $c = strcmp((string)$a['txn_date'], (string)$b['txn_date']);
            return $c !== 0 ? $c : strcmp((string)$a['txn_type'], (string)$b['txn_type']);
        });

        $incomeTotal = 0.0; $expenseTotal = 0.0;
        foreach ($txns as &$t) {
            $incomeTotal += (float)$t['income_amount'];
            $expenseTotal += (float)$t['expense_amount'];
        }
        unset($t);

        return [
            'party' => [
                'id'    => (int)$party['id'],
                'type'  => $type,
                'name'  => $party['name'],
                'gst'   => $party['gst_number'] ?? null,
                'pan'   => $party['pan'] ?? null,
                'phone' => $party['phone'] ?? null,
            ],
            'transactions'  => $txns,
            'income_total'  => round($incomeTotal, 2),
            'expense_total' => round($expenseTotal, 2),
            'net'           => round($incomeTotal - $expenseTotal, 2),
        ];
    }
}
