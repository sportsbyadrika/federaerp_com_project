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

    public function __construct()
    {
        $this->tasks = new GenericModel('tasks', [
            'tenant_id', 'project_id', 'status_id', 'milestone_id', 'title', 'description',
            'assignee_id', 'priority', 'due_date', 'sort_order', 'completed_at',
        ], softDelete: true);
    }

    /** Full board: columns with their ordered task cards. */
    public function board(int $tenantId, int $projectId): array
    {
        $db = Database::instance();
        $statuses = $db->fetchAll(
            'SELECT * FROM task_statuses WHERE tenant_id = :t AND (project_id = :p OR project_id IS NULL) ORDER BY position ASC',
            [':t' => $tenantId, ':p' => $projectId]
        );
        $tasks = $db->fetchAll(
            'SELECT tk.*, u.name AS assignee_name, m.name AS milestone_name
               FROM tasks tk
               LEFT JOIN users u ON u.id = tk.assignee_id
               LEFT JOIN milestones m ON m.id = tk.milestone_id
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
        return ['columns' => $statuses, 'project_id' => $projectId];
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
            'tenant_id'    => $tenantId,
            'project_id'   => $projectId,
            'status_id'    => $statusId,
            'milestone_id' => $input['milestone_id'] ?? null,
            'title'        => (string)$input['title'],
            'description'  => $input['description'] ?? null,
            'assignee_id'  => $input['assignee_id'] ?? null,
            'priority'     => $input['priority'] ?? 'medium',
            'due_date'     => $input['due_date'] ?? null,
            'sort_order'   => $maxOrder + 1,
        ]);
        return $this->tasks->findOrFail($id, $tenantId);
    }

    public function update(int $tenantId, int $id, array $input): array
    {
        $this->tasks->findOrFail($id, $tenantId);
        // Prevent moving via update(); use move() for column changes.
        unset($input['status_id'], $input['sort_order'], $input['tenant_id']);
        $this->tasks->update($id, $tenantId, $input);
        return $this->tasks->findOrFail($id, $tenantId);
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
}
