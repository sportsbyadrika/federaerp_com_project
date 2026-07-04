<?php
declare(strict_types=1);

namespace App\Middleware;

use Core\Auth;
use Core\Request;
use Core\Response;

/**
 * Role gate. Because middleware are registered as class names, we expose named
 * subclasses for the common gates (Super Admin only, Org Admin+). Fine-grained
 * business RBAC still lives in the service layer per CLAUDE.md.
 */
abstract class RoleMiddleware
{
    /** @return string[] roles allowed to pass */
    abstract protected function allowed(): array;

    public function handle(Request $request): bool
    {
        $role = Auth::role();
        if ($role === null) {
            Response::unauthorized();
            return false;
        }
        if (!in_array($role, $this->allowed(), true)) {
            Response::forbidden('Your role does not permit this action');
            return false;
        }
        return true;
    }
}
