<?php
declare(strict_types=1);

namespace App\Services;

use Core\Request;

/**
 * Shared helpers for services: resolve the tenant scope for a request and
 * enforce role-based access control in the SERVICE layer (per CLAUDE.md — not
 * just the UI).
 */
abstract class BaseService
{
    /**
     * The tenant_id a request is scoped to. Super Admin may target another org
     * explicitly via ?org_id / body org_id; everyone else is hard-locked to
     * their own organisation_id.
     */
    protected function resolveTenantId(Request $request): int
    {
        $own = $request->tenantId();
        if ($own === null) {
            throw new ServiceException('Not authenticated', 'unauthorized', 401);
        }
        if ($request->isSuperAdmin()) {
            $target = $request->input('org_id') ?? $request->query('org_id');
            if ($target !== null && (int)$target > 0) {
                return (int)$target;
            }
        }
        return $own;
    }

    /** Assert the caller has one of the allowed business roles. */
    protected function assertRole(Request $request, array $allowedRoles): void
    {
        $role = $request->role();
        if ($role === null) {
            throw new ServiceException('Not authenticated', 'unauthorized', 401);
        }
        if (!in_array($role, $allowedRoles, true)) {
            throw ServiceException::forbidden('Your role may not perform this action');
        }
    }

    /** Assert the caller may write within a tenant (admins + relevant staff). */
    protected function assertCanManage(Request $request): void
    {
        $this->assertRole($request, ['super_admin', 'org_admin', 'staff']);
    }

    protected function currentUserId(Request $request): ?int
    {
        $u = $request->user();
        return $u ? (int)$u['id'] : null;
    }
}
