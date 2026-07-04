<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\DocumentService;
use Core\Controller;
use Core\Request;
use Core\Response;

/**
 * Authenticated file-streaming proxy. Uploaded files live OUTSIDE the web root
 * and are ONLY reachable here, after tenant authorization. No direct links.
 *
 *   GET /api/files/document/{id}   -> stream a document version
 *   GET /api/files/photo/{id}      -> stream a site photo
 */
final class FileController extends Controller
{
    private DocumentService $service;

    public function __construct()
    {
        $this->service = new DocumentService();
    }

    public function stream(Request $request): void
    {
        $kind = (string)$request->param('kind');
        $id = (int)$request->param('id');
        $inline = $request->query('download') === null;

        $this->guard(function () use ($request, $kind, $id, $inline) {
            $file = $this->service->resolveForStream((int)$request->tenantId(), $kind, $id);
            Response::stream($file['abs_path'], $file['mime'], $file['download_name'], $inline);
        });
    }
}
