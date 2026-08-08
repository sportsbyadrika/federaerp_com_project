<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\PartyLedgerService;
use Core\Controller;
use Core\Request;
use Core\Response;

final class PartyLedgerController extends Controller
{
    private PartyLedgerService $service;

    public function __construct()
    {
        $this->service = new PartyLedgerService();
    }

    /** GET /api/party-ledger/{type}/{id} — type = client | supplier | subcontractor */
    public function show(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->ledger(
            (int)$request->tenantId(),
            (string)$request->param('type'),
            (int)$request->param('id')
        )));
    }
}
