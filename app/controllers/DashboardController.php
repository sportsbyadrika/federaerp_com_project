<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\DashboardService;
use Core\Controller;
use Core\Request;
use Core\Response;

final class DashboardController extends Controller
{
    private DashboardService $service;

    public function __construct()
    {
        $this->service = new DashboardService();
    }

    /** GET /api/dashboard — returns the aggregate for the caller's role. */
    public function index(Request $request): void
    {
        $this->guard(function () use ($request) {
            if ($request->isSuperAdmin()) {
                Response::success(['role' => 'super_admin', 'metrics' => $this->service->superAdmin()]);
            } else {
                Response::success(['role' => $request->role(), 'metrics' => $this->service->tenant((int)$request->tenantId())]);
            }
        });
    }
}
