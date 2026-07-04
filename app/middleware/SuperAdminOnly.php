<?php
declare(strict_types=1);

namespace App\Middleware;

/** Restricts a route to the Super Admin (platform operator, org 111111). */
final class SuperAdminOnly extends RoleMiddleware
{
    protected function allowed(): array
    {
        return ['super_admin'];
    }
}
