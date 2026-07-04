<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\TaskService;
use Core\Controller;
use Core\Request;
use Core\Response;

final class TaskController extends Controller
{
    private TaskService $service;

    public function __construct()
    {
        $this->service = new TaskService();
    }

    /** GET /api/projects/{id}/board */
    public function board(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->board((int)$request->tenantId(), (int)$request->param('id'))));
    }

    /** POST /api/tasks */
    public function store(Request $request): void
    {
        $data = $this->validate($request, [
            'project_id' => 'required|integer',
            'status_id'  => 'required|integer',
            'title'      => 'required|string|max:200',
        ]);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->create((int)$request->tenantId(), $request->all()), [], 201));
    }

    /** PUT /api/tasks/{id} */
    public function update(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->update((int)$request->tenantId(), (int)$request->param('id'), $request->all())));
    }

    /** PATCH /api/tasks/{id}/move — drag-and-drop persistence. */
    public function move(Request $request): void
    {
        $data = $this->validate($request, [
            'status_id'  => 'required|integer',
            'sort_order' => 'required|integer|min:0',
        ]);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->move(
            (int)$request->tenantId(),
            (int)$request->param('id'),
            (int)$data['status_id'],
            (int)$data['sort_order']
        )));
    }

    /** DELETE /api/tasks/{id} */
    public function destroy(Request $request): void
    {
        $this->guard(function () use ($request) {
            $this->service->delete((int)$request->tenantId(), (int)$request->param('id'));
            Response::success(['message' => 'Task deleted']);
        });
    }
}
