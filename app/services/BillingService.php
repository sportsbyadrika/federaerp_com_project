<?php
declare(strict_types=1);

namespace App\Services;

use App\Models\GenericModel;
use Core\Database;

/**
 * Customer Billing & Settlement engine.
 *
 * Per-invoice model:
 *   subtotal              = work value (Σ items, or the demand note amount)
 *   tax_amount            = subtotal * tax% /100
 *   gross_amount          = subtotal + tax_amount
 *   retention_amount      = subtotal * retention% /100      (withheld)
 *   mobilization_recovery = subtotal * recovery% /100       (capped at advance balance)
 *   net_payable           = gross_amount - retention_amount - mobilization_recovery
 *
 * Settlement model (project closure) — every figure is stored so the on-screen
 * bill matches this calculation exactly:
 *   total_invoiced     = Σ invoice.gross_amount
 *   retention_withheld = Σ retention.withheld_amount
 *   retention_released = Σ retention.released_amount
 *   retention_balance  = Σ retention.balance_amount        (still held)
 *   advance_recovered  = Σ advance.recovered_amount
 *   advance_balance    = Σ advance.balance_amount          (unrecovered)
 *   total_received     = Σ receipt.amount
 *   sum_net_payable    = total_invoiced - retention_withheld - advance_recovered
 *   outstanding        = sum_net_payable - total_received
 *   net_settlement     = outstanding + retention_balance - advance_balance
 *       (> 0 => client owes contractor; < 0 => contractor owes client)
 *
 * Worked example on seed data (project "Harbor Villa"):
 *   invoice INV-2026-0001: subtotal 125000, tax 5% -> gross 131250,
 *   retention 5% -> 6250, advance recovery 20% -> 25000, net_payable 100000.
 *   total_received 100000. sum_net_payable = 131250 - 6250 - 25000 = 100000.
 *   outstanding = 100000 - 100000 = 0.
 *   retention_balance 6250, advance_balance 25000.
 *   net_settlement = 0 + 6250 - 25000 = -18750  (contractor owes client 18,750).
 */
final class BillingService extends BaseService
{
    private GenericModel $demandNotes;
    private GenericModel $invoices;
    private GenericModel $invoiceItems;
    private GenericModel $receipts;
    private GenericModel $advances;
    private GenericModel $retention;
    private GenericModel $settlements;

    public function __construct()
    {
        $this->demandNotes  = new GenericModel('demand_notes', ['tenant_id','project_id','client_id','reference','milestone_id','amount','note_type','due_date','status','description']);
        $this->invoices     = new GenericModel('invoices', ['tenant_id','project_id','client_id','demand_note_id','invoice_number','invoice_date','due_date','subtotal','tax_percent','tax_amount','gross_amount','retention_percent','retention_amount','mobilization_recovery','net_payable','amount_paid','status','notes'], softDelete: true);
        $this->invoiceItems = new GenericModel('invoice_items', ['tenant_id','invoice_id','description','unit','quantity','rate','amount','sort_order']);
        $this->receipts     = new GenericModel('payment_receipts', ['tenant_id','invoice_id','project_id','client_id','receipt_number','amount','payment_date','method','reference','notes','created_by']);
        $this->advances     = new GenericModel('mobilization_advances', ['tenant_id','project_id','reference','advance_amount','recovery_percent','recovered_amount','balance_amount','status','issued_date']);
        $this->retention    = new GenericModel('retention_money', ['tenant_id','project_id','invoice_id','withheld_amount','released_amount','balance_amount','status','release_due_date','released_date']);
        $this->settlements  = new GenericModel('settlement_bills', ['tenant_id','project_id','reference','total_invoiced','total_received','advance_recovered','advance_balance','retention_withheld','retention_released','retention_balance','net_settlement','status','breakdown_json','generated_by']);
    }

    // ---- Demand notes -----------------------------------------------------
    public function listDemandNotes(int $tenantId, int $projectId): array
    {
        return $this->demandNotes->forTenant($tenantId, ['project_id' => $projectId], ['order_by' => 'id', 'order_dir' => 'DESC']);
    }

