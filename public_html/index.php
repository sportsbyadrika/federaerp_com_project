<?php
declare(strict_types=1);

/**
 * Front controller. The ONLY PHP entry point exposed in the web root.
 * Everything else (app/, core/, config/, storage/) lives outside public_html.
 *
 * /api/*  -> JSON REST router
 * /assets -> served directly by the web server (see .htaccess)
 * else    -> the SPA-lite app shell (Vue 3 + Tailwind from CDN)
 */

require dirname(__DIR__) . '/core/bootstrap.php';

use Core\Auth;
use Core\Request;
use Core\Response;
use Core\Router;

Auth::startSession();

$request = new Request();
$path = $request->path();

// API surface --------------------------------------------------------------
if (str_starts_with($path, '/api')) {
    // Send security headers for API responses too.
    if (!headers_sent()) {
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: same-origin');
    }

    $router = new Router();
    (require BASE_PATH . '/config/routes.php');

    try {
        $router->dispatch($request);
    } catch (\Throwable $e) {
        error_log('Fatal dispatch error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
        $debug = \Core\Env::bool('APP_DEBUG', false);
        Response::error('server_error', $debug ? $e->getMessage() : 'An unexpected error occurred', 500);
    }
    exit;
}

// App shell (all non-API, non-asset paths) ----------------------------------
require BASE_PATH . '/app/views/shell.php';
