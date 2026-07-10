<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\CurrencyService;
use Core\Controller;
use Core\Request;
use Core\Response;

final class CurrencyController extends Controller
{
    private CurrencyService $service;

    public function __construct()
    {
        $this->service = new CurrencyService();
    }

    public function index(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->list((int)$request->tenantId())));
    }

    /** GET /api/settings — default currency for the tenant. */
    public function settings(Request $request): void
    {
        $this->guard(fn() => Response::success(['currency' => $this->service->default((int)$request->tenantId())]));
    }

    public function store(Request $request): void
    {
        $data = $this->validate($request, ['code' => 'required|string|max:8', 'symbol' => 'required|string|max:8']);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->create((int)$request->tenantId(), $request->all()), [], 201));
    }

    public function setDefault(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->setDefault((int)$request->tenantId(), (int)$request->param('id'))));
    }

    public function destroy(Request $request): void
    {
        $this->guard(function () use ($request) {
            $this->service->delete((int)$request->tenantId(), (int)$request->param('id'));
            Response::success(['message' => 'Currency deleted']);
        });
    }
}
