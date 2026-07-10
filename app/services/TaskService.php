<?php
declare(strict_types=1);

namespace App\Services;

use App\Models\GenericModel;
use Core\Database;

/**
 * Tasks + the kanban board. The move() operation persists status_id + sort_order
 * so drag-and-drop survives reloads, re-sequencing both affected columns so
 * positions stay dense integers (0,1,2,...).
 */
final class TaskService extends BaseService
{
    private GenericModel $tasks;
    private GenericModel $taskMaterials;
    private GenericModel $taskLabour;

    public function __construct()
    {
        $this->tasks = new GenericModel('tasks', [
            'tenant_id', 'project_id', 'status_id', 'milestone_id', 'title', 'description',
            'assignee_id', 'priority', 'due_date', 'sort_order', 'completed_at',
            'source', 'boq_entry_id', 'project_floor_id', 'item_code', 'item_head', 'item_description', 'percentage',
        ], softDelete: true);
        $this->taskMaterials = new GenericModel('task_materials', [
            'tenant_id', 'task_id', 'material_id', 'item_name', 'unit', 'quantity', 'used_date', 'notes', 'created_by',
        ]);
        $this->taskLabour = new GenericModel('task_labour', [
            'tenant_id', 'task_id', 'employee_id', 'worker_name', 'trade', 'headcount', 'hours', 'work_date', 'notes', 'created_by',
        ]);
    }

    /** Full board: columns with their ordered task cards (floor info + resource counts). */
    public function board(int $tenantId, int $projectId): array
    {
        $db = Database::instance();
        $statuses = $db->fetchAll(
            'SELECT * FROM task_statuses WHERE tenant_id = :t AND (project_id = :p OR project_id IS NULL) ORDER BY position ASC',
            [':t' => $tenantId, ':p' => $projectId]
        );
        $tasks = $db->fetchAll(
            'SELECT tk.*, u.name AS assignee_name, m.name AS milestone_name,
                    f.label AS floor_label, f.code AS floor_code, f.sort_order AS floor_sort,
                    (SELECT COUNT(*) FROM task_materials tm WHERE tm.task_id = tk.id) AS materials_count,
                    (SELECT COUNT(*) FROM task_labour tl WHERE tl.task_id = tk.id) AS labour_count
               FROM tasks tk
               LEFT JOIN users u ON u.id = tk.assignee_id
               LEFT JOIN milestones m ON m.id = tk.milestone_id
               LEFT JOIN project_floors f ON f.id = tk.project_floor_id
              WHERE tk.tenant_id = :t AND tk.project_id = :p AND tk.deleted_at IS NULL
              ORDER BY tk.status_id, tk.sort_order ASC',
            [':t' => $tenantId, ':p' => $projectId]
        );
        $byStatus = [];
        foreach ($tasks as $task) {
            $byStatus[(int)$task['status_id']][] = $task;
        }
        foreach ($statuses as &$col) {
            $col['tasks'] = $byStatus[(int)$col['id']] ?? [];
        }
        unset($col);

        // Floor swimlanes for the board (plus a virtual "unassigned" lane).
        $floors = $db->fetchAll(
            'SELECT id, code, label, sort_order FROM project_floors WHERE tenant_id = :t AND project_id = :p ORDER BY sort_order ASC',
            [':t' => $tenantId, ':p' => $projectId]
        );
        return ['columns' => $statuses, 'floors' => $floors, 'project_id' => $projectId];
    }

    /** BOQ entries (with their floors) offered when creating a "from BOQ" task. */
    public function boqOptions(int $tenantId, int $projectId): array
    {
        return Database::instance()->fetchAll(
            'SELECT e.id, e.item_code, e.item_head, e.description, e.unit,
                    (SELECT MIN(l.project_floor_id) FROM boq_lines l WHERE l.boq_entry_id = e.id) AS project_floor_id
               FROM boq_entries e
              WHERE e.tenant_id = :t AND e.project_id = :p
              ORDER BY e.sort_order ASC, e.id ASC',
            [':t' => $tenantId, ':p' => $projectId]
        );
    }

