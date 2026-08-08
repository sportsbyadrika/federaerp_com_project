<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\FieldService;
use Core\Controller;
use Core\Request;
use Core\Response;

final class FieldController extends Controller
{
    private FieldService $service;

    public function __construct()
    {
        $this->service = new FieldService();
    }

    /** GET /api/field/context — the logged-in field staff's profile + projects. */
    public function context(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->context((int)$request->tenantId(), $this->uid($request))));
    }

    /** GET /api/field/logs — the field staff's own logs. */
    public function myLogs(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->myLogs((int)$request->tenantId(), $this->uid($request))));
    }

    /** POST /api/field/logs — submit a daily log. */
    public function store(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->createLog((int)$request->tenantId(), $this->uid($request), $request->all()), [], 201));
    }

    /** GET /api/field/review — admin review queue (optional ?review_status=). */
    public function review(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->allLogs((int)$request->tenantId(), [
            'review_status' => $request->query('review_status'),
            'project_id'    => $request->query('project_id'),
        ])));
    }

    /** POST /api/field/logs/{id}/review — approve/reject (Org Admin). */
    public function setReview(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->review(
            (int)$request->tenantId(),
            (int)$request->param('id'),
            $this->uid($request),
            (string)$request->input('review_status', 'pending'),
            $request->input('review_note')
        )));
    }

    private function uid(Request $request): int
    {
        $u = $request->user();
        return $u ? (int)$u['id'] : 0;
    }
}
