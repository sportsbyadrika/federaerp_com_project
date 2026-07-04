<?php
declare(strict_types=1);

namespace App\Middleware;

use Core\Auth;
use Core\Request;
use Core\Response;

/**
 * Requires an authenticated session. Loads the user into the request context.
 */
final class AuthMiddleware
{
    public function handle(Request $request): bool
    {
        if (!Auth::check()) {
            Response::unauthorized();
            return false;
        }
        $request->setContext('user', Auth::user());
        return true;
    }
}