    public function create(int $tenantId, array $input): array
    {
        $projectId = (int)$input['project_id'];
        $statusId = (int)$input['status_id'];
        $this->assertStatusBelongs($tenantId, $projectId, $statusId);

        // New task goes to the end of its column.
        $maxOrder = (int)$this->tasks->db()->fetchColumn(
            'SELECT COALESCE(MAX(sort_order), -1) FROM tasks WHERE tenant_id = :t AND project_id = :p AND status_id = :s AND deleted_at IS NULL',
            [':t' => $tenantId, ':p' => $projectId, ':s' => $statusId]
        );
        $id = $this->tasks->create([
            'tenant_id'        => $tenantId,
            'project_id'       => $projectId,
            'status_id'        => $statusId,
            'source'           => ($input['source'] ?? 'direct') === 'boq' ? 'boq' : 'direct',
            'boq_entry_id'     => $input['boq_entry_id'] ?? null,
            'project_floor_id' => $input['project_floor_id'] ?? null,
            'milestone_id'     => $input['milestone_id'] ?? null,
            'title'            => $this->deriveTitle($input),
            'item_code'        => $input['item_code'] ?? null,
            'item_head'        => $input['item_head'] ?? null,
            'item_description' => $input['item_description'] ?? null,
            'percentage'       => round((float)($input['percentage'] ?? 0), 3),
            'description'      => $input['description'] ?? null,
            'assignee_id'      => $input['assignee_id'] ?? null,
            'priority'         => $input['priority'] ?? 'medium',
            'due_date'         => $input['due_date'] ?? null,
            'sort_order'       => $maxOrder + 1,
        ]);
        return $this->tasks->findOrFail($id, $tenantId);
    }

    public function update(int $tenantId, int $id, array $input): array
    {
        $this->tasks->findOrFail($id, $tenantId);
        // Prevent moving via update(); use move() for column changes.
        unset($input['status_id'], $input['sort_order'], $input['tenant_id'], $input['project_id']);
        if (isset($input['source'])) {
            $input['source'] = $input['source'] === 'boq' ? 'boq' : 'direct';
        }
        if (array_key_exists('percentage', $input)) {
            $input['percentage'] = round((float)$input['percentage'], 3);
        }
        if (array_key_exists('item_head', $input) && (!isset($input['title']) || $input['title'] === '')) {
            $input['title'] = $this->deriveTitle($input);
        }
        $this->tasks->update($id, $tenantId, $input);
        return $this->tasks->findOrFail($id, $tenantId);
    }

    /** Title shown on the card: explicit title, else item head, else a fallback. */
    private function deriveTitle(array $input): string
    {
        $t = trim((string)($input['title'] ?? ''));
        if ($t !== '') return $t;
        $h = trim((string)($input['item_head'] ?? ''));
        return $h !== '' ? $h : 'Task';
    }

    public function delete(int $tenantId, int $id): void
    {
        $this->tasks->findOrFail($id, $tenantId);
        $this->tasks->delete($id, $tenantId);
    }

