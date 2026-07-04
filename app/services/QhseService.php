<?php
declare(strict_types=1);

namespace App\Services;

use App\Models\GenericModel;
use Core\Database;

/**
 * QHSE: quality/safety checklists (with items) and the incident log.
 */
final class QhseService extends BaseService
{
    private GenericModel $checklists;
    private GenericModel $items;
    private GenericModel $incidents;

    public function __construct()
    {
        $this->checklists = new GenericModel('qhse_checklists', ['tenant_id','project_id','checklist_type','title','inspection_date','inspector_id','score_percent','status','notes']);
        $this->items      = new GenericModel('qhse_checklist_items', ['tenant_id','checklist_id','label','response','remark','sort_order']);
        $this->incidents  = new GenericModel('incidents', ['tenant_id','project_id','reported_by','incident_date','severity','category','description','action_taken','status']);
    }

    public function listChecklists(int $tenantId, int $projectId): array
    {
        $rows = $this->checklists->forTenant($tenantId, ['project_id' => $projectId], ['order_by' => 'inspection_date', 'order_dir' => 'DESC']);
        foreach ($rows as &$c) {
            $c['items'] = $this->items->forTenant($tenantId, ['checklist_id' => (int)$c['id']], ['order_by' => 'sort_order', 'order_dir' => 'ASC']);
        }
        return $rows;
    }

    public function submitChecklist(int $tenantId, ?int $userId, array $input): array
    {
        $rawItems = $input['items'] ?? [];
        // Score = % of "yes" among applicable (non-na) items.
        $applicable = 0; $yes = 0;
        foreach ($rawItems as $it) {
            $resp = $it['response'] ?? 'na';
            if ($resp === 'na') continue;
            $applicable++;
            if ($resp === 'yes') $yes++;
        }
        $score = $applicable > 0 ? round($yes / $applicable * 100, 2) : null;

        $db = Database::instance();
        $db->beginTransaction();
        try {
            $checklistId = $this->checklists->create([
                'tenant_id'      => $tenantId,
                'project_id'     => (int)$input['project_id'],
                'checklist_type' => $input['checklist_type'] ?? 'safety',
                'title'          => (string)($input['title'] ?? 'QHSE Inspection'),
                'inspection_date'=> $input['inspection_date'] ?? date('Y-m-d'),
                'inspector_id'   => $userId,
                'score_percent'  => $score,
                'status'         => $score === null ? 'submitted' : ($score >= 80 ? 'passed' : 'failed'),
                'notes'          => $input['notes'] ?? null,
            ]);
            $order = 0;
            foreach ($rawItems as $it) {
                $this->items->create([
                    'tenant_id' => $tenantId, 'checklist_id' => $checklistId,
                    'label' => (string)($it['label'] ?? 'Item'),
                    'response' => in_array(($it['response'] ?? 'na'), ['yes','no','na'], true) ? $it['response'] : 'na',
                    'remark' => $it['remark'] ?? null, 'sort_order' => $order++,
                ]);
            }
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        $row = $this->checklists->findOrFail($checklistId, $tenantId);
        $row['items'] = $this->items->forTenant($tenantId, ['checklist_id' => $checklistId], ['order_by' => 'sort_order', 'order_dir' => 'ASC']);
        return $row;
    }

    public function listIncidents(int $tenantId, ?int $projectId = null): array
    {
        $where = $projectId ? ['project_id' => $projectId] : [];
        return $this->incidents->forTenant($tenantId, $where, ['order_by' => 'incident_date', 'order_dir' => 'DESC']);
    }

    public function reportIncident(int $tenantId, ?int $userId, array $input): array
    {
        $id = $this->incidents->create([
            'tenant_id'    => $tenantId,
            'project_id'   => (int)$input['project_id'],
            'reported_by'  => $userId,
            'incident_date'=> $input['incident_date'] ?? date('Y-m-d'),
            'severity'     => $input['severity'] ?? 'low',
            'category'     => $input['category'] ?? null,
            'description'  => (string)$input['description'],
            'action_taken' => $input['action_taken'] ?? null,
            'status'       => $input['status'] ?? 'open',
        ]);
        return $this->incidents->findOrFail($id, $tenantId);
    }
}
