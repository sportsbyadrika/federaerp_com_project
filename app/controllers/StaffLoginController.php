<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\StaffLoginService;
use Core\Controller;
use Core\Request;
use Core\Response;

final class StaffLoginController extends Controller
{
    private StaffLoginService $service;

    public function __construct()
    {
        $this->service = new StaffLoginService();
    }

    /** GET /api/staff/{id}/login */
    public function show(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->get((int)$request->tenantId(), (int)$request->param('id'))));
    }

    /** POST /api/staff/{id}/login — create or update the login (Org Admin). */
    public function save(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->save((int)$request->tenantId(), (int)$request->param('id'), $request->all())));
    }

    /** DELETE /api/staff/{id}/login — revoke the login (Org Admin). */
    public function revoke(Request $request): void
    {
        $this->guard(function () use ($request) {
            $this->service->revoke((int)$request->tenantId(), (int)$request->param('id'));
            Response::success(['message' => 'Login removed']);
        });
    }
}
