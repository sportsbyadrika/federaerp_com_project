<?php
declare(strict_types=1);

namespace App\Middleware;

use Core\Auth;
use Core\Request;

/**
 * Injects the tenant_id (= organisation_id) into the request context so every
 * downstream service/query is scoped to the caller's organisation.
 *
 * Super Admin (org 111111) is NOT auto-scoped: services check isSuperAdmin()
 * and may operate across tenants through admin-scoped endpoints only.
 */
final class TenantScope
{
    public function handle(Request $request): bool
    {
        $user = Auth::user();
        if ($user !== null) {
            $request->setContext('tenant_id', (int)$user['organisation_id']);
        }
        return true;
    }
}
