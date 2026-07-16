<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\BankService;
use Core\Controller;
use Core\Request;
use Core\Response;

final class BankController extends Controller
{
    private BankService $service;

    public function __construct()
    {
        $this->service = new BankService();
    }

    /** GET /api/bank-accounts/{id}/ledger */
    public function ledger(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->ledger((int)$request->tenantId(), (int)$request->param('id'))));
    }
}
