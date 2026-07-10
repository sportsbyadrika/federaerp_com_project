<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\ProjectService;
use Core\Controller;
use Core\Request;
use Core\Response;

final class ProjectController extends Controller
{
    private ProjectService $service;

    public function __construct()
    {
        $this->service = new ProjectService();
    }

    public function index(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->listProjects((int)$request->tenantId())));
    }

    public function show(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->getProject((int)$request->tenantId(), (int)$request->param('id'))));
    }

    public function store(Request $request): void
    {
        $data = $this->validate($request, ['name' => 'required|string|max:180']);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->createProject((int)$request->tenantId(), $request->all()), [], 201));
    }

    public function update(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->updateProject((int)$request->tenantId(), (int)$request->param('id'), $request->all())));
    }

    public function destroy(Request $request): void
    {
        $this->guard(function () use ($request) {
            $this->service->deleteProject((int)$request->tenantId(), (int)$request->param('id'));
            Response::success(['message' => 'Project deleted']);
        });
    }

    // ---- Statuses / columns ----
    public function statuses(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->listStatuses((int)$request->tenantId(), (int)$request->param('id'))));
    }

    public function createStatus(Request $request): void
    {
        $data = $this->validate($request, ['name' => 'required|string|max:80']);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->createStatus((int)$request->tenantId(), $request->all()), [], 201));
    }

    // ---- Milestones ----
    public function milestones(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->listMilestones((int)$request->tenantId(), (int)$request->param('id'))));
    }

    public function createMilestone(Request $request): void
    {
        $data = $this->validate($request, ['project_id' => 'required|integer', 'name' => 'required|string|max:160']);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->createMilestone((int)$request->tenantId(), $request->all()), [], 201));
    }

    public function certifyMilestone(Request $request): void
    {
        $data = $this->validate($request, ['certified_percent' => 'required|numeric|min:0|max:100']);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->certifyMilestone((int)$request->tenantId(), (int)$request->param('id'), (float)$data['certified_percent'])));
    }

    // ---- Work progress ----
    public function progress(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->listProgress((int)$request->tenantId(), (int)$request->param('id'))));
    }

    public function logProgress(Request $request): void
    {
        $data = $this->validate($request, ['project_id' => 'required|integer']);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->logProgress((int)$request->tenantId(), $this->uid($request), $request->all()), [], 201));
    }

    // ---- Floors ----
    public function floors(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->listFloors((int)$request->tenantId(), (int)$request->param('id'))));
    }

    public function setFloors(Request $request): void
    {
        $data = $this->validate($request, ['floors' => 'required|array']);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->setFloors((int)$request->tenantId(), (int)$request->param('id'), $request->input('floors', []))));
    }

    // ---- BOQ (entry + per-floor lines) ----
    public function boq(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->listBoq((int)$request->tenantId(), (int)$request->param('id'))));
    }

    public function createBoqEntry(Request $request): void
    {
        $data = $this->validate($request, ['item_head' => 'required|string|max:160', 'lines' => 'required|array']);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->saveBoqEntry((int)$request->tenantId(), (int)$request->param('id'), $request->all()), [], 201));
    }

    public function updateBoqEntry(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->updateBoqEntry((int)$request->tenantId(), (int)$request->param('id'), $request->all())));
    }

    public function deleteBoqEntry(Request $request): void
    {
        $this->guard(function () use ($request) {
            $this->service->deleteBoqEntry((int)$request->tenantId(), (int)$request->param('id'));
            Response::success(['message' => 'BOQ item deleted']);
        });
    }

    // ---- Daily site checklists ----
    public function checklists(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->listChecklists((int)$request->tenantId(), (int)$request->param('id'))));
    }

    public function saveChecklist(Request $request): void
    {
        $data = $this->validate($request, ['project_id' => 'required|integer']);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->saveChecklist((int)$request->tenantId(), $this->uid($request), $request->all()), [], 201));
    }

    private function uid(Request $request): ?int
    {
        $u = $request->user();
        return $u ? (int)$u['id'] : null;
    }
}
