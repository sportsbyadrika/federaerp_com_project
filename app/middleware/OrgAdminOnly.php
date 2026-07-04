<?php
declare(strict_types=1);

namespace App\Middleware;

/** Restricts a route to Org Admins (and Super Admin acting through admin flows). */
final class OrgAdminOnly extends RoleMiddleware
{
    protected function allowed(): array
    {
        return ['super_admin', 'org_admin'];
    }
}
