<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\QhseService;
use Core\Controller;
use Core\Request;
use Core\Response;

final class QhseController extends Controller
{
    private QhseService $service;

    public function __construct()
    {
        $this->service = new QhseService();
    }

    public function checklists(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->listChecklists((int)$request->tenantId(), (int)$request->param('id'))));
    }

    public function submitChecklist(Request $request): void
    {
        $data = $this->validate($request, ['project_id' => 'required|integer']);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->submitChecklist((int)$request->tenantId(), $this->uid($request), $request->all()), [], 201));
    }

    public function incidents(Request $request): void
    {
        $projectId = $request->query('project_id');
        $this->guard(fn() => Response::success($this->service->listIncidents((int)$request->tenantId(), $projectId ? (int)$projectId : null)));
    }

    public function reportIncident(Request $request): void
    {
        $data = $this->validate($request, ['project_id' => 'required|integer', 'description' => 'required|string']);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->reportIncident((int)$request->tenantId(), $this->uid($request), $request->all()), [], 201));
    }

    private function uid(Request $request): ?int
    {
        $u = $request->user();
        return $u ? (int)$u['id'] : null;
    }
}
