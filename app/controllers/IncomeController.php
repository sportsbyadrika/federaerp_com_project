<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\IncomeService;
use Core\Controller;
use Core\Request;
use Core\Response;

final class IncomeController extends Controller
{
    private IncomeService $service;

    public function __construct()
    {
        $this->service = new IncomeService();
    }

    public function index(Request $request): void
    {
        $projectId = $request->query('project_id');
        $this->guard(fn() => Response::success($this->service->list((int)$request->tenantId(), $projectId ? (int)$projectId : null)));
    }

    public function show(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->get((int)$request->tenantId(), (int)$request->param('id'))));
    }

    public function store(Request $request): void
    {
        $data = $this->validate($request, ['project_id' => 'required|integer', 'amount' => 'required|numeric|min:0', 'income_date' => 'required|date']);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->create((int)$request->tenantId(), $this->uid($request), $request->all()), [], 201));
    }

    public function update(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->update((int)$request->tenantId(), (int)$request->param('id'), $request->all())));
    }

    public function destroy(Request $request): void
    {
        $this->guard(function () use ($request) {
            $this->service->delete((int)$request->tenantId(), (int)$request->param('id'));
            Response::success(['message' => 'Income deleted']);
        });
    }

    private function uid(Request $request): ?int
    {
        $u = $request->user();
        return $u ? (int)$u['id'] : null;
    }
}
