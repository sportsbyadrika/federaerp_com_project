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
    private GenericModel $boq;

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
            'contract_value', 'start_date', 'end_date', 'status', 'progress_percent', 'project_manager_id',
        ], softDelete: true);
        $this->floors = new GenericModel('project_floors', ['tenant_id', 'project_id', 'code', 'label', 'sort_order']);
        $this->boq = new GenericModel('boq_items', ['tenant_id', 'project_id', 'project_floor_id', 'item_code', 'description', 'unit', 'quantity', 'rate', 'amount', 'sort_order']);
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
        $id = $this->projects->create([
            'tenant_id'          => $tenantId,
            'client_id'          => $input['client_id'] ?? null,
            'estimate_id'        => $input['estimate_id'] ?? null,
            'code'               => $input['code'] ?? $this->nextCode($tenantId),
            'name'               => (string)$input['name'],
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

    // ---- Bill of Quantities (BOQ) -----------------------------------------
    public function listBoq(int $tenantId, int $projectId): array
    {
        $rows = Database::instance()->fetchAll(
            'SELECT b.*, f.code AS floor_code, f.label AS floor_label
               FROM boq_items b
               LEFT JOIN project_floors f ON f.id = b.project_floor_id
              WHERE b.tenant_id = :t AND b.project_id = :p
              ORDER BY b.sort_order ASC, b.id ASC',
            [':t' => $tenantId, ':p' => $projectId]
        );
        $total = 0.0;
        foreach ($rows as $r) { $total += (float)$r['amount']; }
        return ['items' => $rows, 'total' => round($total, 2)];
    }

    /**
     * Replace the whole BOQ for a project with the provided items (editable
     * grid save). Each item: {project_floor_id?, item_code, description, unit,
     * quantity, rate}. Amount is computed server-side.
     */
    public function saveBoq(int $tenantId, int $projectId, array $items): array
    {
        $this->projects->findOrFail($projectId, $tenantId);
        // Validate floor ownership up front.
        $validFloorIds = [];
        foreach ($this->floors->forTenant($tenantId, ['project_id' => $projectId]) as $f) {
            $validFloorIds[(int)$f['id']] = true;
        }
        $db = Database::instance();
        $db->beginTransaction();
        try {
            $db->execute('DELETE FROM boq_items WHERE tenant_id = :t AND project_id = :p', [':t' => $tenantId, ':p' => $projectId]);
            $order = 0;
            foreach ($items as $it) {
                $desc = trim((string)($it['description'] ?? ''));
                if ($desc === '') continue;
                $floorId = isset($it['project_floor_id']) && $it['project_floor_id'] !== '' && $it['project_floor_id'] !== null
                    ? (int)$it['project_floor_id'] : null;
                if ($floorId !== null && !isset($validFloorIds[$floorId])) {
                    $floorId = null; // ignore floors that don't belong to this project
                }
                $qty = (float)($it['quantity'] ?? 0);
                $rate = (float)($it['rate'] ?? 0);
                $this->boq->create([
                    'tenant_id' => $tenantId, 'project_id' => $projectId, 'project_floor_id' => $floorId,
                    'item_code' => $it['item_code'] ?? null, 'description' => $desc,
                    'unit' => $it['unit'] ?? null, 'quantity' => $qty, 'rate' => $rate,
                    'amount' => round($qty * $rate, 2), 'sort_order' => $order++,
                ]);
            }
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        return $this->listBoq($tenantId, $projectId);
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
