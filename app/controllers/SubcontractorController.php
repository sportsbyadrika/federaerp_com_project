<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\RaBillingService;
use Core\Controller;
use Core\Request;
use Core\Response;

final class SubcontractorController extends Controller
{
    private RaBillingService $service;

    public function __construct()
    {
        $this->service = new RaBillingService();
    }

    public function workOrders(Request $request): void
    {
        $projectId = $request->query('project_id');
        $this->guard(fn() => Response::success($this->service->listWorkOrders((int)$request->tenantId(), $projectId ? (int)$projectId : null)));
    }

    public function createWorkOrder(Request $request): void
    {
        $data = $this->validate($request, [
            'subcontractor_id' => 'required|integer',
            'project_id'       => 'required|integer',
            'order_value'      => 'required|numeric|min:0',
        ]);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->createWorkOrder((int)$request->tenantId(), $request->all()), [], 201));
    }

    /** GET /api/work-orders/{id}/ra-bills */
    public function bills(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->listBills((int)$request->tenantId(), (int)$request->param('id'))));
    }

    /** POST /api/work-orders/{id}/ra-bills/preview */
    public function preview(Request $request): void
    {
        $data = $this->validate($request, ['certified_percent' => 'required|numeric|min:0|max:100']);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->compute((int)$request->tenantId(), (int)$request->param('id'), (float)$data['certified_percent'])));
    }

    /** POST /api/work-orders/{id}/ra-bills */
    public function generate(Request $request): void
    {
        $data = $this->validate($request, ['certified_percent' => 'required|numeric|min:0|max:100']);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->generate(
            (int)$request->tenantId(),
            (int)$request->param('id'),
            (float)$data['certified_percent'],
            $request->all()
        ), [], 201));
    }
}
