<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\EstimationService;
use Core\Controller;
use Core\Request;
use Core\Response;

final class EstimateController extends Controller
{
    private EstimationService $service;

    public function __construct()
    {
        $this->service = new EstimationService();
    }

    /** POST /api/estimates/calculate — compute breakdown without saving. */
    public function calculate(Request $request): void
    {
        $this->guard(function () use ($request) {
            $breakdown = $this->service->calculate((int)$request->tenantId(), $request->all());
            Response::success($breakdown);
        });
    }

    /** GET /api/estimates */
    public function index(Request $request): void
    {
        $this->guard(function () use ($request) {
            Response::success($this->service->list((int)$request->tenantId()));
        });
    }

    /** GET /api/estimates/{id} */
    public function show(Request $request): void
    {
        $this->guard(function () use ($request) {
            Response::success($this->service->get((int)$request->tenantId(), (int)$request->param('id')));
        });
    }

    /** POST /api/estimates */
    public function store(Request $request): void
    {
        $data = $this->validate($request, [
            'title'      => 'required|string|max:180',
            'line_items' => 'required|array',
        ]);
        if ($data === null) {
            return;
        }
        $this->guard(function () use ($request) {
            $estimate = $this->service->save((int)$request->tenantId(), $this->userId($request), $request->all());
            Response::success($estimate, [], 201);
        });
    }

    /** POST /api/estimates/{id}/version */
    public function version(Request $request): void
    {
        $data = $this->validate($request, ['line_items' => 'required|array']);
        if ($data === null) {
            return;
        }
        $this->guard(function () use ($request) {
            $estimate = $this->service->createVersion(
                (int)$request->tenantId(),
                (int)$request->param('id'),
                $this->userId($request),
                $request->all()
            );
            Response::success($estimate, [], 201);
        });
    }

    /** DELETE /api/estimates/{id} */
    public function destroy(Request $request): void
    {
        $this->guard(function () use ($request) {
            $this->service->delete((int)$request->tenantId(), (int)$request->param('id'));
            Response::success(['message' => 'Estimate deleted']);
        });
    }

    private function userId(Request $request): ?int
    {
        $u = $request->user();
        return $u ? (int)$u['id'] : null;
    }
}
