<?php
declare(strict_types=1);

namespace App\Services;

use App\Models\GenericModel;
use Core\Database;

/**
 * Monthly staff salary slips: each slip has any number of Earnings and
 * Deductions lines. Gross salary = sum of earnings; net = gross − deductions.
 */
final class SalarySlipService extends BaseService
{
    private GenericModel $slips;
    private GenericModel $lines;

    public function __construct()
    {
        $this->slips = new GenericModel('salary_slips', [
            'tenant_id', 'staff_id', 'period', 'earnings_total', 'deductions_total', 'net_salary', 'notes', 'created_by',
        ]);
        $this->lines = new GenericModel('salary_slip_lines', [
            'tenant_id', 'slip_id', 'line_type', 'label', 'amount', 'sort_order',
        ]);
    }

    /** List a staff member's slips (summary only). */
    public function listForStaff(int $tenantId, int $staffId): array
    {
        return Database::instance()->fetchAll(
            'SELECT * FROM salary_slips WHERE tenant_id = :t AND staff_id = :s ORDER BY period DESC, id DESC',
            [':t' => $tenantId, ':s' => $staffId]
        );
    }

    /** A single slip with its lines + staff/institution details (for printing). */
    public function get(int $tenantId, int $id): array
    {
        $slip = Database::instance()->fetch(
            'SELECT ss.*, st.name AS staff_name, st.staff_code, st.staff_type, st.pan AS staff_pan
               FROM salary_slips ss
               JOIN staff_members st ON st.id = ss.staff_id
              WHERE ss.id = :id AND ss.tenant_id = :t',
            [':id' => $id, ':t' => $tenantId]
        );
        if ($slip === null) {
            throw ServiceException::notFound('Salary slip not found');
        }
        $slip['lines'] = Database::instance()->fetchAll(
            'SELECT * FROM salary_slip_lines WHERE slip_id = :s ORDER BY line_type, sort_order, id',
            [':s' => $id]
        );
        $slip['gross_salary'] = $slip['earnings_total'];
        return $slip;
    }

    public function create(int $tenantId, ?int $userId, array $in): array
    {
        $staffId = (int)($in['staff_id'] ?? 0);
        $this->assertStaff($tenantId, $staffId);
        $lines = $this->normaliseLines($in['lines'] ?? []);
        $earnings = 0.0; $deductions = 0.0;
        foreach ($lines as $l) {
            if ($l['line_type'] === 'earning') { $earnings += $l['amount']; } else { $deductions += $l['amount']; }
        }

        $db = Database::instance();
        $db->beginTransaction();
        try {
            $id = $this->slips->create([
                'tenant_id'        => $tenantId,
                'staff_id'         => $staffId,
                'period'           => trim((string)($in['period'] ?? date('Y-m'))),
                'earnings_total'   => round($earnings, 2),
                'deductions_total' => round($deductions, 2),
                'net_salary'       => round($earnings - $deductions, 2),
                'notes'            => $in['notes'] ?? null,
                'created_by'       => $userId,
            ]);
            $order = 0;
            foreach ($lines as $l) {
                $this->lines->create([
                    'tenant_id' => $tenantId, 'slip_id' => $id,
                    'line_type' => $l['line_type'], 'label' => $l['label'], 'amount' => $l['amount'], 'sort_order' => $order++,
                ]);
            }
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        return $this->get($tenantId, $id);
    }

    public function delete(int $tenantId, int $id): void
    {
        $this->slips->findOrFail($id, $tenantId);
        $this->slips->delete($id, $tenantId); // cascade removes lines
    }

    /** @return array<int,array{line_type:string,label:string,amount:float}> */
    private function normaliseLines(array $raw): array
    {
        $out = [];
        foreach ($raw as $l) {
            $type = ($l['line_type'] ?? 'earning') === 'deduction' ? 'deduction' : 'earning';
            $label = trim((string)($l['label'] ?? ''));
            $amount = round((float)($l['amount'] ?? 0), 2);
            if ($label === '' || $amount <= 0) { continue; }
            $out[] = ['line_type' => $type, 'label' => $label, 'amount' => $amount];
        }
        if (!$out) { throw ServiceException::unprocessable('Add at least one earning or deduction line'); }
        return $out;
    }

    private function assertStaff(int $tenantId, int $staffId): void
    {
        $ok = Database::instance()->fetchColumn(
            'SELECT 1 FROM staff_members WHERE id = :s AND tenant_id = :t AND deleted_at IS NULL',
            [':s' => $staffId, ':t' => $tenantId]
        );
        if (!$ok) { throw ServiceException::unprocessable('Unknown staff member'); }
    }
}
