<?php
declare(strict_types=1);

namespace App\Services;

use Core\Database;

/**
 * Reporting layer. Each report returns a uniform shape:
 *   { title, columns:[{key,label}], rows:[...], summary:{...} }
 * so the frontend report wrapper renders/print/CSV them identically, and the
 * server can emit CSV for large datasets via the same definition.
 */
final class ReportService extends BaseService
{
    /** @return array{title:string,columns:array,rows:array,summary:array} */
    public function build(int $tenantId, string $report, array $filters): array
    {
        return match ($report) {
            'financial'        => $this->financial($tenantId, $filters),
            'project_progress' => $this->projectProgress($tenantId),
            'inventory'        => $this->inventory($tenantId),
            'compliance'       => $this->compliance($tenantId),
            'ra_bills'         => $this->raBills($tenantId),
            default            => throw ServiceException::notFound('Unknown report'),
        };
    }

    private function financial(int $tenantId, array $filters): array
    {
        $db = Database::instance();
        $rows = $db->fetchAll(
            "SELECT txn_date, txn_type, reference, description, amount
               FROM transactions WHERE tenant_id = :t ORDER BY txn_date DESC, id DESC",
            [':t' => $tenantId]
        );
        $income = 0.0; $expense = 0.0;
        foreach ($rows as $r) {
            if ($r['txn_type'] === 'income') $income += (float)$r['amount']; else $expense += (float)$r['amount'];
        }
        return [
            'title'   => 'Financial Summary (Income & Expense)',
            'columns' => [
                ['key' => 'txn_date', 'label' => 'Date'], ['key' => 'txn_type', 'label' => 'Type'],
                ['key' => 'reference', 'label' => 'Reference'], ['key' => 'description', 'label' => 'Description'],
                ['key' => 'amount', 'label' => 'Amount'],
            ],
            'rows'    => $rows,
            'summary' => ['Income' => round($income, 2), 'Expense' => round($expense, 2), 'Net' => round($income - $expense, 2)],
        ];
    }

    private function projectProgress(int $tenantId): array
    {
        $rows = Database::instance()->fetchAll(
            "SELECT code, name, status, progress_percent, contract_value, start_date, end_date
               FROM projects WHERE tenant_id = :t AND deleted_at IS NULL ORDER BY progress_percent DESC",
            [':t' => $tenantId]
        );
        return [
            'title'   => 'Project Progress',
            'columns' => [
                ['key' => 'code', 'label' => 'Code'], ['key' => 'name', 'label' => 'Project'],
                ['key' => 'status', 'label' => 'Status'], ['key' => 'progress_percent', 'label' => 'Progress %'],
                ['key' => 'contract_value', 'label' => 'Contract value'], ['key' => 'end_date', 'label' => 'Target end'],
            ],
            'rows'    => $rows,
            'summary' => ['Projects' => count($rows)],
        ];
    }

    private function inventory(int $tenantId): array
    {
        $rows = Database::instance()->fetchAll(
            "SELECT mc.code, mc.name, mc.unit, mc.reorder_level,
                    COALESCE(SUM(inv.quantity_on_hand),0) AS quantity_on_hand
               FROM material_catalog mc
               LEFT JOIN inventory_stock inv ON inv.material_id = mc.id AND inv.tenant_id = mc.tenant_id
              WHERE mc.tenant_id = :t AND mc.deleted_at IS NULL
              GROUP BY mc.id ORDER BY quantity_on_hand ASC",
            [':t' => $tenantId]
        );
        $low = 0;
        foreach ($rows as &$r) {
            $r['status'] = (float)$r['quantity_on_hand'] <= (float)$r['reorder_level'] ? 'LOW' : 'OK';
            if ($r['status'] === 'LOW') $low++;
        }
        return [
            'title'   => 'Inventory Stock Report',
            'columns' => [
                ['key' => 'code', 'label' => 'Code'], ['key' => 'name', 'label' => 'Material'],
                ['key' => 'unit', 'label' => 'Unit'], ['key' => 'quantity_on_hand', 'label' => 'On hand'],
                ['key' => 'reorder_level', 'label' => 'Reorder level'], ['key' => 'status', 'label' => 'Status'],
            ],
            'rows'    => $rows,
            'summary' => ['Materials' => count($rows), 'Low stock' => $low],
        ];
    }

    private function compliance(int $tenantId): array
    {
        $rows = (new ComplianceService())->upcomingAlerts($tenantId, 180);
        return [
            'title'   => 'Compliance Renewals',
            'columns' => [
                ['key' => 'permit_name', 'label' => 'Permit'], ['key' => 'authority', 'label' => 'Authority'],
                ['key' => 'permit_number', 'label' => 'Number'], ['key' => 'due_date', 'label' => 'Due'],
                ['key' => 'days_remaining', 'label' => 'Days left'], ['key' => 'urgency', 'label' => 'Urgency'],
            ],
            'rows'    => $rows,
            'summary' => ['Upcoming renewals' => count($rows)],
        ];
    }

    private function raBills(int $tenantId): array
    {
        $rows = Database::instance()->fetchAll(
            "SELECT rb.bill_number, wo.wo_number, rb.certified_percent, rb.gross_value,
                    rb.retention_amount, rb.net_payable, rb.bill_date, rb.status
               FROM ra_bills rb JOIN subcontractor_work_orders wo ON wo.id = rb.work_order_id
              WHERE rb.tenant_id = :t ORDER BY rb.id DESC",
            [':t' => $tenantId]
        );
        $total = 0.0;
        foreach ($rows as $r) $total += (float)$r['net_payable'];
        return [
            'title'   => 'Sub-contractor RA Bills',
            'columns' => [
                ['key' => 'bill_number', 'label' => 'RA Bill'], ['key' => 'wo_number', 'label' => 'Work order'],
                ['key' => 'certified_percent', 'label' => 'Certified %'], ['key' => 'gross_value', 'label' => 'Gross'],
                ['key' => 'retention_amount', 'label' => 'Retention'], ['key' => 'net_payable', 'label' => 'Net payable'],
                ['key' => 'status', 'label' => 'Status'],
            ],
            'rows'    => $rows,
            'summary' => ['Total net payable' => round($total, 2)],
        ];
    }

    /** Render a report definition as CSV text (server-side, for large datasets). */
    public function toCsv(array $report): string
    {
        $out = fopen('php://temp', 'r+');
        $cols = $report['columns'];
        fputcsv($out, array_map(static fn($c) => $c['label'], $cols));
        foreach ($report['rows'] as $row) {
            $line = [];
            foreach ($cols as $c) {
                $line[] = $row[$c['key']] ?? '';
            }
            fputcsv($out, $line);
        }
        rewind($out);
        $csv = stream_get_contents($out);
        fclose($out);
        return "\xEF\xBB\xBF" . $csv; // UTF-8 BOM for Excel
    }
}
