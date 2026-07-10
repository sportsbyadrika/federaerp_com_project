<?php
declare(strict_types=1);

namespace App\Services;

use App\Models\GenericModel;
use Core\Database;

/**
 * Projects, kanban columns (task_statuses), and milestones.
 */
final class ProjectService extends BaseService
{
    private GenericModel $projects;
    private GenericModel $statuses;
    private GenericModel $milestones;
    private GenericModel $progress;
    private GenericModel $checklists;
    private GenericModel $checklistItems;
    private GenericModel $floors;
    private GenericModel $boqEntries;
    private GenericModel $boqLines;
    private GenericModel $stages;

    public function __construct()
    {
        $this->progress = new GenericModel('work_progress_logs', [
            'tenant_id', 'project_id', 'task_id', 'logged_by', 'log_date',
            'progress_percent', 'notes', 'weather', 'labour_count',
        ]);
        $this->checklists = new GenericModel('daily_site_checklists', [
            'tenant_id', 'project_id', 'checklist_date', 'supervisor_id', 'notes', 'status',
        ]);
        $this->checklistItems = new GenericModel('checklist_items', [
            'tenant_id', 'checklist_id', 'label', 'is_checked', 'remark', 'sort_order',
        ]);
        $this->projects = new GenericModel('projects', [
            'tenant_id', 'client_id', 'estimate_id', 'code', 'name', 'project_type', 'description', 'site_address',
            'contract_value', 'currency_code', 'currency_symbol', 'start_date', 'end_date', 'status', 'progress_percent', 'project_manager_id',
        ], softDelete: true);
        $this->stages = new GenericModel('construction_stages', ['tenant_id', 'project_id', 'phase_no', 'details', 'percentage', 'amount', 'sort_order']);
        $this->floors = new GenericModel('project_floors', ['tenant_id', 'project_id', 'code', 'label', 'sort_order']);
        $this->boqEntries = new GenericModel('boq_entries', ['tenant_id', 'project_id', 'boq_item_master_id', 'item_code', 'item_head', 'description', 'unit', 'sort_order']);
        $this->boqLines = new GenericModel('boq_lines', ['tenant_id', 'boq_entry_id', 'project_floor_id', 'quantity', 'rate', 'amount', 'sort_order']);
        $this->statuses = new GenericModel('task_statuses', [
            'tenant_id', 'project_id', 'name', 'color', 'position', 'is_done',
        ]);
        $this->milestones = new GenericModel('milestones', [
            'tenant_id', 'project_id', 'name', 'description', 'due_date', 'percent_weight',
            'certified_percent', 'status', 'sort_order',
        ], softDelete: true);
    }

    // ---- Projects ---------------------------------------------------------
    public function listProjects(int $tenantId): array
    {
        return $this->projects->forTenant($tenantId, [], ['order_by' => 'created_at', 'order_dir' => 'DESC']);
    }

    public function getProject(int $tenantId, int $id): array
    {
        return $this->projects->findOrFail($id, $tenantId);
    }

    public function createProject(int $tenantId, array $input): array
    {
        // Default the project currency to the organisation's default.
        $org = Database::instance()->fetch('SELECT currency, currency_symbol FROM organisations WHERE id = :t', [':t' => $tenantId]);
        $id = $this->projects->create([
            'tenant_id'          => $tenantId,
            'client_id'          => $input['client_id'] ?? null,
            'estimate_id'        => $input['estimate_id'] ?? null,
            'code'               => $input['code'] ?? $this->nextCode($tenantId),
            'name'               => (string)$input['name'],
            'currency_code'      => $input['currency_code'] ?? ($org['currency'] ?? 'USD'),
            'currency_symbol'    => $input['currency_symbol'] ?? ($org['currency_symbol'] ?? '$'),
            'project_type'       => in_array(($input['project_type'] ?? 'new'), ['new', 'renovation'], true) ? $input['project_type'] : 'new',
            'description'        => $input['description'] ?? null,
            'site_address'       => $input['site_address'] ?? null,
            'contract_value'     => $input['contract_value'] ?? 0,
            'start_date'         => $input['start_date'] ?? null,
            'end_date'           => $input['end_date'] ?? null,
            'status'             => $input['status'] ?? 'planning',
            'project_manager_id' => $input['project_manager_id'] ?? null,
        ]);
        $this->seedDefaultBoard($tenantId, $id);
        return $this->projects->findOrFail($id, $tenantId);
    }

