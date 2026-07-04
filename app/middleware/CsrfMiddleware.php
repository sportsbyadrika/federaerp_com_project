<?php
declare(strict_types=1);

namespace App\Middleware;

use Core\Csrf;
use Core\Request;
use Core\Response;

/**
 * Enforces CSRF/token verification on state-changing requests
 * (POST/PUT/PATCH/DELETE). Safe (GET/HEAD) requests pass through.
 */
final class CsrfMiddleware
{
    public function handle(Request $request): bool
    {
        if (!$request->isWrite()) {
            return true;
        }
        if (!Csrf::verify($request)) {
            Response::error('csrf_failed', 'Invalid or missing CSRF token', 419);
            return false;
        }
        return true;
    }
}
