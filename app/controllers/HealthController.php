<?php
declare(strict_types=1);

namespace App\Controllers;

use Core\Controller;
use Core\Database;
use Core\Request;
use Core\Response;

/**
 * Liveness/health endpoint. Confirms the app boots and (optionally) the DB is
 * reachable, returning the standard JSON envelope.
 */
final class HealthController extends Controller
{
    public function index(Request $request): void
    {
        $db = 'skipped';
        try {
            Database::instance()->fetchColumn('SELECT 1');
            $db = 'ok';
        } catch (\Throwable $e) {
            $db = 'unavailable';
        }

        Response::success([
            'status'  => 'ok',
            'service' => 'construction-saas',
            'db'      => $db,
            'time'    => date('c'),
        ]);
    }
}