    public function updateProject(int $tenantId, int $id, array $input): array
    {
        $this->projects->findOrFail($id, $tenantId);
        $this->projects->update($id, $tenantId, $input);
        return $this->projects->findOrFail($id, $tenantId);
    }

    public function deleteProject(int $tenantId, int $id): void
    {
        $this->projects->findOrFail($id, $tenantId);
        $this->projects->delete($id, $tenantId);
    }

    // ---- Kanban columns (statuses) ----------------------------------------
    public function listStatuses(int $tenantId, int $projectId): array
    {
        return $this->statuses->db()->fetchAll(
            'SELECT * FROM task_statuses WHERE tenant_id = :t AND (project_id = :p OR project_id IS NULL) ORDER BY position ASC',
            [':t' => $tenantId, ':p' => $projectId]
        );
    }

    public function createStatus(int $tenantId, array $input): array
    {
        $id = $this->statuses->create([
            'tenant_id'  => $tenantId,
            'project_id' => $input['project_id'] ?? null,
            'name'       => (string)$input['name'],
            'color'      => $input['color'] ?? '#94a3b8',
            'position'   => (int)($input['position'] ?? 0),
            'is_done'    => !empty($input['is_done']) ? 1 : 0,
        ]);
        return $this->statuses->findOrFail($id, $tenantId);
    }

    // ---- Milestones -------------------------------------------------------
    public function listMilestones(int $tenantId, int $projectId): array
    {
        return $this->milestones->forTenant($tenantId, ['project_id' => $projectId], ['order_by' => 'sort_order', 'order_dir' => 'ASC']);
    }

    public function createMilestone(int $tenantId, array $input): array
    {
        $id = $this->milestones->create([
            'tenant_id'         => $tenantId,
            'project_id'        => (int)$input['project_id'],
            'name'              => (string)$input['name'],
            'description'       => $input['description'] ?? null,
            'due_date'          => $input['due_date'] ?? null,
            'percent_weight'    => $input['percent_weight'] ?? 0,
            'certified_percent' => $input['certified_percent'] ?? 0,
            'status'            => $input['status'] ?? 'pending',
            'sort_order'        => $input['sort_order'] ?? 0,
        ]);
        return $this->milestones->findOrFail($id, $tenantId);
    }

    /** Certify a milestone's completion % (drives sub-contractor RA billing). */
    public function certifyMilestone(int $tenantId, int $milestoneId, float $percent): array
    {
        $this->milestones->findOrFail($milestoneId, $tenantId);
        $percent = max(0.0, min(100.0, $percent));
        $status = $percent >= 100 ? 'certified' : ($percent > 0 ? 'in_progress' : 'pending');
        $this->milestones->update($milestoneId, $tenantId, [
            'certified_percent' => $percent,
            'status'            => $status,
        ]);
        return $this->milestones->findOrFail($milestoneId, $tenantId);
    }

    // ---- Floors ------------------------------------------------------------
    public function listFloors(int $tenantId, int $projectId): array
    {
        return $this->floors->forTenant($tenantId, ['project_id' => $projectId], ['order_by' => 'sort_order', 'order_dir' => 'ASC']);
    }

