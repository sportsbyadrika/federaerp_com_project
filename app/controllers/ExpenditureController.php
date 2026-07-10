<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\ExpenditureService;
use Core\Controller;
use Core\Request;
use Core\Response;

final class ExpenditureController extends Controller
{
    private ExpenditureService $service;

    public function __construct()
    {
        $this->service = new ExpenditureService();
    }

    public function index(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->list((int)$request->tenantId(), [
            'scope'      => $request->query('scope'),
            'project_id' => $request->query('project_id'),
        ])));
    }

    public function store(Request $request): void
    {
        $data = $this->validate($request, ['amount' => 'required|numeric|min:0', 'expense_date' => 'required|date']);
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
            Response::success(['message' => 'Expenditure deleted']);
        });
    }

    private function uid(Request $request): ?int
    {
        $u = $request->user();
        return $u ? (int)$u['id'] : null;
    }
}