    public function createDemandNote(int $tenantId, array $input): array
    {
        $id = $this->demandNotes->create([
            'tenant_id'   => $tenantId,
            'project_id'  => (int)$input['project_id'],
            'client_id'   => $input['client_id'] ?? null,
            'reference'   => $input['reference'] ?? $this->nextRef($tenantId, 'demand_notes', 'DN'),
            'milestone_id'=> $input['milestone_id'] ?? null,
            'amount'      => (float)($input['amount'] ?? 0),
            'note_type'   => $input['note_type'] ?? 'standard',
            'due_date'    => $input['due_date'] ?? null,
            'status'      => 'issued',
            'description' => $input['description'] ?? null,
        ]);
        return $this->demandNotes->findOrFail($id, $tenantId);
    }

    /** Generate an Invoice from a Demand Note, computing all billing fields. */
    public function generateInvoiceFromDemandNote(int $tenantId, int $demandNoteId, ?int $userId, array $opts): array
    {
        $note = $this->demandNotes->findOrFail($demandNoteId, $tenantId);
        if ($note['status'] === 'invoiced') {
            throw ServiceException::conflict('This demand note has already been invoiced');
        }
        $projectId = (int)$note['project_id'];
        $subtotal = round((float)$note['amount'], 2);

        $taxPct = (float)($opts['tax_percent'] ?? 0);
        $retentionPct = (float)($opts['retention_percent'] ?? 0);
        $recoveryPct = (float)($opts['mobilization_recovery_percent'] ?? 0);

        $taxAmount = round($subtotal * $taxPct / 100, 2);
        $gross = round($subtotal + $taxAmount, 2);
        $retentionAmount = round($subtotal * $retentionPct / 100, 2);

        // Recovery is capped at the outstanding advance balance for the project.
        $advanceBalance = (float)$this->advances->db()->fetchColumn(
            'SELECT COALESCE(SUM(balance_amount),0) FROM mobilization_advances WHERE tenant_id=:t AND project_id=:p',
            [':t' => $tenantId, ':p' => $projectId]
        );
        $recovery = round($subtotal * $recoveryPct / 100, 2);
        if ($recovery > $advanceBalance) {
            $recovery = round($advanceBalance, 2);
        }

        $netPayable = round($gross - $retentionAmount - $recovery, 2);

        $db = Database::instance();
        $db->beginTransaction();
        try {
            $invoiceId = $this->invoices->create([
                'tenant_id'             => $tenantId,
                'project_id'            => $projectId,
                'client_id'             => $note['client_id'],
                'demand_note_id'        => $demandNoteId,
                'invoice_number'        => $opts['invoice_number'] ?? $this->nextRef($tenantId, 'invoices', 'INV-' . date('Y'), 'invoice_number'),
                'invoice_date'          => $opts['invoice_date'] ?? date('Y-m-d'),
                'due_date'              => $opts['due_date'] ?? null,
                'subtotal'              => $subtotal,
                'tax_percent'           => $taxPct,
                'tax_amount'            => $taxAmount,
                'gross_amount'          => $gross,
                'retention_percent'     => $retentionPct,
                'retention_amount'      => $retentionAmount,
                'mobilization_recovery' => $recovery,
                'net_payable'           => $netPayable,
                'amount_paid'           => 0,
                'status'                => 'issued',
            ]);
            $this->invoiceItems->create([
                'tenant_id' => $tenantId, 'invoice_id' => $invoiceId,
                'description' => (string)($note['description'] ?? 'Billed works'),
                'unit' => 'lot', 'quantity' => 1, 'rate' => $subtotal, 'amount' => $subtotal, 'sort_order' => 0,
            ]);

            if ($retentionAmount > 0) {
                $this->retention->create([
                    'tenant_id' => $tenantId, 'project_id' => $projectId, 'invoice_id' => $invoiceId,
                    'withheld_amount' => $retentionAmount, 'released_amount' => 0,
                    'balance_amount' => $retentionAmount, 'status' => 'withheld',
                ]);
            }
            if ($recovery > 0) {
                // Apply recovery to the oldest active advance(s).
                $this->applyAdvanceRecovery($tenantId, $projectId, $recovery);
            }

            $this->demandNotes->update($demandNoteId, $tenantId, ['status' => 'invoiced']);
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        return $this->getInvoice($tenantId, $invoiceId);
    }

    public function getInvoice(int $tenantId, int $invoiceId): array
    {
        $inv = $this->invoices->findOrFail($invoiceId, $tenantId);
        $inv['items'] = $this->invoiceItems->forTenant($tenantId, ['invoice_id' => $invoiceId], ['order_by' => 'sort_order', 'order_dir' => 'ASC']);
        return $inv;
    }

    public function listInvoices(int $tenantId, int $projectId): array
    {
        return $this->invoices->forTenant($tenantId, ['project_id' => $projectId], ['order_by' => 'id', 'order_dir' => 'DESC']);
    }

    /** Record a payment receipt against an invoice; update paid amount + status. */
    public function recordReceipt(int $tenantId, ?int $userId, array $input): array
    {
        $invoiceId = isset($input['invoice_id']) ? (int)$input['invoice_id'] : null;
        $projectId = (int)$input['project_id'];
        $amount = round((float)$input['amount'], 2);
        if ($amount <= 0) {
            throw ServiceException::unprocessable('Receipt amount must be positive');
        }

        $db = Database::instance();
        $db->beginTransaction();
        try {
            $receiptId = $this->receipts->create([
                'tenant_id' => $tenantId, 'invoice_id' => $invoiceId, 'project_id' => $projectId,
                'client_id' => $input['client_id'] ?? null,
                'receipt_number' => $input['receipt_number'] ?? $this->nextRef($tenantId, 'payment_receipts', 'RCP', 'receipt_number'),
                'amount' => $amount, 'payment_date' => $input['payment_date'] ?? date('Y-m-d'),
                'method' => $input['method'] ?? 'bank_transfer', 'reference' => $input['reference'] ?? null,
                'notes' => $input['notes'] ?? null, 'created_by' => $userId,
            ]);

            if ($invoiceId !== null) {
                $inv = $this->invoices->findOrFail($invoiceId, $tenantId);
                $paid = round((float)$inv['amount_paid'] + $amount, 2);
                $status = $paid >= (float)$inv['net_payable'] ? 'paid' : 'partially_paid';
                $this->invoices->update($invoiceId, $tenantId, ['amount_paid' => $paid, 'status' => $status]);
            }
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        return $this->receipts->findOrFail($receiptId, $tenantId);
    }

    /** Release (some or all) retention for a project. */
    public function releaseRetention(int $tenantId, int $retentionId, ?float $amount): array
    {
        $ret = $this->retention->findOrFail($retentionId, $tenantId);
        $balance = (float)$ret['balance_amount'];
        $release = $amount === null ? $balance : min($amount, $balance);
        $release = round($release, 2);
        $released = round((float)$ret['released_amount'] + $release, 2);
        $newBalance = round((float)$ret['withheld_amount'] - $released, 2);
        $status = $newBalance <= 0 ? 'released' : 'partially_released';
        $this->retention->update($retentionId, $tenantId, [
            'released_amount' => $released, 'balance_amount' => $newBalance,
            'status' => $status, 'released_date' => date('Y-m-d'),
        ]);
        return $this->retention->findOrFail($retentionId, $tenantId);
    }

    /**
     * Settlement engine: compute the full breakdown for a project. Pure read +
     * derivation; persists a settlement_bill when $finalize is true.
     */
    public function settlement(int $tenantId, int $projectId, ?int $userId = null, bool $finalize = false): array
    {
        $db = Database::instance();
        // Verify the project belongs to the tenant.
        $project = $db->fetch('SELECT id, name, code, contract_value FROM projects WHERE id=:p AND tenant_id=:t AND deleted_at IS NULL', [':p' => $projectId, ':t' => $tenantId]);
        if ($project === null) {
            throw ServiceException::notFound('Project not found');
        }

        $totalInvoiced = (float)$db->fetchColumn('SELECT COALESCE(SUM(gross_amount),0) FROM invoices WHERE tenant_id=:t AND project_id=:p AND deleted_at IS NULL', [':t' => $tenantId, ':p' => $projectId]);
        $totalReceived = (float)$db->fetchColumn('SELECT COALESCE(SUM(amount),0) FROM payment_receipts WHERE tenant_id=:t AND project_id=:p', [':t' => $tenantId, ':p' => $projectId]);

        $retWithheld = (float)$db->fetchColumn('SELECT COALESCE(SUM(withheld_amount),0) FROM retention_money WHERE tenant_id=:t AND project_id=:p', [':t' => $tenantId, ':p' => $projectId]);
        $retReleased = (float)$db->fetchColumn('SELECT COALESCE(SUM(released_amount),0) FROM retention_money WHERE tenant_id=:t AND project_id=:p', [':t' => $tenantId, ':p' => $projectId]);
        $retBalance  = (float)$db->fetchColumn('SELECT COALESCE(SUM(balance_amount),0) FROM retention_money WHERE tenant_id=:t AND project_id=:p', [':t' => $tenantId, ':p' => $projectId]);

        $advRecovered = (float)$db->fetchColumn('SELECT COALESCE(SUM(recovered_amount),0) FROM mobilization_advances WHERE tenant_id=:t AND project_id=:p', [':t' => $tenantId, ':p' => $projectId]);
        $advBalance   = (float)$db->fetchColumn('SELECT COALESCE(SUM(balance_amount),0) FROM mobilization_advances WHERE tenant_id=:t AND project_id=:p', [':t' => $tenantId, ':p' => $projectId]);

        $sumNetPayable = round($totalInvoiced - $retWithheld - $advRecovered, 2);
        $outstanding   = round($sumNetPayable - $totalReceived, 2);
        $netSettlement = round($outstanding + $retBalance - $advBalance, 2);

        $breakdown = [
            'project'            => ['id' => (int)$project['id'], 'name' => $project['name'], 'code' => $project['code'], 'contract_value' => (float)$project['contract_value']],
            'total_invoiced'     => round($totalInvoiced, 2),
            'total_received'     => round($totalReceived, 2),
            'retention_withheld' => round($retWithheld, 2),
            'retention_released' => round($retReleased, 2),
            'retention_balance'  => round($retBalance, 2),
            'advance_recovered'  => round($advRecovered, 2),
            'advance_balance'    => round($advBalance, 2),
            'sum_net_payable'    => $sumNetPayable,
            'outstanding'        => $outstanding,
            'net_settlement'     => $netSettlement,
            'net_settlement_note'=> $netSettlement >= 0 ? 'Amount due to contractor' : 'Amount due from contractor to client',
            'invoices'           => $this->invoices->forTenant($tenantId, ['project_id' => $projectId], ['order_by' => 'id', 'order_dir' => 'ASC']),
            'receipts'           => $this->receipts->forTenant($tenantId, ['project_id' => $projectId], ['order_by' => 'id', 'order_dir' => 'ASC']),
        ];

        if ($finalize) {
            $this->settlements->create([
                'tenant_id' => $tenantId, 'project_id' => $projectId,
                'reference' => $this->nextRef($tenantId, 'settlement_bills', 'STL'),
                'total_invoiced' => $breakdown['total_invoiced'], 'total_received' => $breakdown['total_received'],
                'advance_recovered' => $breakdown['advance_recovered'], 'advance_balance' => $breakdown['advance_balance'],
                'retention_withheld' => $breakdown['retention_withheld'], 'retention_released' => $breakdown['retention_released'],
                'retention_balance' => $breakdown['retention_balance'], 'net_settlement' => $netSettlement,
                'status' => 'finalized', 'breakdown_json' => json_encode($breakdown), 'generated_by' => $userId,
            ]);
            $breakdown['finalized'] = true;
        }
        return $breakdown;
    }

    // ---- helpers ----------------------------------------------------------
    private function applyAdvanceRecovery(int $tenantId, int $projectId, float $amount): void
    {
        $db = Database::instance();
        $advances = $db->fetchAll(
            'SELECT id, balance_amount FROM mobilization_advances WHERE tenant_id=:t AND project_id=:p AND status=:s AND balance_amount > 0 ORDER BY id ASC',
            [':t' => $tenantId, ':p' => $projectId, ':s' => 'active']
        );
        $remaining = $amount;
        foreach ($advances as $adv) {
            if ($remaining <= 0) break;
            $take = min($remaining, (float)$adv['balance_amount']);
            $newRecovered = null;
            $db->execute(
                'UPDATE mobilization_advances
                    SET recovered_amount = recovered_amount + :take,
                        balance_amount   = advance_amount - recovered_amount,
                        status = CASE WHEN advance_amount - recovered_amount <= 0 THEN \'recovered\' ELSE \'active\' END
                  WHERE id = :id AND tenant_id = :t',
                [':take' => $take, ':id' => (int)$adv['id'], ':t' => $tenantId]
            );
            $remaining -= $take;
        }
    }

    private function nextRef(int $tenantId, string $table, string $prefix, string $column = 'reference'): string
    {
        $count = (int)Database::instance()->fetchColumn(
            "SELECT COUNT(*) FROM `{$table}` WHERE tenant_id = :t",
            [':t' => $tenantId]
        );
        return sprintf('%s-%04d', $prefix, $count + 1);
    }
}