    /**
     * PATCH /api/tasks/{id}/move — move a card to $statusId at position $position.
     * Re-sequences source + destination columns in a transaction.
     */
    public function move(int $tenantId, int $taskId, int $statusId, int $position): array
    {
        $task = $this->tasks->findOrFail($taskId, $tenantId);
        $projectId = (int)$task['project_id'];
        $this->assertStatusBelongs($tenantId, $projectId, $statusId);

        $db = Database::instance();
        $db->beginTransaction();
        try {
            $sourceStatusId = (int)$task['status_id'];

            // Destination column's current tasks (excluding the moved one), ordered.
            $destTasks = $db->fetchAll(
                'SELECT id FROM tasks
                  WHERE tenant_id = :t AND project_id = :p AND status_id = :s AND id <> :id AND deleted_at IS NULL
                  ORDER BY sort_order ASC, id ASC',
                [':t' => $tenantId, ':p' => $projectId, ':s' => $statusId, ':id' => $taskId]
            );
            $destIds = array_map(static fn($r) => (int)$r['id'], $destTasks);

            $position = max(0, min($position, count($destIds)));
            array_splice($destIds, $position, 0, [$taskId]);

            // Move the task + renumber destination column densely.
            $this->tasks->update($taskId, $tenantId, ['status_id' => $statusId]);
            $this->renumber($tenantId, $destIds);

            // Renumber the source column too (unless same column).
            if ($sourceStatusId !== $statusId) {
                $sourceTasks = $db->fetchAll(
                    'SELECT id FROM tasks
                      WHERE tenant_id = :t AND project_id = :p AND status_id = :s AND deleted_at IS NULL
                      ORDER BY sort_order ASC, id ASC',
                    [':t' => $tenantId, ':p' => $projectId, ':s' => $sourceStatusId]
                );
                $this->renumber($tenantId, array_map(static fn($r) => (int)$r['id'], $sourceTasks));
            }

            // Mark completed_at when dropped into a "done" column.
            $isDone = (int)$db->fetchColumn('SELECT is_done FROM task_statuses WHERE id = :s', [':s' => $statusId]);
            $db->execute(
                'UPDATE tasks SET completed_at = ' . ($isDone ? 'COALESCE(completed_at, NOW())' : 'NULL') . ' WHERE id = :id AND tenant_id = :t',
                [':id' => $taskId, ':t' => $tenantId]
            );

            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        return $this->tasks->findOrFail($taskId, $tenantId);
    }

    private function renumber(int $tenantId, array $orderedIds): void
    {
        $db = Database::instance();
        foreach ($orderedIds as $i => $id) {
            $db->execute(
                'UPDATE tasks SET sort_order = :o WHERE id = :id AND tenant_id = :t',
                [':o' => $i, ':id' => $id, ':t' => $tenantId]
            );
        }
    }

    private function assertStatusBelongs(int $tenantId, int $projectId, int $statusId): void
    {
        $ok = Database::instance()->fetchColumn(
            'SELECT 1 FROM task_statuses WHERE id = :s AND tenant_id = :t AND (project_id = :p OR project_id IS NULL)',
            [':s' => $statusId, ':t' => $tenantId, ':p' => $projectId]
        );
        if (!$ok) {
            throw ServiceException::unprocessable('Target status/column does not belong to this project');
        }
    }

    // ---- Per-task Materials ----------------------------------------------
    public function listMaterials(int $tenantId, int $taskId): array
    {
        $this->tasks->findOrFail($taskId, $tenantId);
        return Database::instance()->fetchAll(
            'SELECT tm.*, mc.code AS material_code FROM task_materials tm
               LEFT JOIN material_catalog mc ON mc.id = tm.material_id
              WHERE tm.tenant_id = :t AND tm.task_id = :k ORDER BY tm.id DESC',
            [':t' => $tenantId, ':k' => $taskId]
        );
    }

    public function addMaterial(int $tenantId, int $taskId, ?int $userId, array $in): array
    {
        $this->tasks->findOrFail($taskId, $tenantId);
        $name = trim((string)($in['item_name'] ?? ''));
        if ($name === '' && !empty($in['material_id'])) {
            $name = (string)Database::instance()->fetchColumn('SELECT name FROM material_catalog WHERE id = :id AND tenant_id = :t', [':id' => (int)$in['material_id'], ':t' => $tenantId]);
        }
        if ($name === '') { throw ServiceException::unprocessable('Material name is required'); }
        $id = $this->taskMaterials->create([
            'tenant_id'   => $tenantId,
            'task_id'     => $taskId,
            'material_id' => $in['material_id'] ?? null,
            'item_name'   => $name,
            'unit'        => $in['unit'] ?? null,
            'quantity'    => round((float)($in['quantity'] ?? 0), 3),
            'used_date'   => $in['used_date'] ?? null,
            'notes'       => $in['notes'] ?? null,
            'created_by'  => $userId,
        ]);
        return $this->taskMaterials->findOrFail($id, $tenantId);
    }

    public function deleteMaterial(int $tenantId, int $id): void
    {
        $this->taskMaterials->findOrFail($id, $tenantId);
        $this->taskMaterials->delete($id, $tenantId);
    }

    // ---- Per-task Labour --------------------------------------------------
    public function listLabour(int $tenantId, int $taskId): array
    {
        $this->tasks->findOrFail($taskId, $tenantId);
        return Database::instance()->fetchAll(
            'SELECT tl.*, e.employee_code FROM task_labour tl
               LEFT JOIN employees e ON e.id = tl.employee_id
              WHERE tl.tenant_id = :t AND tl.task_id = :k ORDER BY tl.id DESC',
            [':t' => $tenantId, ':k' => $taskId]
        );
    }

    public function addLabour(int $tenantId, int $taskId, ?int $userId, array $in): array
    {
        $this->tasks->findOrFail($taskId, $tenantId);
        $name = trim((string)($in['worker_name'] ?? ''));
        $trade = $in['trade'] ?? null;
        if (($name === '' || $trade === null) && !empty($in['employee_id'])) {
            $emp = Database::instance()->fetch('SELECT name, designation FROM employees WHERE id = :id AND tenant_id = :t', [':id' => (int)$in['employee_id'], ':t' => $tenantId]);
            if ($emp) { if ($name === '') $name = (string)$emp['name']; if ($trade === null) $trade = $emp['designation']; }
        }
        if ($name === '') { throw ServiceException::unprocessable('Worker name is required'); }
        $id = $this->taskLabour->create([
            'tenant_id'   => $tenantId,
            'task_id'     => $taskId,
            'employee_id' => $in['employee_id'] ?? null,
            'worker_name' => $name,
            'trade'       => $trade,
            'headcount'   => max(1, (int)($in['headcount'] ?? 1)),
            'hours'       => round((float)($in['hours'] ?? 0), 2),
            'work_date'   => $in['work_date'] ?? null,
            'notes'       => $in['notes'] ?? null,
            'created_by'  => $userId,
        ]);
        return $this->taskLabour->findOrFail($id, $tenantId);
    }

    public function deleteLabour(int $tenantId, int $id): void
    {
        $this->taskLabour->findOrFail($id, $tenantId);
        $this->taskLabour->delete($id, $tenantId);
    }
}
