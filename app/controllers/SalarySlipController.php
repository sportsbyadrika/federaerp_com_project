<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\SalarySlipService;
use Core\Controller;
use Core\Request;
use Core\Response;

final class SalarySlipController extends Controller
{
    private SalarySlipService $service;

    public function __construct()
    {
        $this->service = new SalarySlipService();
    }

    /** GET /api/staff/{id}/salary-slips */
    public function index(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->listForStaff((int)$request->tenantId(), (int)$request->param('id'))));
    }

    /** GET /api/salary-slips/{id} */
    public function show(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->get((int)$request->tenantId(), (int)$request->param('id'))));
    }

    /** POST /api/staff/{id}/salary-slips */
    public function store(Request $request): void
    {
        $this->guard(function () use ($request) {
            $payload = array_merge($request->all(), ['staff_id' => (int)$request->param('id')]);
            Response::success($this->service->create((int)$request->tenantId(), $this->uid($request), $payload), [], 201);
        });
    }

    /** DELETE /api/salary-slips/{id} */
    public function destroy(Request $request): void
    {
        $this->guard(function () use ($request) {
            $this->service->delete((int)$request->tenantId(), (int)$request->param('id'));
            Response::success(['message' => 'Salary slip deleted']);
        });
    }

    private function uid(Request $request): ?int
    {
        $u = $request->user();
        return $u ? (int)$u['id'] : null;
    }
}
