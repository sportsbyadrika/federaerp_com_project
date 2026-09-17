<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\OrganisationService;
use Core\Controller;
use Core\Request;
use Core\Response;

final class OrganisationController extends Controller
{
    private OrganisationService $service;

    public function __construct()
    {
        $this->service = new OrganisationService();
    }

    /** GET /api/organisation — institution settings. */
    public function show(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->get((int)$request->tenantId())));
    }

    /** PUT /api/organisation — update letterhead details (Org Admin). */
    public function update(Request $request): void
    {
        $data = $this->validate($request, ['name' => 'nullable|string|max:160']);
        if ($data === null) return;
        $this->guard(fn() => Response::success($this->service->update((int)$request->tenantId(), $request->all())));
    }

    /** POST /api/organisation/logo — multipart logo upload (Org Admin). */
    public function uploadLogo(Request $request): void
    {
        if (empty($_FILES['file'])) {
            $this->fail('no_file', 'A logo image is required', 422);
            return;
        }
        $this->guard(fn() => Response::success($this->service->saveLogo((int)$request->tenantId(), $_FILES['file'])));
    }

    /** GET /api/organisation/logo — stream the logo (authenticated). */
    public function logo(Request $request): void
    {
        $this->guard(function () use ($request) {
            $f = $this->service->logoForStream((int)$request->tenantId());
            Response::stream($f['abs_path'], $f['mime'], $f['download_name'], true);
        });
    }

    /** POST /api/organisation/image/{kind} — logo|signature|seal upload (Org Admin). */
    public function uploadImage(Request $request): void
    {
        if (empty($_FILES['file'])) {
            $this->fail('no_file', 'An image file is required', 422);
            return;
        }
        $kind = (string)$request->param('kind');
        $this->guard(fn() => Response::success($this->service->saveImage((int)$request->tenantId(), $kind, $_FILES['file'])));
    }

    /** GET /api/organisation/image/{kind} — stream signature/seal/logo (authenticated). */
    public function image(Request $request): void
    {
        $this->guard(function () use ($request) {
            $f = $this->service->imageForStream((int)$request->tenantId(), (string)$request->param('kind'));
            Response::stream($f['abs_path'], $f['mime'], $f['download_name'], true);
        });
    }
}
