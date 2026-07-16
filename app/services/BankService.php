<?php
declare(strict_types=1);

namespace App\Services;

use Core\Database;

/**
 * Bank account ledger + balances. A bank's balance is its opening balance plus
 * income received through it, minus expenditure paid through it. Amounts are the
 * total (GST-inclusive) figures actually moved through the account.
 */
final class BankService extends BaseService
{
    /** Per-bank balances for the dashboard (label + computed balance). */
    public function balances(int $tenantId): array
    {
        $rows = Database::instance()->fetchAll(
            'SELECT ba.id, ba.account_label AS label, COALESCE(ba.opening_balance,0) AS opening_balance,
                    COALESCE(inc.total,0) AS income_total, COALESCE(exp.total,0) AS expense_total
               FROM bank_accounts ba
               LEFT JOIN (SELECT bank_account_id, SUM(total_amount) total FROM incomes WHERE tenant_id = :ti GROUP BY bank_account_id) inc ON inc.bank_account_id = ba.id
               LEFT JOIN (SELECT bank_account_id, SUM(total_amount) total FROM expenditures WHERE tenant_id = :te GROUP BY bank_account_id) exp ON exp.bank_account_id = ba.id
              WHERE ba.tenant_id = :t AND ba.deleted_at IS NULL
              ORDER BY ba.account_label ASC',
            [':t' => $tenantId, ':ti' => $tenantId, ':te' => $tenantId]
        );
        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'id'      => (int)$r['id'],
                'label'   => $r['label'],
                'balance' => round((float)$r['opening_balance'] + (float)$r['income_total'] - (float)$r['expense_total'], 2),
            ];
        }
        return $out;
    }

    /** Full ledger for one bank account: header + dated transactions + totals. */
    public function ledger(int $tenantId, int $bankId): array
    {
        $bank = Database::instance()->fetch(
            'SELECT * FROM bank_accounts WHERE id = :id AND tenant_id = :t AND deleted_at IS NULL',
            [':id' => $bankId, ':t' => $tenantId]
        );
        if ($bank === null) {
            throw ServiceException::notFound('Bank account not found');
        }

        $txns = Database::instance()->fetchAll(
            "SELECT income_date AS txn_date, 'income' AS txn_type, receipt_no AS reference,
                    total_amount AS income_amount, 0 AS expense_amount, id
               FROM incomes WHERE tenant_id = :ti AND bank_account_id = :bi
             UNION ALL
             SELECT expense_date AS txn_date, 'expense' AS txn_type, reference,
                    0 AS income_amount, total_amount AS expense_amount, id
               FROM expenditures WHERE tenant_id = :te AND bank_account_id = :be
             ORDER BY txn_date ASC, id ASC",
            [':ti' => $tenantId, ':bi' => $bankId, ':te' => $tenantId, ':be' => $bankId]
        );

        $opening = round((float)($bank['opening_balance'] ?? 0), 2);
        $running = $opening;
        $incomeTotal = 0.0; $expenseTotal = 0.0;
        foreach ($txns as &$t) {
            $inc = (float)$t['income_amount']; $exp = (float)$t['expense_amount'];
            $incomeTotal += $inc; $expenseTotal += $exp;
            $running = round($running + $inc - $exp, 2);
            $t['balance'] = $running;
        }
        unset($t);

        return [
            'bank' => [
                'id'                   => (int)$bank['id'],
                'account_label'        => $bank['account_label'],
                'bank_name'            => $bank['bank_name'],
                'account_number'       => $bank['account_number'],
                'ifsc'                 => $bank['ifsc'],
                'branch_name'          => $bank['branch_name'],
                'opening_balance'      => $opening,
                'opening_balance_date' => $bank['opening_balance_date'],
            ],
            'transactions'  => $txns,
            'income_total'  => round($incomeTotal, 2),
            'expense_total' => round($expenseTotal, 2),
            'balance'       => round($opening + $incomeTotal - $expenseTotal, 2),
        ];
    }
}
