<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\ComplianceService;
use Core\Controller;
use Core\Env;
use Core\Request;
use Core\Response;

final class ComplianceController extends Controller
{
    private ComplianceService $service;

    public function __construct()
    {
        $this->service = new ComplianceService();
    }

    public function permits(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->listPermits((int)$request->tenantId())));
    }

    public function createPermit(Request $request): void
    {
        $data = $this->validate($request, ['permit_name' => 'required|string|max:180']);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->createPermit((int)$request->tenantId(), $this->uid($request), $request->all()), [], 201));
    }

    public function addStatusUpdate(Request $request): void
    {
        $data = $this->validate($request, ['status' => 'required|string|max:40']);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->addStatusUpdate(
            (int)$request->tenantId(), (int)$request->param('id'), $this->uid($request), $data['status'], $request->input('remark')
        )));
    }

    /** GET /api/compliance/alerts — in-app, tenant-scoped. */
    public function alerts(Request $request): void
    {
        $horizon = (int)($request->query('days', 60));
        $this->guard(fn() => Response::success($this->service->upcomingAlerts((int)$request->tenantId(), $horizon)));
    }

    /**
     * GET /api/cron/compliance?token=... — token-guarded, platform-wide.
     * Wired to cPanel Cron. Not behind session auth; protected by CRON_TOKEN.
     */
    public function cronAlerts(Request $request): void
    {
        $token = $request->query('token') ?? $request->header('X-Cron-Token');
        $expected = (string)Env::get('CRON_TOKEN', '');
        if ($expected === '' || !is_string($token) || !hash_equals($expected, $token)) {
            Response::forbidden('Invalid cron token');
            return;
        }
        $this->guard(function () {
            $alerts = $this->service->upcomingAlerts(null, 60);
            $ids = array_map(static fn($a) => (int)$a['deadline_id'], $alerts);
            $this->service->markNotified($ids);
            Response::success(['alerts' => $alerts, 'count' => count($alerts)]);
        });
    }

    private function uid(Request $request): ?int
    {
        $u = $request->user();
        return $u ? (int)$u['id'] : null;
    }
}
