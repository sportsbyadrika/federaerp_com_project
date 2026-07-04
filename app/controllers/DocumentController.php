<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Services\DocumentService;
use Core\Controller;
use Core\Request;
use Core\Response;

final class DocumentController extends Controller
{
    private DocumentService $service;

    public function __construct()
    {
        $this->service = new DocumentService();
    }

    public function index(Request $request): void
    {
        $projectId = $request->query('project_id');
        $this->guard(fn() => Response::success($this->service->listDocuments((int)$request->tenantId(), $projectId ? (int)$projectId : null)));
    }

    public function versions(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->listVersions((int)$request->tenantId(), (int)$request->param('id'))));
    }

    /** POST /api/documents (multipart: file + meta). */
    public function upload(Request $request): void
    {
        if (empty($_FILES['file'])) {
            $this->fail('no_file', 'A file is required', 422);
            return;
        }
        $this->guard(fn() => Response::success(
            $this->service->upload((int)$request->tenantId(), $this->uid($request), $_FILES['file'], $request->all()),
            [], 201
        ));
    }

    public function photos(Request $request): void
    {
        $this->guard(fn() => Response::success($this->service->listPhotos((int)$request->tenantId(), (int)$request->param('id'))));
    }

    /** POST /api/photos (multipart: file[] + project_id). Supports multi-upload. */
    public function uploadPhoto(Request $request): void
    {
        if (empty($_FILES['file'])) {
            $this->fail('no_file', 'At least one photo file is required', 422);
            return;
        }
        $this->guard(function () use ($request) {
            $meta = $request->all();
            $results = [];
            // Normalise single vs multi file inputs.
            $files = $_FILES['file'];
            if (is_array($files['name'])) {
                $count = count($files['name']);
                for ($i = 0; $i < $count; $i++) {
                    $one = [
                        'name' => $files['name'][$i], 'type' => $files['type'][$i],
                        'tmp_name' => $files['tmp_name'][$i], 'error' => $files['error'][$i], 'size' => $files['size'][$i],
                    ];
                    $results[] = $this->service->uploadPhoto((int)$request->tenantId(), $this->uid($request), $one, $meta);
                }
            } else {
                $results[] = $this->service->uploadPhoto((int)$request->tenantId(), $this->uid($request), $files, $meta);
            }
            Response::success($results, [], 201);
        });
    }

    private function uid(Request $request): ?int
    {
        $u = $request->user();
        return $u ? (int)$u['id'] : null;
    }
}
