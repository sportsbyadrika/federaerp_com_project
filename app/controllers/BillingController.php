<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\BillingService;
use Core\Controller;
use Core\Request;
use Core\Response;

final class BillingController extends Controller
{
    private BillingService $service;

    public function __construct()
    {
        $this->service = new BillingService();
    }

    public function demandNotes(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->listDemandNotes((int)$request->tenantId(), (int)$request->param('id'))));
    }

    public function createDemandNote(Request $request): void
    {
        $data = $this->validate($request, ['project_id' => 'required|integer', 'amount' => 'required|numeric|min:0']);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->createDemandNote((int)$request->tenantId(), $request->all()), [], 201));
    }

    public function invoices(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->listInvoices((int)$request->tenantId(), (int)$request->param('id'))));
    }

    public function showInvoice(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->getInvoice((int)$request->tenantId(), (int)$request->param('id'))));
    }

    /** POST /api/demand-notes/{id}/invoice */
    public function generateInvoice(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->generateInvoiceFromDemandNote(
            (int)$request->tenantId(),
            (int)$request->param('id'),
            $this->uid($request),
            $request->all()
        ), [], 201));
    }

    /** POST /api/receipts */
    public function recordReceipt(Request $request): void
    {
        $data = $this->validate($request, ['project_id' => 'required|integer', 'amount' => 'required|numeric|min:0.01']);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->recordReceipt((int)$request->tenantId(), $this->uid($request), $request->all()), [], 201));
    }

    /** POST /api/retention/{id}/release */
    public function releaseRetention(Request $request): void
    {
        $amount = $request->input('amount');
        $this->guard(fn() => Response::success($this->service->releaseRetention(
            (int)$request->tenantId(),
            (int)$request->param('id'),
            $amount !== null ? (float)$amount : null
        )));
    }

    /** GET /api/projects/{id}/settlement  (preview) */
    public function settlement(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->settlement((int)$request->tenantId(), (int)$request->param('id'))));
    }

    /** POST /api/projects/{id}/settlement  (finalize + persist) */
    public function finalizeSettlement(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->settlement((int)$request->tenantId(), (int)$request->param('id'), $this->uid($request), true), [], 201));
    }

    private function uid(Request $request): ?int
    {
        $u = $request->user();
        return $u ? (int)$u['id'] : null;
    }
}
