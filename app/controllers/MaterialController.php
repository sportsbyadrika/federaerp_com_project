<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\MaterialService;
use Core\Controller;
use Core\Request;
use Core\Response;

final class MaterialController extends Controller
{
    private MaterialService $service;

    public function __construct()
    {
        $this->service = new MaterialService();
    }

    public function requests(Request $request): void
    {
        $projectId = $request->query('project_id');
        $this->guard(fn() => Response::success($this->service->listRequests((int)$request->tenantId(), $projectId ? (int)$projectId : null)));
    }

    public function createRequest(Request $request): void
    {
        $data = $this->validate($request, ['items' => 'required|array']);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->createRequest((int)$request->tenantId(), $this->uid($request), $request->all()), [], 201));
    }

    public function allocate(Request $request): void
    {
        $data = $this->validate($request, ['material_id' => 'required|integer', 'quantity' => 'required|numeric|min:0.001']);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->allocateStock((int)$request->tenantId(), $this->uid($request), $request->all())));
    }

    public function lowInventory(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->lowInventory((int)$request->tenantId())));
    }

    public function purchaseOrders(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->listPurchaseOrders((int)$request->tenantId())));
    }

    public function createPurchaseOrder(Request $request): void
    {
        $data = $this->validate($request, ['items' => 'required|array']);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->createPurchaseOrder((int)$request->tenantId(), $request->all()), [], 201));
    }

    private function uid(Request $request): ?int
    {
        $u = $request->user();
        return $u ? (int)$u['id'] : null;
    }
}