    /**
     * Sync a project's floors to the given set (add new, remove missing), by
     * `code`. Kept floors retain their BOQ associations.
     * @param array $floors list of {code,label,sort_order}
     */
    public function setFloors(int $tenantId, int $projectId, array $floors): array
    {
        $this->projects->findOrFail($projectId, $tenantId);
        $db = Database::instance();
        $db->beginTransaction();
        try {
            $existing = [];
            foreach ($this->floors->forTenant($tenantId, ['project_id' => $projectId]) as $f) {
                $existing[$f['code']] = (int)$f['id'];
            }
            $desired = [];
            foreach ($floors as $f) {
                $code = trim((string)($f['code'] ?? ''));
                if ($code === '') continue;
                $desired[$code] = [
                    'label'      => (string)($f['label'] ?? $code),
                    'sort_order' => (int)($f['sort_order'] ?? 0),
                ];
            }
            // Insert new
            foreach ($desired as $code => $d) {
                if (!isset($existing[$code])) {
                    $this->floors->create([
                        'tenant_id' => $tenantId, 'project_id' => $projectId,
                        'code' => $code, 'label' => $d['label'], 'sort_order' => $d['sort_order'],
                    ]);
                } else {
                    $this->floors->update($existing[$code], $tenantId, ['label' => $d['label'], 'sort_order' => $d['sort_order']]);
                }
            }
            // Delete removed
            foreach ($existing as $code => $id) {
                if (!isset($desired[$code])) {
                    $this->floors->delete($id, $tenantId);
                }
            }
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        return $this->listFloors($tenantId, $projectId);
    }

    // ---- Bill of Quantities (BOQ): entry + per-floor lines ----------------
    public function listBoq(int $tenantId, int $projectId): array
    {
        $entries = $this->boqEntries->forTenant($tenantId, ['project_id' => $projectId], ['order_by' => 'sort_order', 'order_dir' => 'ASC']);
        $total = 0.0;
        foreach ($entries as &$e) {
            $e['lines'] = $this->entryLines($tenantId, (int)$e['id']);
            $et = 0.0;
            foreach ($e['lines'] as $l) { $et += (float)$l['amount']; }
            $e['entry_total'] = round($et, 2);
            $total += $et;
        }
        unset($e);
        return ['entries' => $entries, 'total' => round($total, 2)];
    }

    /** Create one BOQ entry (item) with its per-floor lines. */
    public function saveBoqEntry(int $tenantId, int $projectId, array $input): array
    {
        $this->projects->findOrFail($projectId, $tenantId);
        $db = Database::instance();
        $db->beginTransaction();
        try {
            $order = (int)$db->fetchColumn('SELECT COALESCE(MAX(sort_order),-1)+1 FROM boq_entries WHERE tenant_id=? AND project_id=?', [$tenantId, $projectId]);
            $entryId = $this->boqEntries->create([
                'tenant_id' => $tenantId, 'project_id' => $projectId,
                'boq_item_master_id' => $input['boq_item_master_id'] ?? null,
                'item_code' => $input['item_code'] ?? null, 'item_head' => (string)($input['item_head'] ?? 'Item'),
                'description' => $input['description'] ?? null, 'unit' => $input['unit'] ?? null, 'sort_order' => $order,
            ]);
            $this->replaceLines($tenantId, $projectId, $entryId, $input['lines'] ?? []);
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        return $this->getBoqEntry($tenantId, $entryId);
    }

    /** Update a BOQ entry + replace its lines. */
    public function updateBoqEntry(int $tenantId, int $entryId, array $input): array
    {
        $entry = $this->boqEntries->findOrFail($entryId, $tenantId);
        $this->boqEntries->update($entryId, $tenantId, [
            'boq_item_master_id' => $input['boq_item_master_id'] ?? $entry['boq_item_master_id'],
            'item_code'   => $input['item_code'] ?? $entry['item_code'],
            'item_head'   => $input['item_head'] ?? $entry['item_head'],
            'description' => $input['description'] ?? $entry['description'],
            'unit'        => $input['unit'] ?? $entry['unit'],
        ]);
        if (array_key_exists('lines', $input)) {
            $this->replaceLines($tenantId, (int)$entry['project_id'], $entryId, $input['lines']);
        }
        return $this->getBoqEntry($tenantId, $entryId);
    }

    public function deleteBoqEntry(int $tenantId, int $entryId): void
    {
        $this->boqEntries->findOrFail($entryId, $tenantId);
        $this->boqEntries->delete($entryId, $tenantId); // cascade removes lines
    }

    private function getBoqEntry(int $tenantId, int $entryId): array
    {
        $e = $this->boqEntries->findOrFail($entryId, $tenantId);
        $e['lines'] = $this->entryLines($tenantId, $entryId);
        $e['entry_total'] = round(array_sum(array_map(static fn($l) => (float)$l['amount'], $e['lines'])), 2);
        return $e;
    }

    private function entryLines(int $tenantId, int $entryId): array
    {
        return Database::instance()->fetchAll(
            'SELECT l.*, f.code AS floor_code, f.label AS floor_label
               FROM boq_lines l LEFT JOIN project_floors f ON f.id = l.project_floor_id
              WHERE l.tenant_id = :t AND l.boq_entry_id = :e ORDER BY l.sort_order ASC, l.id ASC',
            [':t' => $tenantId, ':e' => $entryId]
        );
    }

    private function replaceLines(int $tenantId, int $projectId, int $entryId, array $lines): void
    {
        $db = Database::instance();
        $db->execute('DELETE FROM boq_lines WHERE tenant_id = ? AND boq_entry_id = ?', [$tenantId, $entryId]);
        $valid = [];
        foreach ($this->floors->forTenant($tenantId, ['project_id' => $projectId]) as $f) {
            $valid[(int)$f['id']] = true;
        }
        $ord = 0;
        foreach ($lines as $l) {
            $fid = isset($l['project_floor_id']) && $l['project_floor_id'] !== '' && $l['project_floor_id'] !== null ? (int)$l['project_floor_id'] : null;
            if ($fid !== null && !isset($valid[$fid])) { $fid = null; }
            $qty = (float)($l['quantity'] ?? 0);
            $rate = (float)($l['rate'] ?? 0);
            if ($qty == 0.0 && $rate == 0.0) { continue; }
            $this->boqLines->create([
                'tenant_id' => $tenantId, 'boq_entry_id' => $entryId, 'project_floor_id' => $fid,
                'quantity' => $qty, 'rate' => $rate, 'amount' => round($qty * $rate, 2), 'sort_order' => $ord++,
            ]);
        }
    }

    // ---- Construction stages ----------------------------------------------
    public function listStages(int $tenantId, int $projectId): array
    {
        $project = $this->projects->findOrFail($projectId, $tenantId);
        $rows = $this->stages->forTenant($tenantId, ['project_id' => $projectId], ['order_by' => 'sort_order', 'order_dir' => 'ASC']);
        $grand = 0.0;
        foreach ($rows as $r) { $grand += (float)$r['amount']; }
        $contract = (float)$project['contract_value'];
        return [
            'stages'         => $rows,
            'grand_total'    => round($grand, 2),
            'contract_value' => round($contract, 2),
            'difference'     => round($contract - $grand, 2),
        ];
    }

    /** Create a single construction stage. */
    public function createStage(int $tenantId, int $projectId, array $s): array
    {
        $this->projects->findOrFail($projectId, $tenantId);
        $order = (int)Database::instance()->fetchColumn('SELECT COALESCE(MAX(sort_order),-1)+1 FROM construction_stages WHERE tenant_id=? AND project_id=?', [$tenantId, $projectId]);
        $this->stages->create([
            'tenant_id' => $tenantId, 'project_id' => $projectId,
            'phase_no' => (int)($s['phase_no'] ?? ($order + 1)),
            'details' => trim((string)($s['details'] ?? '')),
            'percentage' => (float)($s['percentage'] ?? 0),
            'amount' => round((float)($s['amount'] ?? 0), 2), 'sort_order' => $order,
        ]);
        return $this->listStages($tenantId, $projectId);
    }

    public function updateStage(int $tenantId, int $stageId, array $s): array
    {
        $row = $this->stages->findOrFail($stageId, $tenantId);
        $this->stages->update($stageId, $tenantId, [
            'phase_no' => (int)($s['phase_no'] ?? $row['phase_no']),
            'details' => array_key_exists('details', $s) ? trim((string)$s['details']) : $row['details'],
            'percentage' => (float)($s['percentage'] ?? $row['percentage']),
            'amount' => round((float)($s['amount'] ?? $row['amount']), 2),
        ]);
        return $this->listStages($tenantId, (int)$row['project_id']);
    }

    public function deleteStage(int $tenantId, int $stageId): array
    {
        $row = $this->stages->findOrFail($stageId, $tenantId);
        $this->stages->delete($stageId, $tenantId);
        return $this->listStages($tenantId, (int)$row['project_id']);
    }

    /** Flat task list for a project (used by expenditure dropdowns). */
    public function projectTasks(int $tenantId, int $projectId): array
    {
        return Database::instance()->fetchAll(
            'SELECT id, title FROM tasks WHERE tenant_id=:t AND project_id=:p AND deleted_at IS NULL ORDER BY sort_order, id',
            [':t' => $tenantId, ':p' => $projectId]
        );
    }

    // ---- Work progress logs ----------------------------------------------
    public function listProgress(int $tenantId, int $projectId): array
    {
        return $this->progress->forTenant($tenantId, ['project_id' => $projectId], ['order_by' => 'log_date', 'order_dir' => 'DESC']);
    }

    public function logProgress(int $tenantId, ?int $userId, array $input): array
    {
        $id = $this->progress->create([
            'tenant_id'        => $tenantId,
            'project_id'       => (int)$input['project_id'],
            'task_id'          => $input['task_id'] ?? null,
            'logged_by'        => $userId,
            'log_date'         => $input['log_date'] ?? date('Y-m-d'),
            'progress_percent' => $input['progress_percent'] ?? null,
            'notes'            => $input['notes'] ?? null,
            'weather'          => $input['weather'] ?? null,
            'labour_count'     => $input['labour_count'] ?? null,
        ]);
        // Keep the project's headline progress in sync when provided.
        if (isset($input['progress_percent'])) {
            $this->projects->update((int)$input['project_id'], $tenantId, ['progress_percent' => (float)$input['progress_percent']]);
        }
        return $this->progress->findOrFail($id, $tenantId);
    }

    // ---- Daily site checklists (supervisors) ------------------------------
    public function listChecklists(int $tenantId, int $projectId): array
    {
        $rows = $this->checklists->forTenant($tenantId, ['project_id' => $projectId], ['order_by' => 'checklist_date', 'order_dir' => 'DESC']);
        foreach ($rows as &$c) {
            $c['items'] = $this->checklistItems->forTenant($tenantId, ['checklist_id' => (int)$c['id']], ['order_by' => 'sort_order', 'order_dir' => 'ASC']);
        }
        return $rows;
    }

    public function saveChecklist(int $tenantId, ?int $userId, array $input): array
    {
        $db = Database::instance();
        $db->beginTransaction();
        try {
            $checklistId = $this->checklists->create([
                'tenant_id'      => $tenantId,
                'project_id'     => (int)$input['project_id'],
                'checklist_date' => $input['checklist_date'] ?? date('Y-m-d'),
                'supervisor_id'  => $userId,
                'notes'          => $input['notes'] ?? null,
                'status'         => $input['status'] ?? 'submitted',
            ]);
            $order = 0;
            foreach (($input['items'] ?? []) as $item) {
                $this->checklistItems->create([
                    'tenant_id'    => $tenantId,
                    'checklist_id' => $checklistId,
                    'label'        => (string)($item['label'] ?? 'Item'),
                    'is_checked'   => !empty($item['is_checked']) ? 1 : 0,
                    'remark'       => $item['remark'] ?? null,
                    'sort_order'   => $order++,
                ]);
            }
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        $row = $this->checklists->findOrFail($checklistId, $tenantId);
        $row['items'] = $this->checklistItems->forTenant($tenantId, ['checklist_id' => $checklistId], ['order_by' => 'sort_order', 'order_dir' => 'ASC']);
        return $row;
    }

    // ---- helpers ----------------------------------------------------------
    private function seedDefaultBoard(int $tenantId, int $projectId): void
    {
        $cols = [
            ['To Do', '#94a3b8', 0, 0],
            ['In Progress', '#3b82f6', 1, 0],
            ['Review', '#f59e0b', 2, 0],
            ['Done', '#22c55e', 3, 1],
        ];
        foreach ($cols as [$name, $color, $pos, $done]) {
            $this->statuses->create([
                'tenant_id' => $tenantId, 'project_id' => $projectId,
                'name' => $name, 'color' => $color, 'position' => $pos, 'is_done' => $done,
            ]);
        }
    }

    private function nextCode(int $tenantId): string
    {
        $count = $this->projects->countForTenant($tenantId);
        return sprintf('PRJ-%04d', $count + 1);
    }
}
