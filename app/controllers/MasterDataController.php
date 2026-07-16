<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Models\GenericModel;
use App\Services\ServiceException;
use Core\Controller;
use Core\Request;
use Core\Response;

/**
 * Tenant-scoped CRUD for the simpler "master data" entities. The resource is
 * inferred from the URL segment and validated against a whitelist, so every
 * table is fully tenant-isolated with no bespoke controller per entity.
 */
final class MasterDataController extends Controller
{
    /** resource => [table, fillable[], softDelete, required[]] */
    private const RESOURCES = [
        'clients' => [
            'table' => 'clients', 'soft' => true,
            'fillable' => ['tenant_id','name','contact_person','email','phone','gst_number','pan','address','notes'],
            'required' => ['name' => 'required|string|max:160'],
        ],
        'suppliers' => [
            'table' => 'suppliers', 'soft' => true,
            'fillable' => ['tenant_id','name','contact_person','email','phone','gst_number','pan','address','rating'],
            'required' => ['name' => 'required|string|max:160'],
        ],
        'construction-models' => [
            'table' => 'construction_models', 'soft' => true,
            'fillable' => ['tenant_id','name','category','description','is_active'],
            'required' => ['name' => 'required|string|max:120'],
        ],
        'base-rates' => [
            'table' => 'base_rate_configs', 'soft' => true,
            'fillable' => ['tenant_id','model_id','rate_type','item_code','item_name','unit','base_rate','wastage_percent','is_active'],
            'required' => ['rate_type' => 'required|in:material,labour', 'item_code' => 'required|string|max:60', 'item_name' => 'required|string|max:160', 'unit' => 'required|string|max:30'],
        ],
        'materials' => [
            'table' => 'material_catalog', 'soft' => true,
            'fillable' => ['tenant_id','code','name','category','unit','unit_price','reorder_level'],
            'required' => ['code' => 'required|string|max:60', 'name' => 'required|string|max:160', 'unit' => 'required|string|max:30'],
        ],
        'unit-types' => [
            'table' => 'unit_types', 'soft' => false,
            'fillable' => ['tenant_id','name','sort_order'],
            'required' => ['name' => 'required|string|max:40'],
        ],
        'expenditure-types' => [
            'table' => 'expenditure_types', 'soft' => false,
            'fillable' => ['tenant_id','name','sort_order'],
            'required' => ['name' => 'required|string|max:80'],
        ],
        'boq-items' => [
            'table' => 'boq_item_master', 'soft' => true,
            'fillable' => ['tenant_id','project_type','item_code','item_head','description','unit','default_rate','is_active'],
            'required' => ['project_type' => 'required|in:new,renovation,any', 'item_code' => 'required|string|max:60', 'item_head' => 'required|string|max:160'],
            'filters' => ['project_type'],
        ],
        'subcontractors' => [
            'table' => 'subcontractors', 'soft' => true,
            'fillable' => ['tenant_id','name','trade','contact_person','email','phone','gst_number','pan'],
            'required' => ['name' => 'required|string|max:160'],
        ],
        'vehicles' => [
            'table' => 'vehicles_machinery', 'soft' => true,
            'fillable' => ['tenant_id','asset_code','name','asset_type','registration_no','make_model','status','assigned_project_id','purchase_date'],
            'required' => ['asset_code' => 'required|string|max:40', 'name' => 'required|string|max:160'],
        ],
        'employees' => [
            'table' => 'employees', 'soft' => true,
            'fillable' => ['tenant_id','user_id','employee_code','name','designation','employment_type','phone','daily_wage','monthly_salary','join_date','status'],
            'required' => ['employee_code' => 'required|string|max:40', 'name' => 'required|string|max:160'],
        ],
        'staff' => [
            'table' => 'staff_members', 'soft' => true,
            'fillable' => ['tenant_id','staff_code','name','phone','email','staff_type','address','pan','status'],
            'required' => ['staff_code' => 'required|string|max:40', 'name' => 'required|string|max:160', 'staff_type' => 'required|in:office,skilled,unskilled'],
        ],
        'bank-accounts' => [
            'table' => 'bank_accounts', 'soft' => true,
            'fillable' => ['tenant_id','account_label','bank_name','account_number','ifsc','branch_name','opening_balance','opening_balance_date','is_active'],
            'required' => ['account_label' => 'required|string|max:120', 'bank_name' => 'required|string|max:160', 'account_number' => 'required|string|max:60'],
        ],
    ];

    public function index(Request $request): void
    {
        $cfg = $this->resource($request);
        $model = $this->model($cfg);
        // Apply whitelisted query filters (e.g. ?project_type=new).
        $where = [];
        foreach (($cfg['filters'] ?? []) as $col) {
            $val = $request->query($col);
            if ($val !== null && $val !== '') {
                $where[$col] = $val;
            }
        }
        $this->guard(fn() => Response::success($model->forTenant((int)$request->tenantId(), $where, ['order_by' => 'id', 'order_dir' => 'DESC'])));
    }

    public function show(Request $request): void
    {
        $cfg = $this->resource($request);
        $model = $this->model($cfg);
        $this->guard(fn() => Response::success($model->findOrFail((int)$request->param('id'), (int)$request->tenantId())));
    }

    public function store(Request $request): void
    {
        $cfg = $this->resource($request);
        if ($cfg['required']) {
            $data = $this->validate($request, $cfg['required']);
            if ($data === null) return;
        }
        $model = $this->model($cfg);
        $this->guard(function () use ($request, $model) {
            $payload = array_merge($request->all(), ['tenant_id' => (int)$request->tenantId()]);
            $id = $model->create($payload);
            Response::success($model->findOrFail($id, (int)$request->tenantId()), [], 201);
        });
    }

    public function update(Request $request): void
    {
        $cfg = $this->resource($request);
        $model = $this->model($cfg);
        $this->guard(function () use ($request, $model) {
            $id = (int)$request->param('id');
            $model->findOrFail($id, (int)$request->tenantId());
            $payload = $request->all();
            unset($payload['tenant_id'], $payload['id']);
            $model->update($id, (int)$request->tenantId(), $payload);
            Response::success($model->findOrFail($id, (int)$request->tenantId()));
        });
    }

    public function destroy(Request $request): void
    {
        $cfg = $this->resource($request);
        $model = $this->model($cfg);
        $this->guard(function () use ($request, $model) {
            $id = (int)$request->param('id');
            $model->findOrFail($id, (int)$request->tenantId());
            $model->delete($id, (int)$request->tenantId());
            Response::success(['message' => 'Deleted']);
        });
    }

    private function resource(Request $request): array
    {
        // /api/<resource>[/id] -> <resource>
        $segments = explode('/', trim($request->path(), '/'));
        $name = $segments[1] ?? '';
        if (!isset(self::RESOURCES[$name])) {
            throw ServiceException::notFound('Unknown resource');
        }
        return self::RESOURCES[$name];
    }

    private function model(array $cfg): GenericModel
    {
        return new GenericModel($cfg['table'], $cfg['fillable'], softDelete: $cfg['soft']);
    }
}
