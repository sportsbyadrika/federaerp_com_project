<?php
declare(strict_types=1);

/**
 * Route registration. Receives the Router instance.
 * Batch 1 registers the health check + a stub for auth so the shell works.
 * Batch 3 expands this with the full API surface.
 *
 * Middleware stacks (class names, run in order):
 *   [AuthMiddleware, TenantScope]                  -> authenticated + tenant-scoped
 *   [AuthMiddleware, TenantScope, CsrfMiddleware]  -> + CSRF on writes
 */

use Core\Router;
use App\Middleware\AuthMiddleware;
use App\Middleware\TenantScope;
use App\Middleware\CsrfMiddleware;

/** @var Router $router */

$auth  = [AuthMiddleware::class, TenantScope::class];
$write = [AuthMiddleware::class, TenantScope::class, CsrfMiddleware::class];

$router->group('/api', [], function (Router $r) use ($auth, $write) {

    // ---- Public -----------------------------------------------------------
    $r->get('/health', 'HealthController@index');

    // ---- Auth (implemented fully in Batch 3) ------------------------------
    // Public auth endpoints
    $r->post('/auth/login', 'AuthController@login', [CsrfMiddleware::class]);
    $r->post('/auth/register-organisation', 'AuthController@registerOrganisation', [CsrfMiddleware::class]);
    $r->get('/auth/csrf', 'AuthController@csrf');

    // Authenticated auth endpoints
    $r->get('/auth/me', 'AuthController@me', $auth);
    $r->post('/auth/logout', 'AuthController@logout', $write);
    $r->post('/auth/change-password', 'AuthController@changePassword', $write);
});

// Additional module routes are appended here in Batch 3+ (see config/routes/*.php).
foreach (glob(__DIR__ . '/routes/*.php') ?: [] as $moduleRoutes) {
    (require $moduleRoutes)($router, $auth, $write);
}
